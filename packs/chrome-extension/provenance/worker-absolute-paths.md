## 2026-07-03 · born · seeded into the corpus file from a member's local docs (c90f0c51)
- **Source:** GoogleCalendarEventCreator's local docs, promoted in phase 2 of the growth lifecycle:
  one of the four MV3 gotchas that seeded the then-empty `technologies/chrome-extension.md` stub
  (path resolution).
- **Reason:** portable to any MV3 extension read cold, and the failure is silent: nothing at the
  call site says a worker resolves relative paths against its own file.
- **Actor:** the growth-promote run, merged by @missingbulb (owner).
- **Mechanism:** prose; packs and checks did not exist yet.
- **Landed:** commit c90f0c51 (#98), the pre-pack corpus.

## 2026-08-12 · reworded · the corpus adopts the trigger-first rule shape (#775)
- **Reason:** the rule opens with the act, handing a path to a Chrome API or `fetch`; directive
  unchanged.
- **Actor:** @missingbulb (owner).
- **Landed:** #775 · pack version 2.
