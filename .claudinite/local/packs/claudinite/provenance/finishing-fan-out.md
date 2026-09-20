## 2026-09-16 · born · converted from references.md (RULES-92)
- **Reason:** 2026-09-15's capture on #2074 (session f3d8d7fb, 16:53–17:14): the owner opened "I
  think some tasks are stuck", the session read the queue, and the owner had to correct it — "I
  meant your background tasks". Nothing was running: six subagents and ten background commands had
  all returned, leaving 8 worktrees, 12 stale branches and two `Wait for…` tasks that went on
  firing completion notifications for agents that had finished. Two owner turns and a queue-wide
  audit were spent on wreckage.
- **Mechanism:** prose
- **Retire when:** Retire the rule if the harness reclaims a finished agent's worktree and branch on
  its own.
