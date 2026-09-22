## 2026-08-24 · born · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** split out of the converge-an-unattended-run rule, whose tail this was; a reader can
  arrive at it without that one.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Closing a run outcome:done".
- **Landed:** #1315 (Closes #1312).
