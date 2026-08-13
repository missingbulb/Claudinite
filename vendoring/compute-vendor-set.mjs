import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPacks, resolveDeclaredPacks, packEntryId, SHARED_SUBDIR, PACK_DIRECTORY_FILE } from '../engine/pack_loader/pack-registry.mjs';
import { relativeImports, resolveRelative, ENGINE_DIR_ROOTS } from '../engine/checks/helpers/module-imports.mjs';
import { migrationApplies, MIGRATIONS_SUBDIR } from '../engine/checks/helpers/active-migrations.mjs';
import { ENGINE_VERSION } from '../engine/version.mjs';

// The vendor-set computation for the vendored mount (DESIGN.md): given a repo's
// pack declaration, the minimal corpus file set that repo persists under
// SHARED_SUBDIR — canon-relative paths, mirroring exactly what a future
// submodule mounted at that same root would place there. Always computed
// against the canon tree THIS module ships in — the nightly runs it from the
// home checkout, an on-demand refresh from the tree it just fetched — so the
// set and the content can never come from different snapshots.
const canonRoot = dirname(dirname(fileURLToPath(import.meta.url))); // <canon>/vendoring/ — canon-internal, never vendored (#385)

// Re-exported for the writers (the nightly update pass, an on-demand refresh):
// the consumer-side root the set materializes under.
export { SHARED_SUBDIR };

// The engine is discovered structurally, never listed file-by-file: the engine
// root vendors wholesale (a new engine file ships with no edit here). The list
// lives in the engine lib (engine/checks/helpers/module-imports.mjs) — the same
// surface the pack-independence barrier confines pack imports to, so "what a
// pack may import" and "what every consumer carries" can never drift apart —
// re-exported here as the vendor-set contract (DESIGN.md). engine/ carries no
// tests (they live in engine-tests/, mirroring its structure — #385), so the
// engine walk is a plain copy minus *.md — engine docs are canon-maintainer
// reference, read upstream when needed, while a pack's .md files are the
// payload and ride its directory below (pack tests live in packs-tests/, not in packs/).
export { ENGINE_DIR_ROOTS };

const isTest = (name) => name.endsWith('.test.mjs');

// The exception to "engine .md is maintainer-reference, not vendored": a few engine
// .md files are OPERATIONAL — a consumer session reads them from its OWN mount at
// runtime, so they MUST ship. `executor.md` is the executor routine's operating
// instructions; the label-wired routine's thin-pointer prompt points at
// `.claudinite/shared/engine/scheduler/executor.md`, so if it is stripped, every
// consumer's executor session boots with no instructions and can drain nothing
// (the fleet-wide executor-broken finding). `deliver-pr.md` is the agent-lane
// delivery procedure the merged-pr task worker files link to — stripped, every
// such task.md points at a hole and the subagent improvises its own landing.
// Whitelisted by canon-relative path so the blanket .md exclusion still drops
// the maintainer docs beside them.
const VENDORED_ENGINE_DOCS = new Set(['engine/scheduler/executor.md', 'engine/scheduler/deliver-pr.md']);

// The migration records a consumer carries in its OWN mount, so the update flows read
// the notes locally and needs no canon checkout in session. Records live under the
// flow that owns them — `engine/migrations/<record>/` and
// `packs/<pack>/migrations/<record>/` — so they ride the engine and pack walks
// below rather than a collection of their own; what those walks need from here is
// the one exception to "vendor the whole tree": FETCHING decides relevance, and
// only the folders landed within the recency window (recordDirIsRecent, the same
// predicate migrationActive tolerates by) ship in a mount. An up-to-date consumer
// carries few-to-none — it already applied them — and a dormant project catches up
// from the fresh canon clone the update runner fetches, where every record ever landed is
// present. Vendoring these also activates `migrationActive()` legacy-tolerance in
// consumer checks — the mount's records ARE what that check tolerates, because
// both consult one predicate (`migrationApplies`).
//
// FETCHING IS VERSION-GATED (owner decision 7): a record ships while the target
// repo sits below the version its change took effect at, so an up-to-date repo
// carries none and a lagging one carries exactly its gap. A repo whose stamp says
// nothing about that flow — one that has not converged since versions existed, or
// a fresh adoption — falls back to the landed-date window, which is the behaviour
// every member had before this. The predicate lives in the engine helper, not
// here, so what a mount receives and what a check tolerates cannot drift.
//
// Riding the pack walk means a pack's records reach only the members that DECLARE
// that pack, which is the split's point — the tolerance a record activates is for
// that pack's own checks, which do not run anywhere else. It is not how a record
// gets APPLIED: the update flows apply from the fresh canon clone, where every record
// ever landed is present whatever the member declares, so a record that seeds a
// pack into a member not yet running it still lands.
const isRecordDir = (name) => /^\d{4}-\d{2}-\d{2}-/.test(name);
const isRecordOfFlow = (relDir, name) => relDir.endsWith(`/${MIGRATIONS_SUBDIR}`) && isRecordDir(name);

function walk(relDir, files, errors, { engine = false, today, installed = null } = {}) {
  let entries;
  try {
    entries = readdirSync(join(canonRoot, relDir), { withFileTypes: true });
  } catch (e) {
    errors.push({
      what: `${relDir} is not a readable directory in the canon tree: ${e.message}`,
      fix: `restore ${relDir}, or fix what names it (an engine root, a pack.mjs skills list)`,
    });
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      if (engine && entry.name === 'test') continue;
      const rel = `${relDir}/${entry.name}`;
      if (isRecordOfFlow(relDir, entry.name) && !migrationApplies(rel, { installed, today })) continue;
      walk(rel, files, errors, { engine, today, installed });
    } else if (!isTest(entry.name)) {
      const rel = `${relDir}/${entry.name}`;
      // engine .md is canon-maintainer reference and dropped — except the
      // operational whitelist (executor.md) a consumer reads from its own mount.
      if (engine && entry.name.endsWith('.md') && !VENDORED_ENGINE_DOCS.has(rel)) continue;
      files.add(rel);
    }
  }
}

// declaredEntries: the raw `packs` array from .claudinite-checks.json (id
// strings and/or entry objects). Returns { files, errors }:
// sorted canon-relative paths, and { what, fix } diagnostics. Ids naming no
// canon pack (a consumer's local packs, or a typo the runner's settings
// validation already flags) are skipped without error. A pack's
// bundled skills (<pack>/skills/) ride its directory walk — there is no
// separate skills collection to union (#385). `installed` is the target repo's
// version stamp ({ engineVersion, packVersions }) — the gap the migration records
// are fetched over; omit it (a repo with no stamp) and fetching falls back to the
// landed-date window, for which `today` (YYYY-MM-DD) pins a deterministic set.
export async function computeVendorSet(declaredEntries, { today, installed = null } = {}) {
  const files = new Set();
  const errors = [];

  for (const root of ENGINE_DIR_ROOTS) walk(root, files, errors, { engine: true, today, installed });

  // The full pack directory ships with EVERY mount, whatever the declaration:
  // the set otherwise carries only the declared packs, so without this catalog
  // a member session has no view of what else it could adopt (#726). Missing
  // is canon-side breakage — a mount silently without it would blind the whole
  // fleet to the catalog — so it aborts the converge like any other set error.
  if (existsSync(join(canonRoot, PACK_DIRECTORY_FILE))) files.add(PACK_DIRECTORY_FILE);
  else errors.push({ what: `${PACK_DIRECTORY_FILE} is missing from the canon tree`, fix: 'regenerate it (its drift test in packs-tests/ renders it from the pack manifests) and commit it' });

  const packs = await loadPacks();
  const byId = new Map(packs.map((p) => [p.id, p]));
  const ids = [];
  for (const entry of resolveDeclaredPacks(declaredEntries ?? [], packs)) {
    const id = packEntryId(entry);
    if (id !== undefined && byId.has(id) && !ids.includes(id)) ids.push(id);
  }
  for (const id of ids) walk(`packs/${id}`, files, errors, { today, installed });

  // Coherence guard: the set must be import-closed — every relative import in
  // every .mjs it carries resolves to a file it also carries. Structural
  // discovery plus the requires closure make that true by construction while
  // the corpus honors pack-independence (a pack imports only its own files and
  // the engine surface, both always in the set); a violation is canon-side
  // breakage, reported here so convergence aborts BEFORE any write (the
  // transactional contract) instead of the flipped member crashing on a
  // missing module — the failure the gated flip's pilot abort surfaced.
  const inSet = new Set(files);
  for (const file of inSet) {
    if (!file.endsWith('.mjs')) continue;
    let src;
    try { src = readFileSync(join(canonRoot, file), 'utf8'); } catch { continue; }
    for (const { spec } of relativeImports(src)) {
      const resolved = resolveRelative(file, spec, (p) => existsSync(join(canonRoot, p)));
      if (!resolved) {
        errors.push({
          what: `${file} imports "${spec}", which resolves to no file in the canon tree`,
          fix: 'fix the import specifier, or restore the file it names',
        });
      } else if (!inSet.has(resolved)) {
        errors.push({
          what: `${file} imports "${spec}" → ${resolved}, which the vendor set does not carry — a pack imports only its own files and the engine surface (pack-independence)`,
          fix: 'fix the import to honor pack-independence (declare the dependency and contribute configuration, or move the helper into engine/checks/helpers)',
        });
      }
    }
  }

  // The versions this set is made of, returned beside it so the writer can stamp
  // them in the same pass that lays the files down (DESIGN §2, §3.6). Computed
  // here rather than re-derived by the writer for the reason the set itself is:
  // the numbers and the content then come from one snapshot by construction. A
  // pack with no `version` contributes no entry — that is a local pack, which is
  // repo-owned and versionless, and an "unknown" version must stay absent rather
  // than become a 0 nothing downstream could tell from a real one.
  const packVersions = {};
  for (const id of ids) {
    const v = byId.get(id)?.version;
    if (v !== undefined) packVersions[id] = v;
  }

  return { files: [...files].sort(), errors, engineVersion: ENGINE_VERSION, packVersions };
}
