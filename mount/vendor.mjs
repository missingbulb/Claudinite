import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPacks, resolveDeclaredPacks, packEntryId } from '../packs/registry.mjs';

// The vendor-set computation for the vendored mount (DESIGN.md): given a repo's
// pack declaration, the minimal file set that repo persists from the corpus.
// Always computed against the canon tree THIS module ships in — the nightly runs
// it from the home checkout, an on-demand refresh runs it from the tree it just
// fetched — so the set and the content can never come from different snapshots.
const canonRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// Everything a consumer session exercises regardless of which packs it declares:
// the corpus index, the checks engine and its hooks, the pack/skill machinery,
// and the mount itself. Canon-internal trees (routines/, docs/, .github/, the
// maintainer docs) stay out — they run centrally, never in a consumer.
export const ENGINE_FILES = [
  'CLAUDE.md',
  'checks/README.md',
  'checks/run.mjs',
  'checks/stop-hook.mjs',
  'checks/pretooluse-guard.mjs',
  'packs/README.md',
  'packs/registry.mjs',
  'packs/load-active-prose.mjs',
  'packs/env.mjs',
  'skills/README.md',
  'skills/registry.mjs',
  'skills/mount-skills.mjs',
  'mount/README.md',
  'mount/session-start.sh',
  'mount/environment-setup.sh',
  'mount/vendor.mjs',
];

// Directories vendored wholesale: the engine's lib, and the owner preferences
// (per-user files plus their injector — tiny, and the current user is only
// known at session time).
export const ENGINE_DIRS = ['checks/lib', 'preferences'];

// Tests never ship to consumers — the canon's CI is where they run.
const isTest = (name) => name.endsWith('.test.mjs');

function walk(relDir, files, errors) {
  let entries;
  try {
    entries = readdirSync(join(canonRoot, relDir), { withFileTypes: true });
  } catch (e) {
    errors.push({
      what: `${relDir} is not a readable directory in the canon tree: ${e.message}`,
      fix: `restore ${relDir}, or fix what names it (ENGINE_DIRS, a pack.mjs skills list)`,
    });
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, files, errors);
    else if (!isTest(entry.name)) files.add(rel);
  }
}

// declaredEntries: the raw `packs` array from .claudinite-checks.json (id
// strings and/or entry objects). extraSkills: skills the canon can't derive —
// e.g. ones a member's own local packs require. Returns { files, errors }:
// sorted repo-relative paths, and { what, fix } diagnostics. Ids naming no
// canon pack are skipped silently — a local pack has nothing to vendor, and a
// typo is the runner's settings-validity error, not this module's.
export async function computeVendorSet(declaredEntries, { extraSkills = [] } = {}) {
  const files = new Set();
  const errors = [];

  for (const file of ENGINE_FILES) {
    if (existsSync(join(canonRoot, file))) files.add(file);
    else errors.push({
      what: `engine file ${file} is missing from the canon tree`,
      fix: 'restore the file, or update ENGINE_FILES in mount/vendor.mjs',
    });
  }
  for (const dir of ENGINE_DIRS) walk(dir, files, errors);

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
