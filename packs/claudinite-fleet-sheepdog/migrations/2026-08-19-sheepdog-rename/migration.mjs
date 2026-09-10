// The declaration half of the sheepdog rename (#1079).
//
// A PACK RECORD, and it can be one: a rename's record cannot live under the id being
// retired — that directory ships to nobody — but this one lives under the id the pack
// has NOW, and a member's stamped version for the old key reads through the same
// rename map (canonicalPackVersions), so the gap this ranges against is the gap the
// enforcer really has.
//
// NOTHING DEPENDED ON THIS HAVING RUN while the tolerance stood: `RENAMED_PACKS`
// resolved the old spelling, so the enforcer activated the pack whichever half reached
// it first, its sweeps read the fleet config off an entry under either spelling, and
// the pack flow swept the abandoned mount directory as a property of renaming. What it
// bought was the day that map entry could be retired — and that day came (#1641), so an
// enforcer that never ran this record activates nothing under the old spelling and its
// config reader no longer finds that entry (fleet-config.mjs).
//
// Structural, and the ids come from the engine's rename map rather than from this
// record — see applyPackRenames in engine/migrations/registry.mjs.
export default {
  id: 'sheepdog-rename',
  landed: '2026-08-19',
  version: 18,
  summary: 'sheepdog renamed to claudinite-fleet-sheepdog; the declaration converges onto the current id (#1079)',

  renameDeclaredPacks: true,
};
