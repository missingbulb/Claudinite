import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPacks, resolveDeclaredPacks, packEntryId, SHARED_SUBDIR } from '../engine/pack_loader/pack-registry.mjs';
import { relativeImports, resolveRelative, ENGINE_DIR_ROOTS } from '../engine/checks/helpers/module-imports.mjs';

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
// payload and ride its directory below (pack tests are still filtered here).
export { ENGINE_DIR_ROOTS };

const isTest = (name) => name.endsWith('.test.mjs');

function walk(relDir, files, errors, { engine = false } = {}) {
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
      walk(`${relDir}/${entry.name}`, files, errors, { engine });
    } else if (!isTest(entry.name) && !(engine && entry.name.endsWith('.md'))) {
      files.add(`${relDir}/${entry.name}`);
    }
  }
}

// declaredEntries: the raw `packs` array from .claudinite-checks.json (id
// strings and/or entry objects). Returns { files, errors }:
// sorted canon-relative paths, and { what, fix } diagnostics. Ids naming no
// canon pack (a consumer's local packs, or a typo the runner's settings
// validation already flags) are skipped without error; per-user preferences
// are deliberately absent — they are never vendored (DESIGN.md). A pack's
// bundled skills (<pack>/skills/) ride its directory walk — there is no
// separate skills collection to union (#385).
export async function computeVendorSet(declaredEntries) {
  const files = new Set();
  const errors = [];

  for (const root of ENGINE_DIR_ROOTS) walk(root, files, errors, { engine: true });

  const packs = await loadPacks();
  const byId = new Map(packs.map((p) => [p.id, p]));
  const ids = [];
  for (const entry of resolveDeclaredPacks(declaredEntries ?? [], packs)) {
    const id = packEntryId(entry);
    if (id !== undefined && byId.has(id) && !ids.includes(id)) ids.push(id);
  }
  for (const id of ids) walk(`packs/${id}`, files, errors);

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
          fix: 'fix the import to honor pack-independence (declare the dependency and contribute configuration, or move the helper into checks/lib)',
        });
      }
    }
  }

  return { files: [...files].sort(), errors };
}
