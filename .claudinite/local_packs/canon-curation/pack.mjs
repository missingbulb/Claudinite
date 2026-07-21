import promote from './run_daily/growth-promote-to-claudinite.mjs';
import proseToChecksSweep from './run_daily/prose-to-checks-sweep.mjs';
import noEnforcementNarration from './no-enforcement-narration.mjs';
import packIndependence from './pack-independence.mjs';

// The canon home repo's own curation pack — the fleet-facing work only the
// Claudinite home runs: promoting members' lessons into the shared canon (the
// growth lifecycle's central stage), sweeping the corpus's prose backlog into
// checks, and policing the corpus's packs/ tree.
//
// A LOCAL pack (.claudinite/local_packs/), by owner decision (2026-07-19): the
// canon home's curation duties are project-specific content — Claudinite
// maintaining Claudinite — so they live on the home's own capture surface, not
// in the portable packs/ canon. Its run_daily tasks ride the fleet's default
// local-pack scheduling like any member's local tasks. Declared by hand in
// exactly one repo (this one, as "local_packs/canon-curation"); that
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
  // prose-to-checks and writing-claudinite-skills are canon-home activity (they
  // mine and edit the corpus), so this pack bundles them under its own skills/
  // — members have no canon prose to convert and no corpus skills to author.
  run_daily: [promote, proseToChecksSweep],
};
