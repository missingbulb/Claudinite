## 2026-08-12 · declined · what stays local in LaughCounter (#756)
- **Source:** LaughCounter's `macos-audio` and `on-device-privacy` local packs, re-read against this
  pack's scope once it existed.
- **Reason:** which of its types owns the engine, where its files live, its no-egress promise and
  its requirement that every speech request be on-device are facts about that app rather than
  portable macOS practice, even where the fact one of them rests on is now canon prose.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #756 (Closes #641) · pack version 1.

## 2026-09-05 · declined · LaughCounter's other two local checks do not come across (#1693)
- **Source:** LaughCounter's `local/macos-audio`.
- **Reason:** both are hardcoded to that repo's own paths (`mac/Sources/`, `AudioHub.swift`), and
  the canon already holds generalized equivalents in `signal-teardown-routing` and
  `sudden-termination-vs-teardown`.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1693 (Closes #1692) · pack version 60904.1.
