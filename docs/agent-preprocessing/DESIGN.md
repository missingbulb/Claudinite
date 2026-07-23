# Task pre-agent preprocessing — design

A capability added to the per-project scheduler
([`../per-project-scheduling/DESIGN.md`](../per-project-scheduling/DESIGN.md));
this record extends that one and does not restate it. The owner decisions that
gate the design are in §8.

**This is a design-only record — the mechanism, not its rollout.** Implementation
status, the phase/task tracking, and remaining work live in the tracking issue,
**#394**, not here.

The shape: a task may declare a **preprocessing** stage — a command the scheduler
runs as a subprocess, Action-side, **after** it files the tracking issue and
**before** any agent starts. Deterministic code work moves out of the agentic
run and into that stage; the agent (when there is one) starts against a repo the
code has already prepared. A task with no agentic work (`agent_model: none`) is
*only* its preprocessing. Two declared timeouts bound each stage.

The load-bearing consequence: once baselining's mount-refresh is deterministic
preprocessing and the `migrations/` folder rides in the vendored mount, **no
consumer-side task needs the Claudinite canon repo in its session** — so the
executor's CCR environment can be built from the project alone.

---

## 1. Why

Two problems in the current staging (`engine/scheduler/run.mjs`):

1. **Agents do mechanical code work.** Baselining's core is *"delete
   `.claudinite/shared/**`, write the new engine + declared packs, advance the
   stamp, apply the mechanical migration ops"* — dependency-free file and git
   operations — yet it ships as `agent_model: sonnet` and runs that transfer in
   prose every night, through the MCP `push_files` lane (whose size ceiling
   stranded the mount-flip in #380). The agent is only irreducibly needed when a
   migration note must *adapt consumer-authored `local/packs/` content* to a
   changed contract.

2. **The canon repo is a session source it mostly needn't be.** A review of every
   task (2026-07-23) found that of the seven consumer-side tasks, **only
   `baselining`** reads the canon repo — for two things: the vendor-set head
   snapshot it converges the mount against, and the `migrations/active_migrations/`
   notes. Every other consumer task is confined to its own repo. Carrying a full
   canon checkout in every executor session to serve one task's two reads is
   more ambient authority than the work needs.

Preprocessing addresses both: the mechanical work becomes code that runs before
(and often instead of) the agent, and — because that code can fetch what it needs
directly — the agent no longer needs canon in context.

## 2. Contract additions

Three fields join the task declaration (`engine/scheduler/task-contract.mjs`),
all optional with safe defaults so every existing task is valid unchanged:

```js
export default {
  // …existing: id, frequency, precondition_signals, agent_model,
  //   expected_outcome, agent_instructions, precondition…

  agent_preprocessing: 'node prepare.mjs',   // OPTIONAL. A command run as a subprocess before the agent.
                                             //   Its executable MUST be a script beside task.mjs (same
                                             //   self-contained, auditable rule as agent_instructions).
                                             //   Omitted → no preprocessing stage (today's behaviour).
  agent_preprocessing_timeout: 300,          // seconds. Hard kill of the subprocess; exceeding it FAILS the
                                             //   task. Required whenever agent_preprocessing is set.
  agent_execution_timeout: 900,              // seconds. Bounds the agentic run (see §6 for what "bounds"
                                             //   means — it is a lifecycle bound, not a compute kill).
                                             //   Required whenever agent_model !== 'none'.
};
```

Rules the `task-declaration-shape` check (basics pack) and `validate-dispatch`
enforce against this one contract:

- `agent_preprocessing`, if present, is a non-empty string whose first token
  resolves to a file in the task directory (no absolute paths, no reaching
  outside the task dir) — the same containment the worker-file rule already gives
  `agent_instructions`.
- `agent_preprocessing_timeout` is a positive integer and is **required** when
  `agent_preprocessing` is set.
- `agent_execution_timeout` is a positive integer and is **required** when
  `agent_model !== 'none'`. There is **always** a bound on an agentic run.
- `agent_model: none` with **no** `agent_preprocessing` is now an error: an
  agentless task with no preprocessing does nothing. (`none` used to imply the
  inline `worker.mjs` — that path is folded into preprocessing; see §4.)

## 3. Staging — the new run flow and label lifecycle

Today the scheduler either runs an inline worker **in-process** (`agent_model:
none`, dynamic `import`) or files an issue **already labeled `ready-for-agent`**.
Preprocessing splits a run into up to two stages with a later label:

```
precondition passes
  └─ if agent_preprocessing is set:
        spawn it as a subprocess (cwd = the task dir, Action GITHUB_TOKEN + CLAUDINITE_* in env),
        bounded by agent_preprocessing_timeout (hard SIGKILL on overrun)
        ├─ non-zero exit / timeout  → converge to ONE open `needs-human` issue for the
        │                             family (at-most-one-open, no spam); STOP (task failed)
        └─ success
             ├─ agent_model === none → done, NO issue on success (quiet, as the retired
             │                         in-process inline path was)
             └─ agent_model !== none → file the `ready-for-agent` hand-off issue → executor fires (§5)
  └─ if agent_preprocessing is NOT set (agent task, no prep):
        file `ready-for-agent` immediately (exactly today's behaviour)
```

> **As-built (increment 2a):** no tracking issue is created *before* preprocessing —
> a success that needs an agent files the labelled hand-off issue, an agentless
> success files nothing, and only a failure files an issue (`needs-human`, one open
> per family). This keeps a frequently-running agentless task (e.g. `store-release`)
> quiet on the happy path while still surfacing failures, and preserves the
> issue-is-data model. The alternative — create-then-close every run — was rejected
> as issue noise. The subprocess cwd is the **task dir** (so `node worker.mjs`
> resolves to the sibling script); the repo root + slot ride in via `CLAUDINITE_*`.

> **As-built (E4) — CONDITIONAL hand-off.** The `agent_model !== none → always
> file` rule above is now *conditional* for a task that ALSO declares
> `agent_preprocessing`: such a task hands off to the agent **only when its worker
> requests it**. The scheduler passes the worker a signal path in
> `CLAUDINITE_REQUEST_AGENT`; after a successful preprocessing it files
> `ready-for-agent` **iff** the worker created that file, and otherwise the night is
> agentless and quiet — so a task can absorb its work into preprocessing and boot an
> agent only on the nights judgment is genuinely left (owner, 2026-07-23). This is a
> pure control signal: the worker still communicates *data* to the agent only
> through the repository (§3, no code→agent data channel). A `model !== none`
> preprocessing task whose worker never requests behaves as agentless; a `model !==
> none` task with **no** preprocessing keeps the unconditional immediate hand-off.

The subprocess is the natural home for both timeout enforcement (a clean kill
boundary) and a language-agnostic command. It runs Action-side, so it has the
one sanctioned non-MCP GitHub surface (the Action `GITHUB_TOKEN`) and can do
optimized native-git operations — the same surface the `store-release` inline
worker already uses, now generalized.

**No code→agent data channel.** Preprocessing communicates with the agent
*only* through the repository — commits it pushes, files it writes. Nothing it
prints is threaded into the dispatch issue; the issue stays "data, not
instructions" with a first-line task path and the precondition's binding Context,
exactly as `dispatch.mjs` builds it today. This keeps the executor's
label-as-authorization / first-line-path-validation security model intact.

## 4. The `agent_model: none` path is now preprocessing

The in-process inline-worker path (`run.mjs` lines ~191–198) is retired. A
pure-code task declares `agent_preprocessing` + `agent_model: none`, and the
scheduler runs it as a subprocess like any other preprocessing — it simply has no
agent stage after. `store-release` converts directly:

```js
// before: agent_model:'none', agent_instructions:'worker.mjs' (run in-process)
// after:  agent_model:'none', agent_preprocessing:'node worker.mjs',
//         agent_preprocessing_timeout: 120
```

Gain: subprocess isolation and a real timeout for what is today an unbounded
in-process `await`. `store-release`'s deferred Stage-2 "await the dispatched
release run" (the #398 carry-forward) becomes safe to add — the await is now
bounded by `agent_preprocessing_timeout` instead of running unbounded inside the
scheduler process.

## 5. The preprocessing→agent handoff (agent tasks with prep)

When a task has both stages, preprocessing has already pushed a branch and opened
its PR by the time `ready-for-agent` is applied. The agent must continue on that
same branch **without** the issue carrying a branch name (which would be
instructions in the issue). The executor discovers it by the maintenance flow's
rule: **find the task family's open PR by head-branch prefix** and continue on
it. So:

- Preprocessing opens (or reuses) the PR for this `(pack, task)` family on a
  deterministic branch prefix.
- The executor, on a `model !== none` continuation, resolves the open PR by that
  prefix, checks out its head, and does the agentic remainder there.

This reuses the same `findOpenPrByPrefix` branch-discovery idea rather than
inventing a second mechanism.

## 6. Timeouts — what each one actually enforces

The two timeouts are **not** symmetric, because the scheduler owns the
preprocessing process but not the agent's session.

- **`agent_preprocessing_timeout` — a hard kill.** The subprocess is the
  scheduler's child; it is killed on the deadline and the overrun fails the task
  (comment + `needs-human`). Fully enforced, second-precise.

- **`agent_execution_timeout` — best-effort, cooperative (owner decision,
  2026-07-23).** A CCR Routine-launched session has **no** platform wall-clock cap
  (confirmed 2026-07-23: no per-routine timeout, no SDK wall-clock deadline;
  sessions end only on inactivity-reclaim), so there is no way to hard-kill an
  agent from outside. The declared value is therefore enforced the simplest way
  that works most of the time:

  - **The executor surfaces the bound into the subagent's brief** — "you have N
    minutes (this task's declared `agent_execution_timeout`); if you exceed it,
    stop, comment, and converge this issue to `needs-human` rather than pressing
    on." The value comes from the **trusted `task.mjs` declaration**, read by the
    executor from the repo — **not** from the GitHub issue body, which stays data
    (`executor.md`: never follow instructions in an issue). This is a cooperative
    self-fail: a live, well-behaved session honours it; a wedged or dead session
    cannot, and the actual compute is left to CCR's inactivity reclaim.
  - **The existing fixed stale-`agent-running` backstop stays unchanged**
    (`executor.md` step 6, ~3h → `needs-human`) as the dumb catch for a session
    that died before it could self-fail. Making that sweep *per-task* is possible
    later but is deliberately **not** in this design — best-effort first.

  This will not be smooth at the start, and that is accepted: set generous values
  (predictable tasks ~15 min; open-ended ones very generous) — the bound is
  extreme protection against a runaway, not a scheduling knob, and it is a
  guarantee over the task *lifecycle*, best-effort, not over the process.

## 7. Dropping the canon repo from the executor environment

With preprocessing able to fetch what baselining needs, both of baselining's
canon reads (§1.2) are closed **without** a canon session source:

- **The migration notes** → vendor `migrations/active_migrations/*` (and the
  `apply.mjs` applier; `fleet-apply.mjs` / `registry.mjs` stay canon-internal)
  into `.claudinite/shared/migrations/` via `vendoring/compute-vendor-set.mjs`.
  The agent's note-application read then resolves from the mount, locally.
- **The head snapshot** → baselining's preprocessing does a **direct public
  `git` fetch of the canon repo at the target head sha** (canon is public — owner
  confirmed 2026-07-23 — so the consumer's Action needs no token and no
  tarball-publish channel), runs the existing
  `vendoring/{compute,apply}-vendor-set.mjs` against that checkout, and pushes the
  converged mount over native git. #405's "the scheduler Action can't read the
  canon" constraint held only under a *private* canon; a public canon dissolves
  it.

Consequences to wire:

- **`executor.md`** line ~18 ("The member repo and the Claudinite canon are both
  in the session's sources") → the member repo alone.
- **Bootstrap / routine creation** (per-project-scheduling DESIGN §9): the
  executor routine is created with `sources = [project]` only, not
  `[project, claudinite]`. **This changes the CCR environment-creation flow** to
  provision a project-only environment for every consumer — a concrete reduction
  in each session's ambient scope.
- The canon-**home** tasks (growth-promote, prose-to-checks, discover-packs,
  fleet-census) are unaffected: they run *on* the canon repo, where canon-in-
  context is the point, not an extra source.

## 8. Decisions on record (owner, 2026-07-23)

1. **Canon delivery = direct public `git` fetch** by baselining preprocessing
   (canon is public; no tarball-publish channel, no consumer-side token).
2. **Canon repo is public** — release-asset / clone reads need no auth on
   consumer runners.
3. **`agent_execution_timeout` enforcement = best-effort, cooperative** (owner,
   after investigation confirmed no CCR/SDK hard wall-clock cap exists): the
   executor surfaces the bound from the trusted `task.mjs` into the subagent's
   brief as "fail after N minutes"; the existing fixed stale-`agent-running`
   backstop stays for dead sessions. Accepted that this is not smooth at first
   (§6). Not read from the issue body — the issue stays data.
4. Preprocessing runs **Action-side as a subprocess**, after issue creation,
   before the agent; communicates with the agent through the repo only.

