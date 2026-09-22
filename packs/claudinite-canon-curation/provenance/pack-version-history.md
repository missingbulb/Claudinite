## 2026-09-05 · born · the version log becomes a derived record (#1726)
- **Source:** #1723, where versions stopped being cut inside pull requests: once no change writes
  its own row, the row has to come from somewhere.
- **Reason:** which pull requests a version shipped is a fact of the base branch's history - the
  first-parent commits between one bump and the next - so a weekly task retraces it and appends only
  the rows a version lacks, on a self-landing pull request whose policy covers those files alone.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a scheduled task, weekly and gated on commits under packs/, agentless: the squash
  subject carries the pull request's title, so nothing needs judgment. `supersede_existing_pr`,
  since each run recomputes every missing row and so contains the previous run's.
- **Rejected:** every pull request writing its own row (two changes in flight claim one number, and
  the row conflicts on the same line).
- **Retire when:** pack versions stop being cut on the base branch after the fact.
- **Landed:** #1726 (Refs #1723, #1689) · pack version 60905.2.

## 2026-09-21 · policy-changed · the record it writes moves under each pack's `provenance/`
- **Source:** the owner's call, on #2190's review: the version log is read by maintenance and never
  by a session or a member, like the decision log, so it belongs beside it.
- **Reason:** one folder holds everything the shelf keeps for its maintainers and nothing a member
  receives; the log stops vendoring with the rest of that folder, and a row landing can no longer
  read as a shipping change.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** the task's automerge class matches `packs/<id>/provenance/VERSIONS.md` alone, the
  path spelled once in `pack-versions.mjs` (`versionsPath`) for the writer, the check and the class.

## 2026-09-22 · policy-changed · the delivery target is handed in, never discovered (#1943)
- **Reason:** the second caller of `deliverGenerated`, changed for the same reason as the first: the
  branch a run delivers on is the executor's decision, and the window in which a worker had to fall
  back on discovering one has passed. A required parameter reaches every caller, which is why this
  pack is in a diff whose brief predicted two others.
- **Mechanism:** the worker passes `branch` through from `CLAUDINITE_TARGET_BRANCH`; the delivery
  seam requires it and the discovery parameters are gone.
- **Actor:** claudinite/engine implement-request run, conflicts resolved and rebased in an owner
  session.
- **Model:** claude-opus-5
- **Landed:** #1943
## 2026-09-22 · policy-changed · entry points set exitCode instead of exiting hard
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
