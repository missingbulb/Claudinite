import growthExtract from './run_daily/growth-extract-new-instructions.mjs';
import growthDedup from './run_daily/growth-dedup-local-instructions.mjs';
import growthDiscoverPacks from './run_daily/growth-discover-packs.mjs';

// Opt into the growth lifecycle: a repo declaring grow_with_claudinite contributes its
// hard-won lessons up to the Claudinite canon — extract (per repo) → promote (central,
// once) → dedup (per repo), sequenced by the fleet. This pack provides the per-repo
// run_daily tasks; promote is the orchestrator's central post-barrier step.
//
// growth-discover-packs is the weekly pack-discovery pipeline — an ordinary run_daily task
// (the planner picks it up per member on its full sweep, not a bespoke central step): for
// the member it's handed it manifests the stack, suggests a pack for each unhomed technology,
// populates it with distilled rules/checks, and opens one canon PR per pack. It runs
// centrally (home session, fleet token) like every worker, but is scheduled the regular way.
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
  run_daily: [growthExtract, growthDedup, growthDiscoverPacks],
};
