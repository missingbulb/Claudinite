// The declaration half of the canary-probe rename (#1079).
//
// A PACK RECORD, and it can be one: a rename's record cannot live under the id being
// retired — that directory ships to nobody — but this one lives under the id the pack
// has NOW, and a member's stamped version for the old key reads through the same
// rename map (canonicalPackVersions), so the gap this ranges against is the gap the
// member really has.
//
// NOTHING DEPENDS ON THIS HAVING RUN. `RENAMED_PACKS` resolves the old spelling, so a
// member activates the pack whichever half reaches it first, and the pack flow sweeps
// the abandoned mount directory as a property of renaming. What this buys is the day
// that map entry can be retired.
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
