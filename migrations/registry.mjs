import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MIGRATIONS_SUBDIR, specFiles, migrationActive } from '../engine/checks/helpers/active-migrations.mjs';
import { MODEL_FAMILIES } from '../engine/scheduler/model-map.mjs';

const dir = dirname(fileURLToPath(import.meta.url));

// The migration specs live in a subfolder, so the mechanism (this registry,
// apply.mjs, the fleet passes, the README) reads cleanly beside them and the
// records are a self-contained set. The sync surface — the subfolder name
// (exported so the retire pass can build a record's repo-relative path
// migrations/active_migrations/<file>), the spec listing, and
// `migrationActive` — lives in the vendored engine lib
// (engine/checks/helpers/active-migrations.mjs) because pack CHECKS consult it and packs import
// only the engine surface (pack-independence); this registry re-exports it so
// canon-side callers keep one import home.
export { MIGRATIONS_SUBDIR, migrationActive };
const specsDir = join(dir, MIGRATIONS_SUBDIR);

// Structural discovery, like packs/ and skills/: every
// migrations/active_migrations/<file>.mjs is a migration spec. Each returned object
// carries its source `file` (basename) alongside the spec fields, so the retire
// pass can name the record to delete.
export async function loadMigrations() {
  const out = [];
  for (const f of specFiles()) {
    const spec = (await import(pathToFileURL(join(specsDir, f)).href)).default;
    out.push({ file: f, ...spec });
  }
  return out;
}

// Read side — "prefer Y, fall back to X": the ordered list of acceptable paths
// for a canonical target (canonical first, then its legacy aliases). A tolerance
// point consults this instead of hardcoding its own LEGACY_* constant, so a
// rename is declared once here and every reader picks it up. Unknown targets
// resolve to just themselves.
export function resolvePath(migrations, canonical) {
  for (const m of migrations) {
    for (const a of m.aliases ?? []) {
      if (a.canonical === canonical) return [a.canonical, ...(a.legacy ?? [])];
    }
  }
  return [canonical];
}

// Write side — "and rename X -> Y": for each alias whose legacy path still
// exists and whose canonical does not, move legacy -> canonical. `exists` and
// `move` are injected so the same logic drives a local checkout (sync fs) or a
// future API applier (async). Idempotent — a no-op once the rename is done.
export async function applyFileAliases(migration, { exists, move }) {
  const moved = [];
  for (const a of migration.aliases ?? []) {
    for (const legacy of a.legacy ?? []) {
      if ((await exists(legacy)) && !(await exists(a.canonical))) {
        await move(legacy, a.canonical);
        moved.push(`${legacy} -> ${a.canonical}`);
      }
    }
  }
  return moved;
}

// Write side — "vendor these pack templates into the repo": for each declared
// materialization {template, dest}, copy the canon template to its destination
// when the dest is missing or has drifted from the template (idempotent; a
// hand-edited copy self-heals on the next pass). `readTemplate` reads from the
// canon (the pack tree / mounted .claudinite), `read`/`write` act on the consumer
// repo — the source and destination roots differ in a consumer, so they are
// distinct injected readers. Gated by the migration's `appliesTo` so it only
// touches repos that ship the pipeline (never the canon repo itself).
export async function applyMaterializations(migration, { readTemplate, read, write }) {
  if (!migration.materialize?.length) return [];
  if (migration.appliesTo && !(await migration.appliesTo(read))) return [];
  const done = [];
  for (const { template, dest } of migration.materialize) {
    const content = await readTemplate(template);
    if (content == null) continue; // template missing (partial mount) — skip, never clobber with nothing
    if ((await read(dest)) === content) continue; // already vendored, unchanged
    await write(dest, content);
    done.push(`${dest} <- ${template}`);
  }
  return done;
}

// Write side — "rewrite these refs in place": for each declared file, apply its
// literal from->to replacements (only those whose `from` is still present),
// writing back when anything changed. Idempotent — a no-op once every `from` is
// gone. Preserves the rest of the file, so per-repo tweaks the template can't
// carry (e.g. an uncommented build_env block) survive. Same `appliesTo` gate.
export async function applyRewrites(migration, { read, write }) {
  if (!migration.rewrite?.length) return [];
  if (migration.appliesTo && !(await migration.appliesTo(read))) return [];
  const done = [];
  for (const { file, replace } of migration.rewrite) {
    const text = await read(file);
    if (text == null) continue;
    let next = text;
    for (const { from, to } of replace ?? []) next = next.split(from).join(to);
    if (next !== text) { await write(file, next); done.push(file); }
  }
  return done;
}

// A migration record MAY carry a machine-readable AGENTIC note (agent-preprocessing
// DESIGN §7, the primitive absorbed from #405): member-side adaptation that no
// script can do — adapting consumer-authored `local/packs/` content to a changed
// engine contract. Shape: `agentic: { model, instructions }`, model a non-`none`
// family. baselining's preprocessing reads this to decide whether a pending note
// needs the agent STAGE (and must therefore hold the stamp) rather than converging
// in code. Returns the validated note, or null when the record carries none;
// throws on a malformed note so a typo fails loudly instead of silently skipping
// agentic work (the #405 correctness risk).
export function migrationAgentic(m) {
  const a = m.agentic;
  if (a === undefined || a === null) return null;
  if (typeof a !== 'object' || Array.isArray(a)) {
    throw new Error(`migration ${m.id}: "agentic" must be an object { model, instructions }`);
  }
  if (!MODEL_FAMILIES.includes(a.model) || a.model === 'none') {
    throw new Error(`migration ${m.id}: agentic.model must be a non-"none" model family (${MODEL_FAMILIES.filter((f) => f !== 'none').join(', ')})`);
  }
  if (typeof a.instructions !== 'string' || a.instructions.trim() === '') {
    throw new Error(`migration ${m.id}: agentic.instructions must be a non-empty string`);
  }
  return { model: a.model, instructions: a.instructions };
}

// The records that carry a valid agentic note — the pending set baselining must
// escalate to an agent rather than apply in code. Stamp-date filtering (which
// notes still apply) is the caller's; this is the agentic gate over that set.
export function agenticMigrations(migrations) {
  return migrations.filter((m) => migrationAgentic(m) !== null);
}

// Retirement — the "smart, not overzealous" guard. A migration is retirable only
// when the whole fleet is proven done AND has been quiet for a full cycle:
//   - the retire pass classified EVERY repo (unknownCount === 0) — an API error
//     must not hide a repo still on the legacy shape;
//   - ZERO repos still carry its legacy shape (pending.get(id) === 0);
//   - the apply pass touched it on NO repo this cycle (appliedThisCycle lacks its
//     id) — so the cycle that converges the last member (or crashes mid-apply)
//     can never also retire; one guaranteed-quiet apply cycle always separates
//     "last application" from "retirement", and a transient false-zero from a
//     mid-run crash/delay can't trigger an irreversible delete;
//   - it landed strictly before today (>= one nightly cycle old); and
//   - it opts into auto-retirement (retire !== 'manual'). A migration whose
//     tolerance still lives inline elsewhere sets retire:'manual' so deleting
//     this record alone can't strand that tolerance.
// YYYY-MM-DD dates compare lexicographically == chronologically. `appliedThisCycle`
// is a Set of migration ids the apply pass wrote to >=1 repo this run (empty when
// the caller has no apply signal — then only the 0-pending/aged/auto guards apply).
export function retirableMigrations(migrations, { pending, unknownCount, today, appliedThisCycle = new Set() }) {
  if (unknownCount > 0) return [];
  return migrations.filter((m) => {
    if ((m.retire ?? 'auto') !== 'auto') return false;
    if ((pending.get(m.id) ?? 0) > 0) return false;
    if (appliedThisCycle.has(m.id)) return false;
    return String(today) > String(m.landed);
  });
}
