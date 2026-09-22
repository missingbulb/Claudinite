// The `barriers` pack was absorbed into `basics` (#1681). Its check, its
// contribution seam and its guide moved.
//
// WHAT ONLY THIS RECORD COULD DO was the declaration's SHAPE. The rename map moved an
// id; it did not move the parameters underneath one, and a repo's folder-access graph
// is exactly that: an array the owner wrote, which no reader could relocate on its
// own without inventing a second place to look for it forever. So the entry's `config`
// nested under `barriers` on the surviving `basics` entry, where the absorbed check
// reads it, and the recorded `goals` answer went with it: it answered the barriers
// pack's one adoption question, which #1681 removed, so left in place it would read as
// an answer to a question `basics` does not ask, an interview-hygiene finding with no
// edit that clears it.
//
// NOTHING DEPENDED ON THIS HAVING RUN while the tolerance stood: the rename map
// resolved the id, and the absorbed check keeps a legacy read of the old placement
// until #1682, so a member was correct either way. What it bought was the day that map
// entry could come out, and that day came (#1909), so a member that never ran this
// record now declares a pack nothing resolves and activates nothing under it. The
// nesting op went out with the entry, which is why this record no longer carries
// `absorbedPackConfig` or the mount probe that gated it: with `barriers` out of the
// map there is no rename left for either to shape.
export default {
  id: 'barriers-absorbed',
  landed: '2026-09-04',
  version: '60904.1',
  summary: 'the barriers pack is absorbed into basics (#1681) — the declared entry is renamed and its folder-access graph nests under `config.barriers` on the basics entry',

  // Structural, and the ids come from the engine's rename map rather than from this
  // record: see applyPackRenames in engine/migrations/registry.mjs.
  renameDeclaredPacks: true,
};
