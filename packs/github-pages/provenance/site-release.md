## 2026-09-18 · born · Rebuild github-pages as a nightly release task over one deploy workflow (#2101)
- **Source:** the owner, 2026-09-17: the hosting packs should have "a daily release task that will
  bump the version and release if there was any change"; the shape is `cloudflare-site`'s
  `site-release`, which already had it.
- **Reason:** a release is a version number, a push, a dispatch and a wait, and none of the four is
  a judgment call, so the work is code and the queue supplies what a push-triggered workflow could
  not: the trigger, the gate, the retry and the park lanes. The bump lands before the deploy because
  only one of the two drifts is silent: a site serving a version the repo has no record of. A
  version consumed by a release whose deploy then failed is visible in the park and costs nothing.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, Claude Fable 5.1, per the commit trailers.
- **Mechanism:** a task, scheduled, due daily and gated on `unreleased-commits`, its own term
  because no built-in asks a release's question; `agent_model: none` since there is no judgment to
  make, `expected_outcome: no_code_changes` because the bump commits to the default branch rather
  than opening a pull request nobody could usefully review, and `on_interrupt: needs-human` because
  a release is a one-shot external effect a reclaimed claim must not re-run.
- **Landed:** #2101 · pack version 60917.1.

## 2026-09-20 · policy-changed · A task cadence measures whole UTC periods, not a per-repo anchor (#2182)
- **Reason:** `taskScheduler.dailyHour` and its siblings let a repo move the boundaries a cadence
  was measured against, which put a seam inside every day: before the anchor hour the current period
  was still yesterday's, so one run read as consumed at 03:00 and as open at 09:00. A period is now
  the UTC calendar and nothing else, and the term says out loud what it is, a rate limit on the
  scheduler's own asking rather than a claim that there is work to do. A corpus-wide decision, cited
  here.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the declaration's `due:daily` precondition becomes `schedule:at-most-daily`; the
  gate on real work is still `unreleased-commits` beside it.
- **Landed:** #2182 (Closes #1995) · pack version 60920.3.

## 2026-09-21 · policy-changed · entry points set exitCode instead of exiting hard
- **Reason:** `process.exit(1)` in an entry point's catch discards whatever stdout has not drained;
  measured here, a run piped to a slow reader delivered 309 of 200,000 lines, while
  `process.exitCode = 1` delivered all of them. The exit status is unchanged; only the output
  survives.
- **Mechanism:** the guard already runs as the module's entry point, so letting the process end
  naturally is enough; nothing waits on the event loop after the catch.
- **Actor:** @missingbulb (owner), replacing #2082 whose diff predated the src/ layout move.
- **Model:** Opus 5

## 2026-09-22 · converted · The work step is declared as `code_worker_mjs` and the runner wraps it
- **Reason:** every worker re-implemented the same wrapping - the environment parsed by hand, the
  exit code, the failure line, the elapsed time, the agent-request file - and each copy was free to
  get it slightly differently wrong. The runner already owns the subprocess, so it owns the entry
  point: the module exports `worker(params)` and holds the work and nothing else.
- **Mechanism:** `code_worker_mjs` names the module beside the declaration; the executor spawns
  `claudinite-tasks`' own `worker-entry.mjs` around it, hands the module the parsed `CLAUDINITE_*`
  bag (the task's declared secrets and the Action token among it) and renders the verdict it returns
  into the queue's triage, requeue and agent-request protocol. No behaviour of the task changes: the
  same work runs, exits the same way and prints the same markers.
- **Actor:** @missingbulb (owner), who asked why every task re-implements one runner's job.
- **Model:** Opus 5
