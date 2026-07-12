import growthExtract from './run_daily/growth-extract-new-instructions.mjs';
import growthDedup from './run_daily/growth-dedup-local-instructions.mjs';

// Opt into the growth lifecycle: a repo declaring grow_with_claudinite contributes its
// hard-won lessons up to the Claudinite canon — extract (per repo) → promote (central,
// once) → dedup (per repo), sequenced by the fleet. This pack provides the two per-repo
// run_daily tasks; promote is the orchestrator's central post-barrier step.
//
// The pack also carries the fleet's central, weekly pack-discovery process (growth/discover-packs.md):
// manifest each repo's stack → suggest a pack for each unhomed technology → populate it with
// distilled rules/checks → open one PR per pack. Like promote, it's orchestrator-dispatched
// centrally, not a per-repo run_daily task, so it isn't listed below.
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
  run_daily: [growthExtract, growthDedup],
};
