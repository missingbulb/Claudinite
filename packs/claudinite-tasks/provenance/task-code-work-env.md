## 2026-08-18 · born · Retire the slot scheduler: delete run.mjs, the slot half of slots.mjs, the slot stub and FORCE_TASKS (#993)
- **Source:** the owner's own comment on #974 asking for the guard.
- **Reason:** a task reading a `CLAUDINITE_*` variable the executor never hands it fails in the one
  way nothing catches - the variable is undefined, the parse yields an empty result, and the run
  goes green having done something else. That is how three fleet tasks kept taking parameters
  through `CLAUDINITE_OVERRIDES` after the queue stopped setting it: `REPOS` could not bound the
  sweep and `DRY_RUN` could not withhold its writes, so every fleet-baseline run was unscoped and
  live.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a blocking world check, `packs/core/task-prework-env.mjs`, whose legal set is the
  key set of the object the executor actually builds, imported rather than restated, so it
  quantifies over the contract instead of naming the two variables that were broken this time.
- **Rejected:** naming the broken variables in the check, which would need extending by hand for the
  next one.
- **Landed:** #993 (Closes #974).

## 2026-08-19 · moved · Rename the code phase to code-work, and stop calling tasks scheduled-only (#1013)
- **Reason:** the phase is code-work, so the check is named for what it guards.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the check is renamed `task-code-work-env`, at `packs/core/task-code-work-env.mjs`.
- **Landed:** #1013.

## 2026-08-19 · moved · Rename core to claudinite-lifecycle, grow_with_claudinite to claudinite-growth, and move the scheduled-task contract between them (#1029)
- **Actor:** @missingbulb (owner).
- **Mechanism:** the check follows the scheduled-task contract into claudinite-growth.
- **Landed:** #1029.

## 2026-08-24 · moved · Extract the task surface into claudinite-tasks, move the update flows, split the wiring converge (#1326)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the check moves into the pack that owns the executor it quantifies over,
  `packs/claudinite-tasks/worldRules/task-code-work-env.mjs`.
- **Landed:** #1326 (Closes #1325) · pack version 60824.1.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
