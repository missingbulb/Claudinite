## 2026-06-25 · born · Centralize portable lessons from the GoogleCalendarEventCreator working set (8ff4d9d0)
- **Source:** GoogleCalendarEventCreator's `dev/procedures/general`, reviewed against the whole
  corpus and centralized where it was not already covered.
- **Reason:** two failures kept arriving as confusing later errors: a setup script starting in the
  repo's parent, and a missing-module error on a clone that had never installed.
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** prose, in `engineeringPractices.md`.
- **Landed:** commit 8ff4d9d0.

## 2026-08-12 · reworded · Rewrite RULES.md as situation-keyed rules, and write down the method (#760)
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule, triggered on "Working in a fresh checkout or sandbox".
- **Landed:** #760, closing #759 · pack version 1.
