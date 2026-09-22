## 2026-09-22 · born · a cadence-only gate on the fallback lane (#2247)
- **Source:** the owner asking whether Claudinite files too many issues, PRs and Action runs, and
  the repo's own folds answering with numbers: 65 work items in W38 against 88 workflow runs, 197
  jobs and 131 billed minutes, of which 27 were four bookkeeping tasks whose gate is a proxy that is
  true nearly every day.
- **Reason:** `task-janitor`'s preconditions were its cadence and nothing else, which cannot decline
  — 7 items a week, each closed within the hour, to report a healthy queue. The canon's own
  `writing-tasks` blesses a cadence-only task, so the rule is narrowed to the shape where the
  healthy run finds nothing.
- **Actor:** @missingbulb (owner).
- **Model:** Opus 5
- **Mechanism:** prose in the local pack's scheduled-tasks section, not a check — the shape it
  names (backstop, fallback, sweep) is a judgment about what a task is for, which no declaration
  carries, and a check over cadence-only preconditions would fire on the seven tasks the canon
  legitimately blesses.
- **Rejected:** a new `probe` rung on the declaration, and a `commit_to_base` outcome — the
  precondition mechanism already carries a task's own term, and the owner keeps the PR as the record
  for generated files.
- **Retire when:** the machinery reports what a run did somewhere other than an issue, so a run that
  finds nothing costs nothing to record.
- **Landed:** #2247
