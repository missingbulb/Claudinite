## 2026-09-13 · born · Add the cloudflare-site pack: serving a static site from Cloudflare (#1982)
- **Source:** ClaudiniteWebsite's local pack, where this deployment existed as one repo's own
  machinery, generalized onto the shelf (Closes #1981).
- **Reason:** the release is a work item because the queue owns its trigger, its gate, its secrets
  and its park lanes. It preflights every claimed hostname in public DNS before it consumes a
  version number and parks `needs-human-action` naming the record it found, an inherited `CNAME` or
  a GitHub Pages apex address, so the previous host's leftovers are evaluated rather than handed to
  an adopter as checklist items; an unreachable resolver is inconclusive, never a verdict. The bump
  lands before the upload because of the two possible drifts only one is invisible, a site serving a
  version the repo has no record of.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a task, scheduled daily and gated on the branch having moved past the last release
  commit, read off the `Claudinite-Task:` trailer, with `on_interrupt: needs-human` and the two
  Cloudflare secrets declared so a missing one parks at the task's own gate before anything is
  touched.
- **Landed:** #1982 (Closes #1981) · pack version 60913.1.

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
