import growthExtract from './run_daily/growth-extract-new-instructions.mjs';
import growthDedup from './run_daily/growth-dedup-local-instructions.mjs';
import growthDiscoverPacks from './run_daily/growth-discover-packs.mjs';

// Opt into the growth lifecycle: a repo declaring grow_with_claudinite contributes its
// hard-won lessons up to the Claudinite canon and prunes them back out once the canon
// owns them. This pack carries the MEMBER-side stages — extract, dedup, and the weekly
// pack-discovery pipeline — as ordinary independent run_daily tasks (no barriers). The
// central stage, promote, rides the canon-curation pack (declared only by the canon
// home repo); its gate targets exactly the members that declare THIS pack.
//
// growth-discover-packs is the weekly pack-discovery pipeline: for the member it's
// handed it manifests the stack, suggests a pack for each unhomed technology, populates
// it with distilled rules/checks, and opens one canon PR per pack. It runs centrally
// (home session, fleet token) like every worker, but is scheduled the regular way.
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
