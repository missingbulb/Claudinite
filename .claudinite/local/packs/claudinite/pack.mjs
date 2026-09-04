
// The canon home repo's OWN local pack — Claudinite-specific working rules and
// lessons that are NOT portable to consumers (those belong in packs/, the shared
// canon). This is the capture surface the growth-extract scheduled task routes the
// canon's own non-portable lessons into — from repo activity and from captured
// conversations alike; a lesson that turns out to travel becomes a PR against
// packs/ instead.
//
// Discovered like any local pack — the canon's own runner passes
// discoverPacks({ localRoot: <repo root> }), so this is scanned alongside the
// canon packs/ tree — and active because .claudinite-settings.json declares it. Its
// id must equal its directory name ("claudinite") and may not shadow a canon pack.
export default {
  ruleRoutingGuidance: {
    belongs: 'developing Claudinite itself — its scope and standing decisions, the engine, the mount, the queue and what reaches members',
    excludes: 'the packs on the shelf — naming, config, modules, checks, prose, versions — and fleet-facing curation: claudinite-canon-curation',
  },
  // home-seeded-packs-declared rides beside these as a declared check
  // (declared-checks.json in this directory).
};
