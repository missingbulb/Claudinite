// The declaration half of the github-actions collapse (#1079): the pack stopped
// existing and its skill and checks moved into git-github, which every repo already
// carries through basics' `requires` closure.
//
// NOTHING DEPENDED ON THIS HAVING RUN while the tolerance stood: `RENAMED_PACKS`
// resolved the absorbed id to git-github, so a member activated the right pack the
// moment the mount landed, declaration converged or not. What it bought was the day
// that map entry could be retired — and that day came (#1641), so a member that never
// ran this record now declares a pack nobody can look up and activates nothing under
// it.
//
// Structural, and the ids come from the engine's rename map rather than from this
// record — see applyPackRenames in engine/migrations/registry.mjs. Every member
// declaring the absorbed pack carries git-github too, so the rewrite collides on all
// of them; the merge there is what keeps that member's own config and acceptances.
export default {
  id: 'github-actions-collapse',
  landed: '2026-08-19',
  version: 6,
  summary: 'github-actions collapsed into git-github; the declaration converges onto the surviving id (#1079)',

  renameDeclaredPacks: true,
};
