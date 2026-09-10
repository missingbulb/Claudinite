// The declaration half of the firebase-release collapse (#1079): the pack stopped
// existing and its release standard became this pack's create-release-plan skill.
//
// NOTHING DEPENDED ON THIS HAVING RUN while the tolerance stood: `RENAMED_PACKS`
// resolved the absorbed id to firebase, so a member activated the right pack the
// moment the mount landed, declaration converged or not. What it bought was the day
// that map entry could be retired — and that day came (#1641), so a member that never
// ran this record now declares a pack nobody can look up and activates nothing under
// it.
//
// Structural, and the ids come from the engine's rename map rather than from this
// record — see applyPackRenames in engine/migrations/registry.mjs. Every member
// carrying the absorbed pack carries firebase too (it was its `requires`), so the
// rewrite collides on every one of them; the merge there is what keeps that member's
// own config, severities and acceptances.
export default {
  id: 'firebase-release-collapse',
  landed: '2026-08-19',
  version: 4,
  summary: 'firebase-release collapsed into firebase; the declaration converges onto the surviving id (#1079)',

  renameDeclaredPacks: true,
};
