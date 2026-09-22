## 2026-08-24 · born · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** split from the fleet-machinery rule, which carried both reading an API write's status
  and judging delivery.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Judging whether fleet delivery worked".
- **Landed:** #1315 (Closes #1312).
