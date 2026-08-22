import consumerSafeChange from './consumer-safe-change.mjs';
import engineReleaseRecord from './engine-release-record.mjs';
import packDiscoveryEntryAwait from './pack-discovery-entry-await.mjs';

// The canon home repo's OWN local pack — Claudinite-specific working rules and
// lessons that are NOT portable to consumers (those belong in packs/, the shared
// canon). This is the capture surface the growth-extract scheduled task routes the
// canon's own non-portable lessons into — from repo activity and from captured
// conversations alike; a lesson that turns out to travel becomes a PR against
// packs/ instead.
//
// Discovered like any local pack — the canon's own runner passes
// discoverPacks({ localRoot: <repo root> }), so this is scanned alongside the
// canon packs/ tree — and active because .claudinite-checks.json declares it. Its
// id must equal its directory name ("claudinite") and may not shadow a canon pack.
export default {
  ruleRoutingGuidance: {
    belongs: 'working rules and lessons specific to developing Claudinite itself and not portable to any consumer',
    excludes: 'fleet-facing curation duties and policing of the packs/ tree — that is the canon-curation local pack',
  },
  // home-seeded-packs-declared rides beside these as a declared check
  // (declared-checks.json in this directory).
  worldRules: [packDiscoveryEntryAwait],
  workRules: [consumerSafeChange, engineReleaseRecord],
};
