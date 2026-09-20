## 2026-09-11 · born · converted from references.md (RULES-86)
- **Reason:** #1934, 2026-09-11: the same converge recomputes the same tree from the same base every
  night, so reusing the pull request would have force-pushed an identical answer onto it each cycle;
  each force-push gives the pull request a new head and discards the checks that had already run,
  which on a member waiting for slow CI is the difference between eventually landing and never
  landing. `worker.mjs` compares trees rather than commits because this cycle's commit is new by
  construction — its own timestamp — and only the content decides whether anything is owed.
- **Mechanism:** prose
- **Retire when:** Retire the rule if GitHub stops keying check runs to the head sha.
