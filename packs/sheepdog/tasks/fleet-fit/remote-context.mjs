// A repo context built over the REST API instead of a checkout — enough of one for a
// pack's `detect` fingerprint to run against a member the enforcer has not cloned.
//
// WHY it can only ever be an approximation. `buildContext` (engine/checks/helpers/
// repo-context.mjs) is backed by git and a real working tree, and `ctx.read` is
// SYNCHRONOUS. Over REST, a file's contents are a round trip. A fingerprint that only
// walks `ctx.tracked` (a package.json near the root, a workflow file, a tracked path)
// is therefore answerable from one cheap tree listing; a fingerprint that reads
// CONTENTS (a JWT library referenced in source, a manifest.json carrying
// "manifest_version") is not, until the files it wants have been fetched.
//
// So this resolves in two passes:
//
//   1. PROBE — run the fingerprint against a context whose `read` returns null and
//      RECORDS what was asked for. The verdict from this pass is discarded; the
//      recorded path list is the point.
//   2. RESOLVE — fetch those paths (at most `budget` of them), rebuild the context
//      with them warm, and run the fingerprint again. That answer is real.
//
// A fingerprint that asked for more files than the budget allows is reported
// UNDECIDED, never false: "we did not look" and "we looked and it isn't there" are
// different facts, and only one of them is safe to act on. A fingerprint that reads a
// handful of well-known paths (manifests, workflow files) resolves inside the budget;
// one that greps every source file in the repo does not, and the agent stage — which
// has the member checked out and can answer it exactly — is where it gets settled.
//
// The budget is per pack, per repo. It is a cost ceiling on a weekly sweep across
// every repo an owner has, not a correctness knob: raising it buys more resolved
// fingerprints and more API calls, and lowering it defers more to the agent.

export const DEFAULT_READ_BUDGET = 24;

// Every tracked path on a ref, from ONE call. `truncated` is GitHub telling us the
// tree was too large to return whole — the listing is then a subset, so every
// fingerprint over it is a suspicion built on partial evidence and the caller must
// treat the repo as undecided rather than quietly under-detecting.
export async function fetchTree(gh, repo, ref) {
  const { status, json } = await gh(`/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  if (status !== 200 || !Array.isArray(json?.tree)) {
    throw new Error(`listing the tree of ${repo}@${ref} returned ${status}`);
  }
  return {
    tracked: json.tree.filter((n) => n.type === 'blob').map((n) => n.path),
    truncated: json.truncated === true,
  };
}

// A context over a known path list and an already-fetched blob cache. `read` serves
// the cache, returns null for anything absent (exactly what the real ctx.read does
// for a file that isn't there), and records every path asked for so the caller can
// see what a fingerprint wanted.
export function makeRemoteContext({ tracked, blobs = new Map() }) {
  const requested = [];
  return {
    tracked,
    files: tracked,
    read(path) {
      requested.push(path);
      return blobs.has(path) ? blobs.get(path) : null;
    },
    // Not part of the ctx surface a fingerprint uses — the caller's window onto the
    // probe pass.
    _requested: requested,
  };
}

// One file's contents, or null when it cannot be read (absent, too large for the
// contents API, a submodule). Null is a legitimate answer here and matches ctx.read.
async function fetchBlob(gh, repo, ref, path) {
  const { status, json } = await gh(`/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`);
  if (status !== 200 || typeof json?.content !== 'string') return null;
  try {
    return Buffer.from(json.content, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

// Evaluate ONE pack's fingerprint against a remote repo, resolving file reads on
// demand within the budget. Returns true / false / null (undecided), which is exactly
// the `evaluate` contract engine/checks/fingerprint-fit.mjs expects.
export function makeRemoteEvaluator(gh, repo, ref, { tracked, truncated, budget = DEFAULT_READ_BUDGET } = {}) {
  return async function evaluate(pack) {
    // Pass 1 — probe. The verdict is thrown away; what the fingerprint ASKED FOR is
    // what we came for.
    const probe = makeRemoteContext({ tracked });
    let probeVerdict;
    try {
      probeVerdict = pack.detect(probe) === true;
    } catch (e) {
      return { verdict: null, why: `fingerprint threw during the probe: ${e.message}` };
    }
    const wanted = [...new Set(probe._requested)];

    // A fingerprint that never touched `read` is decided by the path listing alone —
    // unless the listing itself was truncated, in which case a `false` is not a fact.
    if (wanted.length === 0) {
      if (truncated && probeVerdict === false) {
        return { verdict: null, why: 'the tree listing was truncated — a non-match here is not evidence' };
      }
      return { verdict: probeVerdict, why: null };
    }
    if (wanted.length > budget) {
      return {
        verdict: null,
        why: `the fingerprint wanted ${wanted.length} file reads (budget ${budget}) — it greps source rather than probing paths`,
      };
    }

    // Pass 2 — resolve. Fetch what was asked for, then re-run for the real answer.
    const blobs = new Map();
    for (const path of wanted) blobs.set(path, await fetchBlob(gh, repo, ref, path));
    const resolved = makeRemoteContext({ tracked, blobs });
    try {
      const verdict = pack.detect(resolved) === true;
      // The second pass can ask for files the first did not reach (a `some` that
      // short-circuits on a hit it did not get the first time). Anything newly
      // requested came back null, so a `false` may be under-detection, not absence.
      const stillMissing = resolved._requested.some((p) => !blobs.has(p));
      if (verdict === false && stillMissing) {
        return { verdict: null, why: 'the fingerprint reached past the files the probe pass named' };
      }
      return { verdict, why: null };
    } catch (e) {
      return { verdict: null, why: `fingerprint threw: ${e.message}` };
    }
  };
}
