import { copyFileSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { discoverPacks } from '../packs/registry.mjs';
import { computeVendorSet, SHARED_SUBDIR } from './vendor.mjs';

// The vendor WRITER (mount/DESIGN.md): converge a consumer's .claudinite/shared/
// to this canon tree's vendor set and advance the stamp — the local half of the
// transactional update. Callers: the adoption flow and an on-demand refresh run
// it from a freshly fetched canon tree against the consumer checkout; the
// nightly's fleet integration performs the equivalent writes over the API.
// Convergence is unconditional and whole-set: shared/ is rebuilt from the set
// (stale files vanish, local edits revert), .claudinite/local_packs/ and
// everything else in the consumer is untouched. Errors abort BEFORE any write —
// the repo keeps running its old snapshot (the transactional contract).
const canonRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export async function applyVendor(targetRoot, { ref = null } = {}) {
  const settingsPath = join(targetRoot, '.claudinite-checks.json');
  if (!existsSync(settingsPath)) {
    return { errors: [{ what: `${targetRoot} has no .claudinite-checks.json`, fix: 'write the pack declaration first (adoption seeds it)' }] };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch (e) {
    return { errors: [{ what: `.claudinite-checks.json is not valid JSON: ${e.message}`, fix: 'fix the JSON syntax, then rerun' }] };
  }
  const declared = Array.isArray(raw.packs) ? raw.packs : [];

  // Skills the canon can't derive: ones the consumer's own local packs require.
  // Only canon-resident names count — a local pack's bundled skills live in the
  // consumer's tree and are never vendored.
  const local = (await discoverPacks({ localRoot: targetRoot })).packs.filter((p) => p.local);
  const extraSkills = [...new Set(local.flatMap((p) => p.skills ?? []))]
    .filter((name) => existsSync(join(canonRoot, 'skills', name)));

  const { files, errors } = await computeVendorSet(declared, { extraSkills });
  if (errors.length) return { errors };

  const sharedDir = join(targetRoot, SHARED_SUBDIR);
  rmSync(sharedDir, { recursive: true, force: true });
  for (const file of files) {
    const dest = join(sharedDir, file);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(canonRoot, file), dest);
  }

  const today = new Date().toISOString().slice(0, 10);
  raw.claudinite = { updated: today, ...(ref ? { ref } : {}) };
  writeFileSync(settingsPath, JSON.stringify(raw, null, 2) + '\n');
  return { files: files.length, stamp: raw.claudinite, errors: [] };
}

// CLI: node <canon>/mount/apply-vendor.mjs [--target <consumer-root>] [--ref <sha>]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const result = await applyVendor(opt('--target') ?? process.cwd(), { ref: opt('--ref') ?? null });
  if (result.errors.length) {
    for (const e of result.errors) console.error(`ERROR: ${e.what}\n  fix: ${e.fix}`);
    process.exit(1);
  }
  console.log(`vendored ${result.files} files into ${SHARED_SUBDIR}; stamp ${JSON.stringify(result.stamp)}`);
}
