// Judging a pack's `relevanceDetector` against a repo the enforcer has not cloned, over the REST
// API: one tree listing, and the contents of only the files a relevance detector's `paths` name.
//
// A path-only relevance detector is decided by the listing alone. A relevance detector with `text` needs the
// candidate files' contents, one round trip each, so it is read within a budget: a
// relevanceDetector whose paths name more candidates than that (every source file, for a
// library reference) is reported UNDECIDED, never false. "We did not look" and "we
// looked and it isn't there" are different facts, and only one of them is safe to act
// on; the agent stage, which has the member checked out, settles the undecided ones.
//
// The budget is per pack, per repo. It is a cost ceiling on a weekly sweep across
// every repo an owner has, not a correctness knob: raising it buys more resolved
// fingerprints and more API calls, and lowering it defers more to the agent.

// A namespace import: the pack and engine lanes deliver on separate cadences, and this
// pack's minEngineVersion is what keeps it off an engine without the module.
import * as detectorSpec from '../../../../engine/pack_loader/relevance-detector.mjs';

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

// Evaluate ONE pack's relevanceDetector against a remote repo. Returns { verdict, why }, with
// verdict true / false / null (undecided): exactly the `evaluate` contract its sibling
// fingerprint-fit.mjs expects.
export function makeRemoteEvaluator(gh, repo, ref, { tracked, truncated, budget = DEFAULT_READ_BUDGET } = {}) {
  return async function evaluate(pack) {
    const detector = pack.relevanceDetector;
    const candidates = detectorSpec.detectorCandidates(detector, tracked);
    const text = [].concat(detector.text ?? []);
    const absent = truncated
      ? { verdict: null, why: 'the tree listing was truncated - a non-match here is not evidence' }
      : { verdict: false, why: null };
    if (!text.length) return candidates.length ? { verdict: true, why: null } : absent;
    if (candidates.length > budget) {
      return { verdict: null, why: `${candidates.length} files could carry what it looks for (budget ${budget}) - it greps source rather than probing paths` };
    }
    for (const path of candidates) {
      const body = await fetchBlob(gh, repo, ref, path);
      if (body !== null && text.every((r) => r.test(body))) return { verdict: true, why: null };
    }
    return absent;
  };
}
