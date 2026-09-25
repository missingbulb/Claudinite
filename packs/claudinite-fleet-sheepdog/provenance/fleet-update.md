## 2026-08-11 · born · the operator's lever to force every member to baseline now (#750)
- **Source:** `fleet-add-missing-packs`' first real run parked for a human, because its
  dispatch asked the enforcer's own executor to act on four member repos and that session is
  correctly scoped to the enforcer alone.
- **Reason:** the fan-out model is what works: the enforcer presses each member's own scheduler
  button and everything agentic happens inside the member. Under per-project scheduling the fleet
  needs no push in the ordinary case; this is for the un-ordinary ones.
- **Actor:** @missingbulb (owner).
- **Mechanism:** an agentless task on the ordinary work-item queue rather than a workflow, never due
  on any cadence, run only from an item a person creates. It retired the standalone workflow and the
  `.github/` managed copy that only the withhold-and-hand-to-the-agent path could deliver.
- **Landed:** #750 (Closes #749).

## 2026-08-23 · reworded · the lever reports outcomes, not dispatches (#1294)
- **Reason:** a dispatch returning 204 says a run was queued and nothing more. A report built from
  those 204s describes the sweep's own outgoing calls while reading as fleet-wide delivery: one run
  announced 13 fired, 0 failed where 9 of the 13 took nothing. The sweep now follows each member to
  a terminal condition read off the member itself and fails the run when a dispatched member never
  got there. `already-current` is kept a success of its own, because folding it into a failure
  reports a fault that is not there and into `converged` claims work that did not happen.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1294 (Closes #1293) · pack version 60823.2.

## 2026-09-07 · policy-changed · the dormancy pre-filter is kept, against the brief (#1851)
- **Reason:** dropping it was asked for and two reasons said not to. It was never a second
  authority, since it calls the member's own predicate, so there was no disagreement to remove, only
  a dispatch per dormant member spent learning what the declaration in hand already said. And it
  would silently break the forced-include channel: the member's own gate stops a woken run too, so
  every forced dispatch would self-skip while the sweep reported it fired.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the sweep keeps calling the dormancy predicate the `claudinite-tasks` pack now
  publishes, rather than the engine setting that carried it before.
- **Landed:** #1851 (Closes #1845) · pack version 60907.1.

## 2026-09-07 · reworded · it imports the measurement half under its own name (#1855)
- **Reason:** the module the lever depends on was two thirds measurement and one third issue family;
  with the issues gone, leaving it named for a mechanism it no longer has is the trap that has
  broken a check against an export removed under it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1855 (Closes #1854) · pack version 60907.2.

## 2026-09-22 · reworded · print-then-exit swept out of this element (#2225)
- **Reason:** a print immediately before `process.exit()` is discarded when stdout has not drained,
  so the status survived and the output did not; the exit sets `process.exitCode` now and the flow
  returns. No policy moved.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5

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

## 2026-09-25 · reworded · renamed from fleet-baseline, its file moved with it
- **Reason:** owner decision retiring the baseline vocabulary: the lever forces each member's
  update, so it is named for it. The report's `converged`/`did-not-converge` outcomes became
  `updated`/`did-not-update` for the same reason.
- **Actor:** @missingbulb (owner).
- **Rejected:** renaming the sweep's `FLEET_BASELINE_*` environment knobs: a hand-run still setting
  the old `DRY_RUN` name would run live.
