import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPacks, resolveDeclaredPacks, packEntryId, SHARED_SUBDIR } from '../packs/registry.mjs';

// The vendor-set computation for the vendored mount (DESIGN.md): given a repo's
// pack declaration, the minimal corpus file set that repo persists under
// SHARED_SUBDIR — canon-relative paths, mirroring exactly what a future
// submodule mounted at that same root would place there. Always computed
// against the canon tree THIS module ships in — the nightly runs it from the
// home checkout, an on-demand refresh from the tree it just fetched — so the
// set and the content can never come from different snapshots.
const canonRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// Re-exported for the writers (the nightly update pass, an on-demand refresh):
// the consumer-side root the set materializes under.
export { SHARED_SUBDIR };

// The corpus index a consumer imports from its own CLAUDE.md.
export const INDEX_FILE = 'CLAUDE.md';

// The engine is discovered structurally, never listed file-by-file: these
// roots vendor wholesale, so a new engine file ships with no edit here.
// Excluded within them: tests (*.test.mjs and test/ directories) and *.md —
// docs at the engine roots are canon-maintainer reference, read upstream when
// needed, while a pack's or skill's .md files are the payload and ride their
// own directories below.
export const ENGINE_DIR_ROOTS = ['checks', 'mount'];

// The pack/skill machinery: the non-test .mjs files sitting directly at these
// roots (registry, prose loader, env, skill mounter — whatever lives there).
export const MACHINERY_ROOTS = ['packs', 'skills'];

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
// strings and/or entry objects). extraSkills: skills the canon can't derive —
// e.g. ones a member's own local packs require. Returns { files, errors }:
// sorted canon-relative paths, and { what, fix } diagnostics. Ids naming no
// canon pack (a consumer's local packs, or a typo the runner's settings
// validation already flags) are skipped without error; per-user preferences
// are deliberately absent — they are never vendored (DESIGN.md).
export async function computeVendorSet(declaredEntries, { extraSkills = [] } = {}) {
  const files = new Set();
  const errors = [];

  if (existsSync(join(canonRoot, INDEX_FILE))) files.add(INDEX_FILE);
  else errors.push({ what: `${INDEX_FILE} is missing from the canon tree`, fix: 'restore the corpus index' });
  for (const root of ENGINE_DIR_ROOTS) walk(root, files, errors, { engine: true });
  for (const root of MACHINERY_ROOTS) {
    let entries;
    try {
      entries = readdirSync(join(canonRoot, root), { withFileTypes: true });
    } catch (e) {
      errors.push({ what: `${root} is not a readable directory in the canon tree: ${e.message}`, fix: `restore ${root}` });
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.mjs') && !isTest(entry.name)) files.add(`${root}/${entry.name}`);
    }
  }

  const packs = await loadPacks();
  const byId = new Map(packs.map((p) => [p.id, p]));
  const ids = [];
  for (const entry of resolveDeclaredPacks(declaredEntries ?? [], packs)) {
    const id = packEntryId(entry);
    if (id !== undefined && byId.has(id) && !ids.includes(id)) ids.push(id);
  }
  for (const id of ids) walk(`packs/${id}`, files, errors);

  const requiredBy = new Map(extraSkills.map((s) => [s, ['extraSkills']]));
  for (const id of ids) {
    for (const skill of byId.get(id).skills ?? []) {
      requiredBy.set(skill, [...(requiredBy.get(skill) ?? []), id]);
    }
  }
  for (const [skill, requirers] of [...requiredBy].sort(([a], [b]) => a.localeCompare(b))) {
    if (existsSync(join(canonRoot, 'skills', skill))) walk(`skills/${skill}`, files, errors);
    else errors.push({
      what: `skill "${skill}" (required by ${requirers.join(', ')}) is missing from skills/`,
      fix: 'restore the skill, or drop it from the requirer\'s skills list',
    });
  }

  return { files: [...files].sort(), errors };
}
