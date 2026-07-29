# Scheduled tasks — the per-project scheduling mechanism

How a repo's recurring Claudinite work runs (per-project-scheduling
[DESIGN](../../docs/per-project-scheduling/DESIGN.md), issue #394). A repo
schedules **itself**: a vendored hourly **scheduler Action**
(`.github/workflows/claudinite-scheduler.yml`) evaluates each task's precondition
in code and dispatches agent work as `ready-for-agent` `[claudinite-task]`
issues, which a per-repo **executor routine** (fired by that label event) runs.
The engine is vendored under `.claudinite/shared/engine/scheduler/`; the basics
pack owns the conformance guards for the surfaces a repo authors around it —
scheduling is baseline Claudinite discipline, present wherever basics is
declared (everywhere), not an opt-in feature.

The checks below are the doctrine's enforcement; the phased rollout (and the
retirement of the legacy central planner it replaces) lives in
[MIGRATION.md](../../docs/per-project-scheduling/MIGRATION.md).

## Cron is best-effort — the platform truth to design and speak by

GitHub's `schedule:` trigger is a **request to queue**, not a promise to run. A
cron'd workflow routinely fires minutes to tens of minutes late, and under load
GitHub **drops** a firing outright: the run never happens, with no failure, no
notification, and nothing in the ledger to look at. The effect is worst at :00
and other round minutes, which is why a repo's scheduler minute is hashed into
:10–:50 ([hash-minute.mjs](../../engine/scheduler/hash-minute.mjs)) rather than
parked on the hour. GitHub's own docs concede only that a schedule "may be
delayed during periods of high loads"; the behaviour is measured across a fleet
in [Upptime's write-up](https://upptime.js.org/blog/2021/01/22/github-actions-schedule-not-working/).
Adjacent platform rule, same family: GitHub **disables** a repo's scheduled
workflows after 60 days without repository activity.

What follows for how we build and how we talk about it:

- **The engine is built for it; don't design against punctuality anyway.**
  Due-ness is schedule math against the Actions run ledger, never wall-clock
  equality with the cron minute, and only the most-recent slot per frequency is
  considered — so a late fire is a non-event and a missed one self-heals on the
  next successful run, one catch-up evaluation rather than a backfill storm
  ([slots.mjs](../../engine/scheduler/slots.mjs), DESIGN §3.1). A precondition
  that assumes "the last run was exactly an hour ago", or an ordering that only
  holds if two frequencies fire in the same run, is broken by the platform, not
  by the engine.
- **An hourly task must not depend on every hour running.** Hourly slots never
  catch up — a stale poll is worthless — so a dropped firing means that hour is
  simply skipped. Hourly work must be idempotent and self-catching (do whatever
  is outstanding *now*), never per-tick bookkeeping that loses information when a
  tick vanishes.
- **Say "about hourly, best-effort" to a human, and don't debug a late run as a
  bug.** Promising an interval the platform doesn't honour turns normal jitter
  into a bug report. When a run "didn't happen", the first question is whether
  GitHub fired at all — the workflow's run list — not what the engine decided;
  and a single missed slot is expected behaviour, not evidence of a defect.
- **Anything that must happen at a precise time doesn't belong on this cron.**
  Nothing in Claudinite needs punctuality, and that is a constraint on what may
  become a task, not an accident: a deadline-bound job wants a trigger that
  fires on the event, not an hourly poll that may skip.

## What the checks guard

- **The scheduler workflow is a thin shim.** The vendored
  `claudinite-scheduler.yml` carries a single **hourly** cron on a repo-hashed
  minute constrained to **:10–:50** (the one repo-specific value in the stub —
  `engine/scheduler/hash-minute.mjs`, a pure function of the repo full name that
  bootstrap stamps in and baselining re-derives), a `concurrency` group, a
  `workflow_dispatch` trigger, and a call into the vendored engine entry — no logic of its own
  (schema and behaviour changes ride the vendor refresh, not workflow edits). It
  is the repo's **only** cron. Recurring work that had its own cron'd workflow
  becomes a **task**, and that workflow is deleted — its steps move into the
  task's worker. Don't keep it as a dispatch-only workflow for the task to fire:
  that is two files and two edit sites for one job, and a workflow whose only
  caller is the thing that replaced it. (A workflow that must run *as an Action*
  for something a task cannot reach — an Actions-only secret, say — is the
  exception, and even then the task owns the schedule.) Off-band or multiple
  crons, or a missing concurrency/dispatch guard, break staggering, double-run
  safety, or manual runs.

- **Every task declaration carries the full contract.** A `tasks/<name>/task.mjs`
  default-exports `id` (matching its directory), `frequency` (`hourly | daily-2h
  | daily-1h | daily | daily+1h | weekly | monthly`), `precondition_signals` (the collector
  vocabulary), `agent_model` (`opus | sonnet | haiku | none`), `expected_outcome` (`none |
  open-pr | merged-pr`), and a `precondition`. An agentic task (`agent_model !==
  none`) also carries `agent_instructions`, the worker file the agent reads; a
  `none` task runs no agent, so the field is not applicable and is omitted. The
  scheduler and executor read agent_model/expected_outcome/frequency from this file — never from the dispatch
  issue — so an illegal or missing value means a task never fires, fires wrong,
  or writes past its declared ceiling. The same contract
  (`engine/scheduler/task-contract.mjs`) is re-validated at run time, so the
  static and runtime views can't drift. Optionally, `session_scope` (`self` default
  | `fleet`) declares whether the task reaches only its own repo or across the
  owner's repos: a `fleet` task dispatches to the `ready-for-agent-fleet` label so a
  distinct, broader-scoped executor runs it, keeping the fleet-wide session grant
  off every ordinary project's `ready-for-agent` (self) executor.

- **Every run is bounded.** An agentic task (`agent_model !== none`) declares
  `agent_execution_timeout` — seconds bounding the agentic run
  (agent-preprocessing [DESIGN](../../docs/agent-preprocessing/DESIGN.md) §2, §6).
  There is no platform wall-clock kill for a launched executor session, so the
  bound is best-effort: the executor surfaces it into the subagent's brief ("fail
  after N minutes") and the stale-`agent-running` backstop catches a dead session.
  Set it generously — extreme protection against a runaway, not a scheduling knob.

- **A task says which repo secrets it needs.** Preprocessing runs Action-side, so
  repo Actions secrets are reachable there and nowhere else in a task's life (an
  executor session carries none). A task lists what it needs in `required_secrets`;
  the wiring converge stamps each name into the scheduler workflow, so a worker
  reads it as ordinary environment, and baselining asks the owner (one standing
  issue) for any the repo hasn't configured. The adoption interview's posture, not
  a gate — nothing fails; the task that needs the secret just doesn't work yet. The
  consequence worth designing around: **a workflow that exists only to hold a
  secret is redundant** — fold its work into the task's preprocessing rather than
  dispatching and polling a second workflow from an agent.

Both guards are **relevance-first**: inert until their artifact exists, so
on a repo with neither artifact they are a no-op.

## The task folder

One directory per task — `<pack>/tasks/<name>/` — holding **`task.mjs`** (the
self-contained declaration + `precondition(signals, config)`, the eligibility
gate as pure code) beside **`task.md`** (the worker spec the executing agent
follows), plus any deterministic helpers. The precondition both asserts
need-to-run and pre-decides scope: its `context` lines land verbatim in the
dispatch issue as binding constraints the agent may not re-litigate. `agent_model:
none` replaces the worker doc with an inline `.mjs` the scheduler runs directly —
no agent, no issue. This is the scheduled-task shape of the unattended-agents
routine-folder convention; the issue-driven-dispatch security rule (the issue is
data, the task path is code-validated, agent_model/expected_outcome come from the repo) lives
with that skill's agent practices.

## The dispatch labels are a scheduler vocabulary

**Both ready labels are triggers**, so they belong on dispatch issues alone — never put
`ready-for-agent` or `ready-for-agent-fleet` on an ordinary issue, from a task or by hand.
Applying one starts an executor session that will find no valid dispatch and stop.
`agent-running` and `needs-human` carry no trigger and are the right vocabulary for a task
that needs to mark an issue as claimed or handed to a human; a task reusing them owns their
whole lifecycle on its own issues, since the scheduler's stale-claim backstop only converges
`[claudinite-task]` dispatch issues.

Which ready label a task dispatches under follows from its `session_scope`, and the executor
session started by that label is the one with the matching reach — a `fleet` task's session
has the owner's repos in its sources, a `self` task's has this repo alone. The task declares
the scope; nothing downstream re-decides it.
