// The declaration half of the chrome-extension-release collapse (#1057): the pack
// stopped existing and its content moved into chrome-extension, whose release rules
// now gate on the repo shipping the pipeline rather than on a second declaration.
//
// NOTHING DEPENDED ON THIS HAVING RUN while the tolerance stood: `RENAMED_PACKS`
// resolved the absorbed id to chrome-extension, so a member activated the right pack
// the moment the mount landed, declaration converged or not. What it bought was the day
// that map entry could be retired — and that day came (#1641), so a member that never
// ran this record now declares a pack nobody can look up and activates nothing under
// it.
//
// Structural, and the ids come from the engine's rename map rather than from this
// record — see applyPackRenames in engine/migrations/registry.mjs. Every member
// carrying the absorbed pack carries chrome-extension too (it was its `requires`),
// so the rewrite collides on every one of them; the merge there is what keeps that
// member's own config, severities and acceptances.
export default {
  id: 'chrome-release-collapse',
  landed: '2026-08-19',
  version: 3,
  summary: 'chrome-extension-release collapsed into chrome-extension; the declaration converges onto the surviving id (#1057)',

  renameDeclaredPacks: true,
};
