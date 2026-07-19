import growthExtract from './run_daily/growth-extract-new-instructions.mjs';
import growthDedup from './run_daily/growth-dedup-local-instructions.mjs';
import growthDiscoverPacks from './run_daily/growth-discover-packs.mjs';
import growthConfig from './config-check.mjs';

// Opt into the growth lifecycle: a repo declaring grow_with_claudinite contributes its
// hard-won lessons up to the Claudinite canon and prunes them back out once the canon
// owns them. This pack carries the MEMBER-side stages — extract, dedup, and the weekly
// pack-discovery pipeline — as ordinary independent run_daily tasks (no barriers). The
// central stage, promote, rides the canon-curation pack (declared only by the canon
// home repo); its gate targets exactly the members that declare THIS pack — minus any
// member whose entry sets config.promote: false (the promotion opt-out; extraction and
// dedup stay local either way).
//
// The pack also owns the CONVERSATION lifecycle: merge-to-main's capture step pushes
// each merged session's conversation onto the orphan conversation-logs branch
// (capture-log.mjs), and the per-repo conversation-extract nightly — NOT a run_daily
// task; it needs local git in the repo's own context, so each repo schedules it
// itself (conversation-extract.md) — mines the logs, posts the dialogue behind each
// extracted rule on its issue, and deletes logs past config.retention_days.
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
  seededByDefault: true,
  prose: null,
  rules: [growthConfig],
  questions: [{
    id: 'retention',
    prompt: 'How many days should a captured conversation log stay on the conversation-logs branch before the nightly retention sweep deletes it? The floor is the rethink window — extraction wants ~a week of hindsight; 10 is the recommended value.',
    distill: 'set config.retention_days on this entry to the agreed positive integer; until it is set, the sweep deletes nothing (capture-only adoption)',
  }, {
    id: 'nightly',
    prompt: 'Where is the per-repo conversation-extract nightly scheduled for this repo (a thin launcher pointing at the mounted packs/grow_with_claudinite/conversation-extract.md)? It is not a fleet task — without its own schedule, logs are captured but never extracted.',
    distill: 'record where the routine is scheduled (e.g. the CC routine name); if not yet scheduled, record that adoption is capture-only for now',
  }],
  run_daily: [growthExtract, growthDedup, growthDiscoverPacks],
};
