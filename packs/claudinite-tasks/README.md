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

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `task-declaration-shape` | high | correctness | check: blocking |
| `task-declaration-matches-folder` | high | correctness | check: blocking |
| `task-code-work-env` | high | correctness | check: blocking |
| `task-md-only-when-agentic` | high | correctness | check: blocking |
| `task-phase-discipline` | medium | complexity | check: advisory |

The **task contract** ([the writing-tasks skill](skills/writing-tasks/SKILL.md)): whether a task is
*written* correctly, judged by the pack that runs it. Relevance-first — all five are inert until the
repo carries a `tasks/<name>/task.mjs` of its own.

- `task-declaration-shape` — a task declaration the scheduler reads is incomplete or illegal, so the task never fires or fires wrong.
- `task-declaration-matches-folder` — a declaration disagrees with its folder: discovery drops it into `errors` and every run keeps reporting healthy without it.
- `task-code-work-env` — a task reads a `CLAUDINITE_*` variable code-work never sets, so a parameter (a scope filter, a dry-run switch) silently never arrives and the run goes green in its most dangerous mode.
- `task-md-only-when-agentic` — an agentless task carries a `task.md`, which the corpus reads as "an agent runs here": prose no session will ever open, judged by the routine contract and named by every work item as the file the run is about.
- `task-phase-discipline` — a task decides not to run after its precondition already said run, hiding the decision from the run records.
