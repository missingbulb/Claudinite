## 2026-06-20 · born · Add portable Claude rules docs (5235b9d3)
- **Source:** `engineeringPractices.md`.
- **Reason:** a shell hook has no conversation access and fires per turn, so it cannot carry work
  that needs live session context.
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose.
- **Landed:** commit 5235b9d3.

## 2026-08-12 · reworded · Rewrite RULES.md as situation-keyed rules, and write down the method (#760)
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule, triggered on "Automating something that needs live conversation
  context".
- **Landed:** #760, closing #759 · pack version 1.
