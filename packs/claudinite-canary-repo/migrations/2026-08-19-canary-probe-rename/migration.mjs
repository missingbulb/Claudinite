// The declaration half of the canary-probe rename (#1079).
//
// A PACK RECORD, and it can be one: a rename's record cannot live under the id being
// retired — that directory ships to nobody — but this one lives under the id the pack
// has NOW, and a member's stamped version for the old key reads through the same
// rename map (canonicalPackVersions), so the gap this ranges against is the gap the
// member really has.
//
// NOTHING DEPENDED ON THIS HAVING RUN while the tolerance stood: `RENAMED_PACKS`
// resolved the old spelling, so a member activated the pack whichever half reached it
// first, and the pack flow swept the abandoned mount directory as a property of
// renaming. What it bought was the day that map entry could be retired — and that day
// came (#1641), so a member that never ran this record activates nothing under the old
// spelling.
//
// Structural, and the ids come from the engine's rename map rather than from this
// record — see applyPackRenames in engine/migrations/registry.mjs.
export default {
  id: 'canary-probe-rename',
  landed: '2026-08-19',
  version: 4,
  summary: 'canary-probe renamed to claudinite-canary-repo; the declaration converges onto the current id (#1079)',

  renameDeclaredPacks: true,
};
