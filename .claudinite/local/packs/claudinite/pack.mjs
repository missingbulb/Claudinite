// The canon home repo's OWN local pack — Claudinite-specific working rules and
// lessons that are NOT portable to consumers (those belong in packs/, the shared
// canon). This is the capture surface the growth-extract and conversation-extract
// run_daily tasks route the canon's own non-portable lessons into; a lesson that
// turns out to travel becomes a PR against packs/ instead.
//
// Discovered like any local pack — the canon's own runner passes
// discoverPacks({ localRoot: <repo root> }), so this is scanned alongside the
// canon packs/ tree — and active because .claudinite-checks.json declares it. Its
// id must equal its directory name ("claudinite") and may not shadow a canon pack.
export default {
  id: 'claudinite',
  prose: 'RULES.md',
  rules: [],
};
