## 2026-08-24 · born · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** #1004's fielded-import table was built by walking the trunk's pack history: scanning
  every ref fires on whatever is in flight, and an import that only ever existed on an unmerged
  branch was never delivered to anyone.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Asking which imported symbols are still fielded".
- **Landed:** #1315 (Closes #1312).
