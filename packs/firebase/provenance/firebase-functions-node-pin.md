## 2026-07-26 · born · prose-to-checks: convert the firebase deploy-layout rules to checks (#451)
- **Source:** the deploy-layout half of the pack's own prose, swept against the check-the-world
  test.
- **Reason:** that a pin exists is mechanical; whether the pinned major matches CI is judgment about
  the project's own toolchain, so only the first half converted and the second stayed prose.
- **Actor:** @missingbulb (owner), on the prose-to-checks sweep of 2026-07-26.
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a coded world rule beside the manifest, relevance-first on the same condition as
  the predeploy rule, whose entry carries the reasoning.
- **Landed:** #451 (tracker #450) · pack version 1.

## 2026-08-16 · converted · the coded rule becomes a declaration (#908)
- **Reason:** the declared vocabulary gained a `scanFiles` form that reads its file set out of
  another parsed document, which is exactly this rule's selection problem - each codebase's `source`
  in `firebase.json` locating a `package.json`, with the default and the directory suffix declared
  rather than coded. Converted red-first against the coded rule's own fixtures, with the module
  deleted in the same commit. The pack's `lib.mjs` stays: the predeploy rule still reads the
  config's own arrays.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a declared check in the pack's `declared-checks.json`.
- **Landed:** #908 (Refs #880) · pack version 2.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
