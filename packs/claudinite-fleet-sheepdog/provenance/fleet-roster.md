## 2026-08-13 · born · one walk answering coverage and freshness (#792)
- **Source:** the `fleet-census` and `fleet-freshness` sweeps, which walked the same fleet and
  classified the same repos twice from two independently maintained pieces of code.
- **Reason:** freshness claimed to take coverage as given and could not, because the census's
  verdict lived in another process on another cadence. The two had drifted: `exclude` was applied at
  different points, so an excluded repo carrying a declaration read covered to one and out of scope
  to the other, and each half's `unknown` failed its own run knowing nothing of the other's.
- **Actor:** @missingbulb (owner).
- **Mechanism:** one task, one enumeration, one declaration read per repo, and two pure views over
  the roster. The two issue families stay distinct because they close on unrelated conditions; what
  is never split again is the walk.
- **Landed:** #792 (Closes #788).

## 2026-09-07 · policy-changed · dormancy is read off the tasks pack, not the engine (#1851)
- **Reason:** as for the seed sweep. At this point a dormant member was still measured for
  freshness, on the ground that dormancy stops the scheduler and not the clock.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the sweep reads the predicate the `claudinite-tasks` pack publishes; what the
  declaration suppresses is narrowed to the no-scheduler verdict, so a member told to stop is not
  then reported for having stopped.
- **Landed:** #1851 (Closes #1845) · pack version 60907.1.

## 2026-09-07 · policy-changed · freshness answers on the run report, not in an issue (#1855)
- **Reason:** the dashboard measures the same fact from the same source and recomputes on load, so
  the issue family was a second surface for one question and the staler of the two, only ever as
  current as the last daily sweep. In the live fleet that read as three open issues naming members
  that had caught up hours after the sweep, beside one two days behind with no issue at all.
  Coverage still files issues, because no other surface answers it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the issue family and its converger are deleted; the measurement stays and the
  report names every behind member.
- **Landed:** #1855 (Closes #1854) · pack version 60907.2.

## 2026-09-13 · policy-changed · an ignored repo is never read, a dormant one never measured (#1976)
- **Reason:** an excluded repo was tested only after it was found uncovered, so one still carrying a
  declaration read covered. A dormant member leaves the freshness half entirely, reversing the
  decision this pack carried: nothing converges it and no fleet operation touches it, so a version
  gap there is a finding with no owner. It stays a covered member and is named as dormant.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the walk skips an excluded repo before its declaration is read and names it once
  under `ignored` with no verdict; a dormant member's mount probe is no longer paid for.
- **Landed:** #1976 (Closes #1975) · pack version 60913.1.

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
