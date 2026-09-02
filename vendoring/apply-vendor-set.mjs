import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computeVendorSet, SHARED_SUBDIR } from './compute-vendor-set.mjs';
import { removeTree } from '../engine/remove-tree.mjs';
import { settingsPath, SETTINGS_FILE } from '../engine/settings-file.mjs';
import { installedVersions, withInstalledVersions } from '../engine/installed-versions.mjs';
import { versionAbove } from '../engine/version.mjs';

// The vendor WRITER (vendoring/DESIGN.md): converge a consumer's .claudinite/shared/
// to this canon tree's vendor set and advance the stamp — the local half of the
// transactional update. Callers: the adoption flow and an on-demand refresh run
// it from a freshly fetched canon tree against the consumer checkout; the
// nightly's fleet integration performs the equivalent writes over the API.
// Convergence is unconditional and whole-set: shared/ is rebuilt from the set
// (stale files vanish, local edits revert), .claudinite/local/packs/ and
// everything else in the consumer is untouched. Errors abort BEFORE any write —
// the repo keeps running its old snapshot (the transactional contract).
//
// Convergence is direction-blind (copy-if-different), so a canon checkout behind
// main would silently REWIND the member's whole corpus and stamp it newer (#328).
// Two guards refuse that before any write. The rewind guard compares the target's
// INSTALLED versions against the ones this checkout would give it and refuses when
// anything the member holds is newer — it asked the same question of a stamped ref's
// ancestry until #1252 deleted the ref, and this needs no git history at all, so it
// holds on a rootless canon tree (bootstrap's fetched snapshot) as well. The second
// guard is the caller's own claim: a passed --ref must equal the checkout's HEAD,
// which only a tree carrying git metadata can answer.
const canonRoot = dirname(dirname(fileURLToPath(import.meta.url))); // <canon>/vendoring/ — canon-internal, never vendored (#385)

// All git use is LOCAL introspection of the canon checkout (rev-parse reads the
// object db — no network, no credential); the remote-head
// comparison the guards can't make locally is the worker's, over MCP. Git
// discovers .git by walking UP, and a VENDORED copy of this file runs inside
// the consumer's own repo (.claudinite/shared/engine/vendoring/) — where git would answer
// with the CONSUMER's HEAD — so only a checkout whose toplevel is the canon
// root itself speaks for the canon; anything else is treated as rootless.
const git = (...args) => execFileSync('git', args, { cwd: canonRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
const gitHead = () => {
  try {
    if (realpathSync(git('rev-parse', '--show-toplevel')) !== realpathSync(canonRoot)) return null;
    return git('rev-parse', 'HEAD');
  } catch { return null; }
};

export async function applyVendor(targetRoot, { ref = null } = {}) {
  const settingsFile = settingsPath(targetRoot);
  const settingsName = basename(settingsFile);
  if (!existsSync(settingsFile)) {
    return { errors: [{ what: `${targetRoot} has no ${SETTINGS_FILE}`, fix: 'write the pack declaration first (adoption seeds it)' }] };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(settingsFile, 'utf8'));
  } catch (e) {
    return { errors: [{ what: `${settingsName} is not valid JSON: ${e.message}`, fix: 'fix the JSON syntax, then rerun' }] };
  }
  const declared = Array.isArray(raw.packs) ? raw.packs : [];
  const installed = installedVersions(raw);

  // A passed `--ref` must be the checkout it claims to be. The ref is no longer
  // stamped anywhere (#1252), so this is all that is left of the caller-supplied
  // provenance: an assertion about the tree these files are being copied out of.
  const head = gitHead();
  if (head && ref && ref !== head) {
    return { errors: [{ what: `--ref ${ref} does not match this canon checkout's HEAD (${head})`, fix: 'sync the checkout to the verified remote head (git fetch && git merge --ff-only), then rerun with that head as --ref' }] };
  }

  // The target's own versions decide which migration records this set carries: the
  // records above what it has installed, none on an up-to-date repo. A repo that has
  // never been vendored carries none and gets the date-window behaviour instead.
  const { files, errors, engineVersion, packVersions } = await computeVendorSet(declared, { installed });
  if (errors.length) return { errors };

  // THE ANTI-REWIND GUARD (#328), stated over the versions rather than over a ref.
  // The failure it exists for is a canon checkout BEHIND what the member already
  // has: converging from it hands the member an older corpus, silently, and the
  // next run reads that as drift to repair. It asked this as "is the member's
  // stamped ref an ancestor of my HEAD", which needed a ref stamped in the file
  // and full history in the checkout; #1252 deleted the ref, and the question it
  // was a proxy for is answerable directly — is anything the member holds NEWER
  // than what this checkout would give it.
  const behind = [];
  if (installed.engineVersion !== null && versionAbove(installed.engineVersion, engineVersion)) {
    behind.push(`engine ${installed.engineVersion} → ${engineVersion}`);
  }
  for (const [id, version] of Object.entries(installed.packVersions)) {
    const there = packVersions[id];
    if (there !== undefined && versionAbove(version, there)) behind.push(`${id} ${version} → ${there}`);
  }
  if (behind.length) {
    return { errors: [{
      what: `this canon checkout is behind what the target already has (${behind.join('; ')}) — converging would rewind the member (#328)`,
      fix: 'sync the canon checkout to the remote head (git fetch && git merge --ff-only), then rerun',
    }] };
  }

  const sharedDir = join(targetRoot, SHARED_SUBDIR);
  removeTree(sharedDir);
  for (const file of files) {
    const dest = join(sharedDir, file);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(canonRoot, file), dest);
  }

  // WHAT this mount is, and nothing about when it was taken. The datetime and the
  // ref that used to ride along said only when the last FULL re-vendor happened,
  // which a member converging nightly never does — so both read as months stale on
  // exactly the healthiest members, and every reader that judged freshness by them
  // was wrong about the fleet (#1065, #786, deleted in #1252). The versions answer
  // the question all of them were really asking.
  const stamped = withInstalledVersions(raw, { engineVersion, packVersions });
  writeFileSync(settingsFile, JSON.stringify(stamped, null, 2) + '\n');
  return { files: files.length, stamp: installedVersions(stamped), errors: [] };
}

// CLI: node <canon>/vendoring/apply-vendor-set.mjs [--target <consumer-root>] [--ref <sha>]
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
