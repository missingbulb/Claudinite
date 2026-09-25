## 2026-08-12 · born · sudden termination in an app that has teardown to lose (#756)
- **Source:** missingbulb/LaughCounter, a SwiftPM menu-bar agent app published as a notarized DMG
  through GitHub Actions: its `mac/scripts/`, `mac/Resources/`, release workflow and
  `dev/procedures/mac-audio-lifecycle.md`.
- **Reason:** the rule is itself conditional, so the gate is false-positive-free: the check fires
  only where `NSSupportsSuddenTermination` is true in an app that has terminate-time teardown, and
  the plist value is read as structure so the explicit false opt-out is never flagged and an app
  with nothing to run on the way out stays quiet. Its prose bullet was deleted whole under the
  deletion test, the finding's what/why/fix carrying it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a coded check, `packs/macos/sudden-termination-vs-teardown.mjs`, blocking,
  path-agnostic over `*.swift` and `*.plist`.
- **Landed:** #756 (Closes #641) · pack version 1.

## 2026-08-16 · moved · the check becomes a declaration (#891)
- **Reason:** its whole logic is patterns over files, which the declared vocabulary covers once the
  relevance probe can ignore comments; keeping it coded left it the odd one out among the
  conversions that slice of the review asked for.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** the check moves out of `packs/macos/sudden-termination-vs-teardown.mjs` into
  `packs/macos/declared-checks.json`. It is the first customer of `ignoringComments` on
  `someTrackedFileContains`, added to the vocabulary rather than as a new key, so a Swift comment
  naming `installTap` does not arm the rule.
- **Landed:** #891 · pack version 2.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
