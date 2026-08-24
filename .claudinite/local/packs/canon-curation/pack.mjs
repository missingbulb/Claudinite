
// Claudinite's own curation pack — the fleet-facing work only Claudinite runs:
// promoting members' lessons into the shared canon (the growth lifecycle's
// central stage), sweeping the fleet's stacks for technologies the canon does
// not yet home, and policing the corpus's packs/ tree.
// (Prose-to-checks is no longer canon-only: it moved to claudinite-growth as a
// per-repo task with a `pack_paths` config — the canon runs it over its own packs/
// + local packs like any repo, per the per-project-scheduling redesign.)
//
// A LOCAL pack (.claudinite/local/packs/), by owner decision (2026-07-19): the
// canon home's curation duties are project-specific content — Claudinite
// maintaining Claudinite — so they live on the home's own capture surface, not
// in the portable packs/ canon. Its tasks are discovered structurally from this
// pack's own `tasks/<name>/task.mjs` by the repo's scheduler
// (packs/claudinite-tasks/discover.mjs), so none is declared here. Declared by hand in
// exactly one repo (this one, as "local/canon-curation"); that
// declaration cardinality is what makes its tasks central-once: a pack task
// runs per DECLARING repo, so one declaring repo means one unit per night, with
// no bespoke orchestrator step. Un-declaring it freezes canon absorption
// without touching the members' side (claudinite-growth).
export default {
  ruleRoutingGuidance: {
    belongs: 'fleet-facing curation of the shared corpus — promoting member lessons into packs/, sweeping the fleet stack, policing packs/',
    excludes: 'working rules for developing Claudinite itself — that is the claudinite local pack; a member tidying itself — tidy-repo',
  },
  // Packs-tree segregation is barrier DATA, never code this pack runs:
  // pack-independence is a declared check — a forbidReferences entry in this
  // pack's declared-checks.json, run by the engine's reference-scanning (the
  // same shape basics uses for claudinite-isolation). Its `allow` list IS the
  // engine surface — the one always-vendored engine/ root; a new surface root
  // would join it there, loudly (the barrier fails closed, never widens).
  requires: ['barriers'],
  // The prose-narration rule polices pack prose CONTENT (not segregation), so
  // it stays a code check, bundled here.
  // Delivery, not content: a pack's directory ships on its version number, so
  // whether THIS change moved it is a question only the diff can answer.
  // writing-claudinite-skills is canon-home activity (authoring corpus skills), so
  // this pack bundles it under its own skills/ — members author no corpus skills.
};
