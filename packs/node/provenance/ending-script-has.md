## 2026-09-15 · born · Halve the test suite: unblock the long pole (#2062)
- **Source:** a defect the faster suite surfaced in this canon's own runners, measured on pristine
  `main` against Node v22.22.2: with six cores busy, 15 of 60 `spawnSync` callers of
  `check_the_world.mjs --list` got its ~150-row catalog cut off at a row boundary, exit status 0,
  empty stderr, no signal of any kind that the answer was short. Moving both runners to
  `process.exitCode` took it to 60 of 60 under the identical load.
- **Reason:** a write to a pipe is asynchronous and `process.exit()` discards what is still queued,
  so the hazard is every caller that captures the output rather than inheriting it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, its own "Ending a process" section.
- **Retire when:** Node makes pipe writes synchronous or flushes them on `process.exit()`; a hook or
  CLI whose exit code is its whole protocol is the sanctioned holdout, and says so at its call site.
- **Landed:** #2062 · pack version 60915.1.
