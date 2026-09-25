## 2026-09-03 · born · converted from references.md (check:skill-loaded-before-editing)
- **Reason:** #1648: a post-hoc finding alone sends the agent back over work the skill would have
  prevented, so the guard stops the first file-tool edit; the guard sees no Bash-made edit, so the
  rule exists to close that gap.
- **Mechanism:** a check
- **Retire when:** Retire it when file edits can no longer bypass the guard.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
