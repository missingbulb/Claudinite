
// Curation duties for a CANON — a repo whose own `packs/` tree is a shelf of
// Claudinite packs that other repos vendor. Declaring this pack is what makes a
// repo that canon's home: it takes on promoting its members' lessons into the
// shelf, sweeping the fleet's stacks for technologies the shelf does not yet
// home, keeping what the shelf already teaches current with those technologies,
// and policing the shelf's own content.
//
// NOTHING HERE NAMES A PARTICULAR CANON. The shelf is `packs/` because that is
// where the engine reads a canon's packs from (engine/pack_loader/pack-registry.mjs),
// so every rule and task below is anchored there and is inert in a repo that
// keeps no shelf. The one thing a canon can differ on — a second corpus root
// beside `packs/` — is this pack entry's optional `write_paths` config, read by
// canon-config.mjs.
//
// Declaration cardinality is what makes the tasks central-once: a pack's tasks run
// per DECLARING repo, so a canon declared by its one home repo yields exactly one
// work item per task per occurrence, with no orchestrator step. Un-declaring the
// pack freezes canon absorption without touching the members' side
// (claudinite-growth). The tasks are discovered structurally from this pack's own
// `tasks/<name>/task.mjs` (packs/claudinite-tasks/discover.mjs), so none is declared here.
export default {
  version: '60901.3',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'curating a canon — promoting member lessons onto its packs/ shelf, sweeping the fleet for unhomed technologies, policing the shelf',
    excludes: 'a repo\'s rules for its own product — its local packs; authoring content — claudinite-growth; self-tidying — tidy-repo',
  },
  // Not adoptable content: a canon home is a role somebody assigns, not a shape a
  // fingerprint can suspect, so the pack is withheld from the catalog a session
  // reads to pick a pack to adopt. Declaring it by hand is how a canon takes it on.
  hidden: true,
  seededByDefault: false,
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
  // writing-claudinite-skills is canon-side activity (authoring corpus skills), so
  // this pack bundles it under its own skills/ — a member authors no corpus skills.
};
