# claudinite-tasks — the task execution surface

The work-item queue and everything that runs it: the scheduler run (instantiate each
declared pack's tasks at their anchors), the executor (validate one item, collect its
task's signals, run its precondition and worker, deliver at its outcome ceiling), the
janitor's recovery rules, the task contract, calendar/anchor math, dispatch, run
records, code-work, and the delivery lane (`land-pr.mjs`, `deliver-generated.mjs`).
Declaring this pack is what puts scheduled work on a repo — including the daily
`update` task's ability to run at all. A repo without it runs no scheduled work and
updates only through a human session (the update or adopt-pack skills): no forced
auto-update.

The mechanism's design, scenario play-throughs and decisions-on-record live with the
canon maintainers' docs; the operating documents a member session reads at runtime
ship in this pack — `executor.md` (the executor routine), `queue/instructions.md`
(a work-item session's whole brief), `deliver-pr.md` (the agent-lane delivery
procedure).

## `shared-code/` — the published import surface

`shared-code/*` is the one place another pack's code may import from a pack it
`requires` (barriers-enforced): the work-item/dispatch title grammar and
outcome-label decode, anchor math, the GitHub REST helpers, the delivery lane, and
task-declaration validation. Everything else in this tree is internal to the pack.

## Wiring

The two workflow stubs (`stubs/`) are written into a member's
`.github/workflows/` once, at adoption, with the repo's hashed cron minute and its
`taskScheduler.dailyHour` anchors; their `run:` lines name this pack's mount paths,
so releases change behavior without ever editing the YAML again. Secrets reach the
executor as one static `CLAUDINITE_SECRETS: ${{ toJSON(secrets) }}` line; each
code-work task sees exactly the names its declaration lists.

## The built-in task

`queue/tasks/implement-request/` is the task a marked issue's work item names
(ids `engine/implement-request` — the pre-move spelling every open item decodes
to). It rides this pack like any task; `model_from_request` stays fenced to it.
