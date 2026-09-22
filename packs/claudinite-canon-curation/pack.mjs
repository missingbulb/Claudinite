
// Curation duties for a CANON — a repo whose own `packs/` tree is a shelf of
// Claudinite packs that other repos vendor. Declaring this pack is what makes a
// repo that canon's home: it takes on promoting its members' lessons into the
// shelf, sweeping the fleet's stacks for technologies the shelf does not yet
// home, keeping what the shelf already teaches current with those technologies,
// and policing the shelf's own content.
//
// Nothing here names a particular canon. The shelf is `packs/`, where the engine
// reads a canon's packs from (engine/pack_loader/pack-registry.mjs); a second
// corpus root beside it is this pack entry's optional `write_paths` config, read
// by canon-config.mjs. The tasks are discovered structurally from this pack's own
// `tasks/<name>/task.json` (packs/claudinite-tasks/discover.mjs), so none is declared here.
export default {
  version: '60922.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'curating a canon\'s packs/ shelf — promoting member lessons, sweeping members for unhomed technologies, authoring and policing its packs',
    excludes: 'a repo\'s rules for its own product — its local packs; authoring content — claudinite-growth; housekeeping — basics',
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
  // would join it there, loudly (the barrier fails closed, never widens). A
  // declared check is run by the engine, so nothing else has to be declared for
  // it (#1681 dropped the `barriers` requirement, vestigial since the wall
  // stopped being code).
  // The prose-narration rule polices pack prose CONTENT (not segregation), so
  // it stays a code check, bundled here.
  // Delivery, not content: a pack's directory ships on its version number, and
  // that number is cut on the base branch by this pack's pack-version-bump task,
  // never by the change itself (pack-versions.mjs).
  // writing-claudinite-skills is canon-side activity (authoring corpus skills), so
  // this pack bundles it under its own skills/ — a member authors no corpus skills.
};
