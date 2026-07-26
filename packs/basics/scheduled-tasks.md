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

## What the checks guard

- **The scheduler workflow is a thin shim.** The vendored
  `claudinite-scheduler.yml` carries a single **hourly** cron on a repo-hashed
  minute constrained to **:10–:50** (the one repo-specific value in the stub —
  `engine/scheduler/hash-minute.mjs`, a pure function of the repo full name that
  bootstrap stamps in and baselining re-derives), a `concurrency` group, a
  `workflow_dispatch` trigger, and a call into the vendored engine entry — no logic of its own
  (schema and behaviour changes ride the vendor refresh, not workflow edits). It
  is the repo's **only** cron; every other recurring workflow stays
  `workflow_dispatch`-only. Off-band or multiple crons, or a missing
  concurrency/dispatch guard, break staggering, double-run safety, or manual runs.

- **Every task declaration carries the full contract.** A `tasks/<name>/task.mjs`
  default-exports `id` (matching its directory), `frequency` (`hourly | daily-2h
  | daily-1h | daily | daily+1h | weekly | monthly`), `precondition_signals` (the collector
  vocabulary), `agent_model` (`opus | sonnet | haiku | none`), `expected_outcome` (`none |
  open-pr | merged-pr`), `agent_instructions`, and a `precondition`. The scheduler and
  executor read agent_model/expected_outcome/frequency from this file — never from the dispatch
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

- **Preprocessing is optional, bounded, and task-local.** A task may declare
  `agent_preprocessing` — a command the scheduler runs as a subprocess before the
  agent (its executable a script beside `task.mjs`, no absolute path or `..`) —
  which then **requires** `agent_preprocessing_timeout`, the hard subprocess kill
  that fails the task on overrun.

- **A task says which repo secrets it needs; someone is asked to add them.**
  Preprocessing runs Action-side, so repo Actions secrets are reachable there and
  nowhere else in a task's life (an executor session carries none). A task lists
  what it needs in `required_secrets` — a **declaration, not a permission**: the
  scheduler unpacks the workflow's secrets bundle into every worker's env, and the
  list exists to drive the *ask*. This is the adoption interview's shape applied to
  configuration: declared, minus what the repo has, equals a gap that produces a
  question — asked interactively at adoption (bootstrap Part 2), and as one
  standing owner issue from the scheduler when a run finds a secret missing. It is
  never a gate: a repo can sit with one unconfigured, and the task that needs it
  simply doesn't work yet. The consequence worth designing around: **a workflow
  that exists only to hold a secret is redundant** — fold its work into the task's
  preprocessing rather than dispatching and polling a second workflow from an agent.

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
