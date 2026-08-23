// The canon side of the mount comparison, shared by both views: the fleet grid's
// Packs badge and the repo page's drift tile ask the same question — is what is
// declared here current — and must not answer it two ways.
//
// Optional by design. With no `canonRepo` configured there is nothing to compare
// against, and the answer is `unknown` rather than an invented `current`; no repo name
// is ever hardcoded in this code.
//
// The reference is VERSIONS, never a sha: the versioned flows stamp members with
// `engineVersion`/`packVersions` only, so the canon side is the live `ENGINE_VERSION`
// out of `engine/version.mjs` plus each pack's `version:` out of its `pack.mjs` —
// lifted as text like every declaration field, sha-cached like every content read.
//
// Pack versions are fetched LAZILY, only for packs some member actually stamps: a
// fleet's union of declared packs is around a dozen reads where the full canon catalog
// is three times that, and a warm load pays for none of them.

import * as gh from './github.mjs';
import { installedVersions } from '../../engine/installed-versions.mjs';
import { parseEngineVersion, parsePackVersion } from './fleet.mjs';

export async function readCanon(config, token) {
  if (!config?.canonRepo) return null;
  try {
    const repo = config.canonRepo;
    const meta = await gh.getRepo(repo, token);
    const ref = await gh.getHeadSha(repo, meta.default_branch, token);
    // Two-root form: the reference is normally the canon itself (repo root), but a
    // mount carries both files too, so a deployment pointed at a member still reads.
    const at = async (path) => (await gh.getTextAtSha(repo, ref, path, token))
      ?? (await gh.getTextAtSha(repo, ref, `.claudinite/shared/${path}`, token));

    const engineVersion = parseEngineVersion(await at('engine/version.mjs'));
    const packVersions = {};
    const pending = new Map();
    const packVersion = (id) => {
      // A local pack lives in the member's own tree — the canon has no version for it.
      if (!id || id.startsWith('local/')) return Promise.resolve(null);
      if (!pending.has(id)) {
        pending.set(id, (async () => {
          const v = parsePackVersion(await at(`packs/${id}/pack.mjs`).catch(() => null));
          if (v != null) packVersions[id] = v;
          return v;
        })());
      }
      return pending.get(id);
    };
    return { repo, ref, engineVersion, packVersions, packVersion };
  } catch {
    return null;
  }
}

// Price a member's stamped packs on the canon side before its mount is judged —
// memoized across members, and under today's spelling for a stamp written before a
// pack rename.
export async function priceStampedPacks(canon, declaration) {
  if (!canon?.packVersion || !declaration) return;
  const { packVersions } = installedVersions(declaration);
  await Promise.all(Object.keys(packVersions).map(canon.packVersion));
}
