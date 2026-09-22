## 2026-07-22 · born · Per-project scheduling - Phase 0: engine/scheduler, groundwork, checks, task conversions (#396)
- **Source:** Phase 0 of the per-project maintenance scheduling design (#394).
- **Reason:** a declaration the scheduler reads is member-owned data no vendoring pass rewrites, so
  an incomplete or illegal one is caught where it is written rather than when the task fails to fire
  or fires wrong.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a world check, `packs/basics/task-declaration-shape.mjs`.
- **Landed:** #396 (Refs #394).

## 2026-08-07 · reworded · Three-responsibility task machinery: janitor split, precondition-only gating, prework rename, exec-status distillation (#675)
- **Source:** owner requirements 16-17 of 2026-08-06.
- **Reason:** the "pre-agent preprocessing" framing went - execution is two similar consecutive
  phases, prework then agentic work - so the check flags the legacy field names the contract's door
  normalizes away.
- **Actor:** @missingbulb (owner).
- **Landed:** #675.

## 2026-08-18 · reworded · Retire the slot scheduler: delete run.mjs, the slot half of slots.mjs, the slot stub and FORCE_TASKS (#993)
- **Reason:** the frequency vocabulary and the anchor arithmetic moved to `calendar.mjs`, and the
  check reads the vocabulary from there rather than from the retired slot module.
- **Actor:** @missingbulb (owner).
- **Landed:** #993 (Closes #974).

## 2026-08-19 · moved · Rename core to claudinite-lifecycle, grow_with_claudinite to claudinite-growth, and move the scheduled-task contract between them (#1029)
- **Actor:** @missingbulb (owner).
- **Mechanism:** the check follows the scheduled-task contract into claudinite-growth.
- **Landed:** #1029.

## 2026-08-23 · reworded · Collapse the frequency vocabulary and take the cron to two ticks a day (#1230)
- **Reason:** `hourly` cannot mean anything under a cron that fires twice a day, and the `daily±Nh`
  offsets staggered dependent tasks by clock hour where `after:` declares the same intent and
  enforces it. The retired tokens normalize permanently at the declaration-load door, because a task
  declaration is member-owned data no vendoring pass rewrites; this author-time check is what stops
  a NEW declaration naming one.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1230 (Refs #1225, #1231).

## 2026-08-24 · moved · Extract the task surface into claudinite-tasks, move the update flows, split the wiring converge (#1326)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the check moves into the pack whose contract it validates,
  `packs/claudinite-tasks/worldRules/task-declaration-shape.mjs`.
- **Landed:** #1326 (Closes #1325) · pack version 60824.1.

## 2026-08-30 · reworded · Auto-merge policies: expected_outcome 'none'/'pr' plus a granular, built-ins-first automerge field (#1464)
- **Reason:** `expected_outcome` collapsed to `none`/`pr` with the merge decision in its own
  `automerge` field, and the retired `open-pr`/`merged-pr` spellings normalize at the one door - so
  the rename is an advisory at author time, never red CI on a member file nobody edited.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Landed:** #1464 (Closes #1459) · pack version 60830.5.

## 2026-09-02 · reworded · Declarative task preconditions, and the repo-active silence gate (#1583)
- **Reason:** with the gate declared as a list of named conditions rather than written as code, the
  check can report an unknown term or a malformed argument at author time, and can enforce that a
  declaration carries exactly one of the two forms.
- **Actor:** @missingbulb (owner).
- **Landed:** #1583 · pack version 60902.1.

## 2026-09-02 · reworded · Retire the precondition() function form - one gate mechanism (#1622)
- **Reason:** two gate forms meant every reader, every check and the evaluator itself had to ask
  which one was the gate. Both retired spellings are rejected BY NAME here as well as in the
  contract, so a declaration carrying one is told what replaced it instead of reading as a task that
  simply forgot its gate.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1622 (Refs #1617) · pack version 60902.8.

## 2026-09-03 · reworded · Task declarations move from task.mjs to task.json (#1636)
- **Reason:** a task declaration is data, so it became `tasks/<name>/task.json` against a schema.
  The retired module form still loaded at the door with an advisory naming the conversion, so a
  member's own local-pack tasks kept running until its nightly update converted them; a missing
  `description` is asked for as an advisory for the same reason, since a converted task carries
  none.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #1636 (Closes #1635, Refs #1633) · pack version 60902.10.

## 2026-09-05 · reworded · A task declares what its run does to pull requests, and the executor resolves the target once (#1707)
- **Reason:** `expected_outcome` grew from the two-word ceiling to four words that also carry the
  target policy, and the retired `none`/`pr` normalize at the door beside `open-pr`/`merged-pr`, so
  the check advises the rename rather than failing an unedited member file.
- **Actor:** @missingbulb (owner).
- **Landed:** #1707 · pack version 60905.1.

## 2026-09-06 · reworded · Scheduling is the task's own precondition; the scheduler keeps no state (#1733)
- **Reason:** a task declares `trigger` - who mints an occurrence - and `preconditions` says only
  what must then hold, judged identically whichever asked; the cadence became a term over the task's
  own run history, so `frequency` retired behind a door and the check validates the new pair.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1733 (Closes #1731, Refs #1725) · pack version 60906.9.

## 2026-09-06 · reworded · Retire the task.mjs module form of a task declaration (#1795)
- **Reason:** the conversion had run everywhere the advisory would have caught a straggler, so the
  retired-module-form branch and the precondition-function scan come out and `task.json` is the only
  declaration a task folder may carry.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1795 (Refs #1656, #1633) · pack version 60906.15.

## 2026-09-21 · weakened · a task-local term may declare that it takes an argument (#2214)
- **Reason:** the check reads a task's own `preconditions.mjs` as text and recognised only
  `needsItem` on a term, so every task-local term read as taking no argument and a declaration
  carrying one was rejected. No task-local term could be parameterised at all; the usage review's
  own `window-has-sessions:10` was the first to want it, and the gap would have blocked every future
  one the same way.
- **Mechanism:** the text parser widened to read `takesArg` beside `needsItem`, which are the two
  properties of a term a declaration can be wrong about. Still read as text and never imported,
  since a check must not execute a member's own module.
- **Landed:** #2214

## 2026-09-22 · severity-changed · a retired outcome ceiling is illegal, not a rename (#1920)
- **Reason:** the door that mapped `open-pr`, `merged-pr`, `pr` and `none` onto today's ceilings is
  gone, so the author-time surface has to say the same thing the runtime now does. An advisory
  rename would tell an author the value still works, which is the failure mode a retirement exists
  to prevent: a word nobody reads must not be a word that silently works.
- **Mechanism:** the three advisory-rename branches collapse into one blocking finding naming the
  ceiling as illegal.
- **Actor:** claudinite/engine implement-request run, rebased and reconciled in an owner session.
- **Model:** claude-opus-5
- **Landed:** #1920

## 2026-09-22 · severity-changed · the retired `frequency` field blocks where it used to advise (#2138)
- **Reason:** the runtime contract rejects a declaration carrying the field, so the author-time
  surface has to say the same thing: a check that only advised would let a member's `task.json` pass
  CI and then fail at load. The two validate one contract, which is what stops them drifting.
- **Mechanism:** the field is flagged blocking and by NAME, carrying the cadence term to write
  (`trigger: request` for `manual`, which meant no schedule at all), so its author is told the
  replacement rather than reading as a task that simply forgot its cadence.
- **Rejected:** leaving the check silent on the field, which the brief's "delete the acceptance"
  could also have meant. A silent check is the shape that lets the declaration through to a
  load-time failure.
- **Actor:** claudinite/engine implement-request run, rebased and reconciled in an owner session.
- **Model:** claude-opus-5
- **Landed:** #2138

## 2026-09-22 · strengthened · a second form of the work step, checked like the first (#2225)
- **Source:** the owner: "it seems redundant to not take advantage of a centralized runner, which
  would, at the very least, deal with process exit, error logging, timing, parameter passing" -
  asked for as `code_worker_mjs`, a module with a `worker` entry point taking a parameters bag, with
  the runner wrapping it and the two forms never declared together.
- **Reason:** every worker re-implemented the same shell around its own work, and the sweep in this
  same pull request is what that costs: 34 print-then-exit sites, each its own copy of an entry
  point. The runner already owns the subprocess, so the wrapping is one module's rather than every
  worker's.
- **Mechanism:** the check learns the field beside the runtime contract, in the same change, because
  the two read the same declaration from different sides - this one as text at author time, the
  contract parsed at run time - and a check taught one of two identical surfaces reads as strictness
  on the other. Both refuse the pair, and both name the field the declaration actually carries.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5
- **Retire when:** `code_work` is gone and the raw form has no callers left, at which point the
  either-or branches collapse to one.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
