import promote from './run_daily/growth-promote-to-claudinite.mjs';
import noEnforcementNarration from './no-enforcement-narration.mjs';
import packIndependence from './pack-independence.mjs';

// The canon home repo's own curation pack — the fleet-facing work only the
// Claudinite home runs: promoting members' lessons into the shared canon (the
// growth lifecycle's central stage) and policing the corpus's packs/ tree.
// (Prose-to-checks is no longer canon-only: it moved to grow_with_claudinite as a
// per-repo task with a `pack_paths` config — the canon runs it over its own packs/
// + local packs like any repo, per the per-project-scheduling redesign.)
//
// A LOCAL pack (.claudinite/local/packs/), by owner decision (2026-07-19): the
// canon home's curation duties are project-specific content — Claudinite
// maintaining Claudinite — so they live on the home's own capture surface, not
// in the portable packs/ canon. Its run_daily tasks ride the fleet's default
// local-pack scheduling like any member's local tasks. Declared by hand in
// exactly one repo (this one, as "local/canon-curation"); that
// declaration cardinality is what makes its tasks central-once: a pack task
// runs per DECLARING repo, so one declaring repo means one unit per night, with
// no bespoke orchestrator step. Un-declaring it freezes canon absorption
// without touching the members' side (grow_with_claudinite).
export default {
  id: 'canon-curation',
  detect: null,
  marker: null,
  prose: null,
  // Packs-tree segregation is barriers CONFIGURATION, never code this pack
  // runs: pack-independence is contributed as manifest data and the barriers
  // pack builds it into the rule (pack-independence.mjs — pure data, the same
  // composition basics uses for claudinite-isolation).
  requires: ['barriers'],
  contributes: { barriers: [packIndependence] },
  // The prose-narration rule polices pack prose CONTENT (not segregation), so
  // it stays a code check, bundled here.
  rules: [noEnforcementNarration],
  // writing-claudinite-skills is canon-home activity (authoring corpus skills), so
  // this pack bundles it under its own skills/ — members author no corpus skills.
  run_daily: [promote],
};
