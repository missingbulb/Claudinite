import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

// Structural discovery, like packs/ and skills/: every migrations/<file>.mjs
// (except this registry and any *.test.mjs) is a migration spec. Each returned
// object carries its source `file` alongside the spec fields, so the census can
// name the file to delete when it retires.
export async function loadMigrations() {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.mjs') && f !== 'registry.mjs' && !f.endsWith('.test.mjs'))
    .sort();
  const out = [];
  for (const f of files) {
    const spec = (await import(pathToFileURL(join(dir, f)).href)).default;
    out.push({ file: f, ...spec });
  }
  return out;
}

// Sync counterpart to loadMigrations for the CHECK layer: checks run
// synchronously (checks/run.mjs spreads `rule.run(ctx)`, never awaits it) and so
// cannot await the dynamic import loadMigrations uses. `migrationActive(slug)` is
// true while a migration whose file name carries `slug` is still present in this
// directory — a check consults it to know whether an in-flight transition's
// legacy shape is still tolerated. When the census auto-retires the migration
// (deletes the file), this flips to false and the tolerance vanishes with it:
// the resolver pattern, expressed synchronously.
export function migrationActive(slug) {
  try {
    return readdirSync(dir).some(
      (f) => f.endsWith('.mjs') && f !== 'registry.mjs' && !f.endsWith('.test.mjs') && f.includes(slug),
    );
  } catch {
    return false;
  }
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

// Retirement — the "smart, not overzealous" guard. A migration is retirable only
// when the whole fleet is proven done:
//   - the census classified EVERY repo (unknownCount === 0) — an API error must
//     not hide a repo still on the legacy shape;
//   - ZERO repos still carry its legacy shape (pending.get(id) === 0);
//   - it landed strictly before today (>= one nightly cycle, so at least one
//     baselining pass has had a chance to migrate everyone); and
//   - it opts into auto-retirement (retire !== 'manual'). A migration whose
//     tolerance still lives inline elsewhere sets retire:'manual' so deleting
//     this record alone can't strand that tolerance.
// YYYY-MM-DD dates compare lexicographically == chronologically.
export function retirableMigrations(migrations, { pending, unknownCount, today }) {
  if (unknownCount > 0) return [];
  return migrations.filter((m) => {
    if ((m.retire ?? 'auto') !== 'auto') return false;
    if ((pending.get(m.id) ?? 0) > 0) return false;
    return String(today) > String(m.landed);
  });
}
