## 2026-09-15 · born · converted from references.md (RULES-4)
- **Reason:** Measured on this canon (#2062) against Node v22.22.2: `check_the_world.mjs --list`
  printed a ~150-row catalog and exited, and with six cores busy **15 of 60** `spawnSync` callers
  got it cut off at a row boundary — exit status 0, empty stderr, no signal of any kind that the
  answer was short. Converting the runner to `process.exitCode` took it to 60 of 60 under the
  identical load. The hazard needs output written *before* the exit and a pipe on the other end,
  which is every caller that captures rather than inherits.
- **Mechanism:** prose
- **Retire when:** Retire the rule if Node makes pipe writes synchronous or flushes them on
  `process.exit()`; a hook or CLI whose exit code is its whole protocol is the sanctioned holdout,
  and says so at its call site.
