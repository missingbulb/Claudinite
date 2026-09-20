## 2026-09-06 · born · converted from references.md (RULES-75)
- **Reason:** `updates-export-removed` (added 2026-09-06) exists so a removed export cannot wedge
  every member's stale worker. Measured on #1819 both ways: deleting one `export *` line from
  `updates/terminals.mjs` produces the finding, and deleting all six modules of that tree produces
  none — `repo-context.mjs:639` returns `[]` for any path not in `tracked`, and a deleted file is
  not tracked.
- **Mechanism:** prose
- **Retire when:** Retire the rule if `removedLines` starts reporting deleted files.
