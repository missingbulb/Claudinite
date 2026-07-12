import growthExtract from './run_daily/growth-extract-new-instructions.mjs';
import growthDedup from './run_daily/growth-dedup-local-instructions.mjs';
import growthPackGapScan from './run_daily/growth-pack-gap-scan.mjs';

// Opt into the growth lifecycle: a repo declaring grow_with_claudinite contributes its
// hard-won lessons up to the Claudinite canon — extract (per repo) → promote (central,
// once) → dedup (per repo), sequenced by the fleet. This pack provides the per-repo
// run_daily tasks; promote is the orchestrator's central post-barrier step.
//
// It also runs a weekly pack-gap scan: an agent answers a leading question about the repo
// — which technologies it uses that no pack (stub included) covers — and converges a
// "Pack gaps" tracking issue, so a missing pack stops being invisible. Independent of the
// extract → promote → dedup barrier.
//
// A declared pack (no fingerprint), seeded like tidy-repo: --init seeds it into every
// new repo, the one-time grow-with-claudinite-seed migration seeds the existing fleet,
// and baselining never re-adds it — so removing it is a durable opt-out.
export default {
  id: 'grow_with_claudinite',
  detect: null,
  marker: null,
  prose: null,
  rules: [],
  run_daily: [growthExtract, growthDedup, growthPackGapScan],
};
