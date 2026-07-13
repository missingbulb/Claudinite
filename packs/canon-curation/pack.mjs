import promote from './run_daily/growth-promote-to-claudinite.mjs';
import proseToChecksSweep from './run_daily/prose-to-checks-sweep.mjs';

// The canon's own curation duties — the fleet-facing work only the Claudinite
// home repo runs: promoting members' lessons into the shared canon (the growth
// lifecycle's central stage) and sweeping the corpus's prose backlog into checks.
//
// A HOME-ONLY pack: detect:null, never seeded by --init or any migration —
// declared by hand in exactly one repo, the canon home itself. That declaration
// cardinality is what makes its tasks central-once: a pack task runs per
// DECLARING repo, so one declaring repo means one unit per night, with no bespoke
// orchestrator step. Un-declaring it freezes canon absorption without touching
// the members' side (grow_with_claudinite).
export default {
  id: 'canon-curation',
  detect: null,
  marker: null,
  prose: null,
  rules: [],
  // prose-to-checks is canon-home activity (it mines and edits the corpus), so
  // this pack owns it — members have no canon prose to convert.
  skills: ['prose-to-checks'],
  run_daily: [promote, proseToChecksSweep],
};
