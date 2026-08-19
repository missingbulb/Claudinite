// The full canon pack corpus, fetched — because the enforcer's own mount does not
// have it.
//
// THE TRAP this exists to avoid. A consumer's `.claudinite/shared/` carries the
// vendor set for the packs that consumer DECLARES, and nothing more: a claudinite-fleet-sheepdog repo
// declaring `basics` + `claudinite-fleet-sheepdog` mounts four packs. Calling `discoverPacks()` from
// inside the mount would therefore hand the fit sweep four fingerprints to test the
// whole fleet against, and every member would come back perfectly fitted — a green
// report produced by looking at almost nothing. That failure is silent by
// construction, which is the worst kind, so the corpus is fetched explicitly and the
// count is reported.
//
// Fetching canon also makes the fingerprints CURRENT rather than as-of the enforcer's
// last baseline. A pack added to canon this week is one the fleet should be measured
// against this week; the enforcer's mount would not carry it at all.
//
// A shallow clone, into a scratch dir, discarded when the process exits. The packs
// are loaded by importing THAT CLONE's pack-registry: `canonRoot` is derived from the
// registry module's own location, so the clone's registry scans the clone's packs/
// while the mount's registry keeps scanning the mount. Nothing here mutates the
// enforcer's checkout.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Below this, the corpus we loaded is not plausibly the canon and a "nothing
// suspected" verdict would be an artifact of the fetch rather than a fact about the
// fleet. The real number is dozens; this is a floor that catches an empty or
// half-cloned tree, not a assertion about corpus size.
const MIN_PLAUSIBLE_PACKS = 5;

// Where canon is served from. A parameter rather than a constant because a fleet on
// GitHub Enterprise has its own host — and because it is what lets this be exercised
// against a real clone in tests without a network.
export const DEFAULT_ORIGIN = 'https://github.com';

// The clone URL, with the token embedded for an https origin (the only kind that
// needs one). Never logged, never returned — callers get the packs, not the
// credential.
function cloneUrl(repo, token, origin) {
  if (!origin.startsWith('https://')) return `${origin}/${repo}.git`;
  return `https://x-access-token:${token}@${origin.slice('https://'.length)}/${repo}.git`;
}

// Returns { packs, dispose } — call dispose() when done to remove the scratch clone.
// Throws on anything that would leave the sweep measuring the fleet against a partial
// corpus: a failed clone, a missing packs/ tree, a manifest that would not load.
export async function loadCanonPacks({ canonRepo, token, ref = null, origin = DEFAULT_ORIGIN } = {}) {
  if (!canonRepo || !canonRepo.includes('/')) {
    throw new Error(`canonRepo ${JSON.stringify(canonRepo)} is not an owner/repo — the fit sweep has no corpus to fingerprint against`);
  }
  const dir = mkdtempSync(join(tmpdir(), 'claudinite-canon-'));
  const dispose = () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* scratch */ } };
  try {
    // Shallow, single-branch, no blobs we don't need: the manifests and the modules
    // they import are all that gets read.
    const args = ['clone', '--depth', '1', '--quiet'];
    if (ref) args.push('--branch', ref);
    args.push(cloneUrl(canonRepo, token, origin), dir);
    try {
      execFileSync('git', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) {
      // The token is in the URL, so the raw git error is not safe to surface whole.
      const stderr = String(e.stderr ?? '').split(token).join('***');
      throw new Error(`cloning canon (${canonRepo}) failed: ${stderr.trim().split('\n').pop() || e.message}`);
    }

    const registry = join(dir, 'engine/pack_loader/pack-registry.mjs');
    if (!existsSync(registry)) {
      throw new Error(`${canonRepo} has no engine/pack_loader/pack-registry.mjs — that is not a Claudinite canon`);
    }
    const { discoverPacks } = await import(pathToFileURL(registry).href);
    // No localRoot: a local pack belongs to one repo and is never fingerprinted.
    const { packs, errors } = await discoverPacks();
    if (errors.length) {
      throw new Error(`canon's pack corpus did not load cleanly (${errors.length} error(s)): ${errors.map((e) => e.what).join('; ')}`);
    }
    if (packs.length < MIN_PLAUSIBLE_PACKS) {
      throw new Error(`only ${packs.length} pack(s) loaded from ${canonRepo} — refusing to sweep the fleet against a corpus that small, `
        + 'because every member would report as fitted for the wrong reason');
    }
    return { packs, dispose };
  } catch (e) {
    dispose();
    throw e;
  }
}
