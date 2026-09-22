## 2026-08-30 · born · Local packs keep no VERSIONS.md - the commit is their record (#1442)
- **Reason:** a local pack is neither versioned nor distributed, so a changelog beside it records
  nothing `git log` does not, while several growth runs a day collide on its top line.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Recording a local pack change".
- **Landed:** #1442 (Closes #1439).
