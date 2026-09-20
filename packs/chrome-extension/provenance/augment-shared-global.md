## 2026-07-03 · born · seeded into the corpus file from a member's local docs (c90f0c51)
- **Source:** GoogleCalendarEventCreator's local docs (shared-global augmentation): one bullet that
  also carried the reset-on-reinjection half.
- **Actor:** the growth-promote run, merged by @missingbulb (owner).
- **Mechanism:** prose; packs and checks did not exist yet.
- **Landed:** commit c90f0c51 (#98), the pre-pack corpus.

## 2026-08-12 · split · the reset half becomes `reset-on-reinjection`; this rule keeps the augment directive (#775)
- **Reason:** the trigger-first pass gives each act its own rule: accumulating state is a different
  act from assembling a global.
- **Actor:** @missingbulb (owner).
- **Landed:** #775 · pack version 2.
