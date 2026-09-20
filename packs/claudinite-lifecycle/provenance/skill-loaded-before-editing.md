## 2026-09-03 · born · converted from references.md (check:skill-loaded-before-editing)
- **Reason:** #1648: a post-hoc finding alone sends the agent back over work the skill would have
  prevented, so the guard stops the first file-tool edit; the guard sees no Bash-made edit, so the
  rule exists to close that gap.
- **Mechanism:** a check
- **Retire when:** Retire it when file edits can no longer bypass the guard.
