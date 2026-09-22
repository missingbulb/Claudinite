// The `tidy-repo` pack was absorbed into `basics` (#1839). Its issue and PR sweeps
// were retired with the two per-object skills they applied; its comment pass, that
// pass's skill and the `improve-comments-scope` gate moved into the baseline.
//
// WHAT ONLY THIS RECORD COULD DO was converge the declaration. The rename map
// resolved the id at read time, so a member read correctly whether or not this had
// run; what the record bought was the day the map could come out — and that day came
// (#1909), so a member that never ran it now declares a pack directory nothing holds
// and activates nothing under it.
//
// NO `absorbedPackConfig`, even while that op existed. It nested an absorbed entry's
// parameters under the survivor's `config`, which is what a pack with parameters
// needs. `tidy-repo` asked no adoption question and read no config, so its entry was a
// bare id everywhere and the rename plus the duplicate-merge in `applyPackRenames` was
// the whole change.
//
// NO `appliesTo` GATE either. `renameDeclaredPacks` is an op every engine in the
// vendoring window already runs, so there was no capability to probe for.
//
// IT LIVES IN THIS PACK, not in the one that absorbed the content, for the same
// reason that absorption's record does: what it rewrites is the member's declaration,
// which is this pack's surface. A record's version must also sit at or below its own
// pack's, and a pending record above `basics`'s number would ride into a FRESH
// INSTALL — `installPacks` forces the stamp to each manifest's current version and
// fetches whatever still applies above it, and an install must carry no records at
// all (engine-tests/install.test.mjs).
export default {
  id: 'tidy-repo-absorbed',
  landed: '2026-09-06',
  // The version is cut on main after the merge (#1726), so a record cannot name it
  // exactly: this is the next number the bump would cut for the pack at 60906.10 —
  // above every member's installed version, so the gap holds the record, and never
  // above the number cut, so a converged member does not re-apply it. RE-CHECK IT
  // AGAINST `pack.mjs` ON EVERY REBASE: main cuts versions while a branch waits, and
  // a record that falls at or below the installed version is silently already done.
  version: '60906.11',
  summary: 'the tidy-repo pack is absorbed into basics (#1839) — its issue and PR sweeps are retired and the declared entry is renamed onto the pack that now carries the comment pass',

  renameDeclaredPacks: true,
};
