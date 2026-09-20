## 2026-09-01 · born · converted from references.md (RULES-35)
- **Reason:** #929: `FORCE_TASKS`'s replacement broke Shepherd's only caller because the migration
  enumerated this repo's own callers. #801/#907 is the same failure from the other side: two
  independently-maintained stub copies at one path declared different input names.
- **Mechanism:** prose
