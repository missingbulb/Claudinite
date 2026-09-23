## 2026-08-18 · born · growth-extract: split the retention prune out as its own agentless task (#992)
- **Reason:** deleting a capture past retention is arithmetic on dates, and keeping it inside the
  opus run kept a precondition arm alive whose only job was to dispatch that run on a quiet repo.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** `tasks/logs-prune/`, agentless - one `code_work` worker over the conversation-logs
  branch.
- **Landed:** #992 (Closes #964).

## 2026-09-03 · policy-changed · logs-prune: give retention_days a 10-day default, declare capture-only (#1621)
- **Reason:** unset meant the prune deleted nothing, so the branch grew unbounded while the task
  reported success; a declaration the worker cannot read still prunes nothing.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** `resolveRetentionDays` in the task's pure module, applied by both the precondition
  and the worker; canon names the task in `disabledTasks` instead.
- **Landed:** #1621 (Closes #1620).

## 2026-09-20 · policy-changed · Take logs-prune off the schedule: it deletes captures only when asked (#2135)
- **Reason:** a capture the calendar decided to delete is data loss nobody asked for.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the declaration's `trigger`, with the cadence term dropped beside it and the
  precondition granting the run where no retention reading is present.
- **Landed:** #2135 · pack version 60920.1.
