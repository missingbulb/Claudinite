import growthExtract from './run_daily/growth-extract-new-instructions.mjs';
import growthDedup from './run_daily/growth-dedup-local-instructions.mjs';
import growthStackManifest from './run_daily/growth-stack-manifest.mjs';

// Opt into the growth lifecycle: a repo declaring grow_with_claudinite contributes its
// hard-won lessons up to the Claudinite canon — extract (per repo) → promote (central,
// once) → dedup (per repo), sequenced by the fleet. This pack provides the per-repo
// run_daily tasks; promote is the orchestrator's central post-barrier step.
//
// It also runs a weekly stack-manifest scan (stage 1 of pack discovery): an agent answers a
// leading question about the repo — its technologies, the APIs it integrates, and its
// deployment/distribution targets — and converges a "Stack manifest" tracking issue. It
// decides nothing about packs; the pack-decision is stage 2's separate, central job.
// Independent of the extract → promote → dedup barrier.
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
  run_daily: [growthExtract, growthDedup, growthStackManifest],
};
