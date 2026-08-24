# Task code-work — design

A capability added to the per-project scheduler
([`../per-project-scheduling/DESIGN.md`](../per-project-scheduling/DESIGN.md));
this record extends that one and does not restate it. The owner decisions that
gate the design are in §8.

**This is a design-only record — the mechanism, not its rollout.** Implementation
status, the phase/task tracking, and remaining work live in the tracking issue,
**#394**, not here.

> **Renamed (owner, 2026-08-06):** this record now describes the **code-work**
> phase — contract fields `code_work` / `code_work_timeout` (legacy
> `agent_preprocessing*` accepted and normalized at load). Code-work and agentic
> work are similar, consecutive phases of one task execution; neither decides
> whether the task runs — that is the precondition's alone
> (per-project-scheduling DESIGN §12). The prose below predates the rename and
> keeps its original vocabulary where quoting history.

The shape: a task may declare a **code-work** stage — a command the scheduler
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

Two problems in the current staging (`packs/claudinite-tasks/run.mjs`):

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
   snapshot it converges the mount against, and the `migrations/` notes. Every other consumer task is confined to its own repo. Carrying a full
   canon checkout in every executor session to serve one task's two reads is
   more ambient authority than the work needs.

Preprocessing addresses both: the mechanical work becomes code that runs before
(and often instead of) the agent, and — because that code can fetch what it needs
directly — the agent no longer needs canon in context.

## 2. Contract additions

Four fields join the task declaration (`packs/claudinite-tasks/task-contract.mjs`),
all optional with safe defaults so every existing task is valid unchanged:

```js
export default {
  // …existing: id, frequency, precondition_signals, agent_model,
  //   expected_outcome, agent_instructions, precondition…

  code-work: 'node prepare.mjs',   // OPTIONAL. A command run as a subprocess before the agent.
                                             //   Its executable MUST be a script beside task.mjs (same
                                             //   self-contained, auditable rule as agent_instructions).
                                             //   Omitted → no preprocessing stage (today's behaviour).
  code_work_timeout: 300,          // seconds. Hard kill of the subprocess; exceeding it FAILS the
                                             //   task. Required whenever code-work is set.
  agent_execution_timeout: 900,              // seconds. Bounds the agentic run (see §6 for what "bounds"
                                             //   means — it is a lifecycle bound, not a compute kill).
                                             //   Required whenever agent_model !== 'none'.

  required_secrets: ['SOME_API_KEY'],        // OPTIONAL. The repo Actions secrets this task needs
                                             //   CONFIGURED (§9). Declarative — the wiring converge
                                             //   stamps them into the workflow and the owner is
                                             //   asked for any the repo lacks.
};
```

Rules the `task-declaration-shape` check (basics pack) and `validate-dispatch`
enforce against this one contract:

- `code_work`, if present, is a non-empty string whose first token
  resolves to a file in the task directory (no absolute paths, no reaching
  outside the task dir) — the same containment the worker-file rule already gives
  `agent_instructions`.
- `code_work_timeout` is a positive integer and is **required** when
  `code_work` is set.
- `agent_execution_timeout` is a positive integer and is **required** when
  `agent_model !== 'none'`. There is **always** a bound on an agentic run.
- `required_secrets`, if present, is an array of secret names. That is the whole
  rule: whether the repo has configured them is a fact about the repo, answered by
  the wiring converge and baselining, never at author time (§9).
- `agent_model: none` with **no** `code_work` is now an error: an
  agentless task with no preprocessing does nothing. (`none` used to imply the
  inline `worker.mjs` — that path is folded into preprocessing; see §4.)

## 3. Staging — the new run flow and label lifecycle

Today the scheduler either runs an inline worker **in-process** (`agent_model:
none`, dynamic `import`) or files an issue **already labeled `ready-for-agent`**.
Preprocessing splits a run into up to two stages with a later label:

```
precondition passes
  └─ if code-work is set:
        spawn it as a subprocess (cwd = the task dir, Action GITHUB_TOKEN + CLAUDINITE_* in env),
        bounded by code_work_timeout (hard SIGKILL on overrun)
        ├─ non-zero exit / timeout  → converge to ONE open `needs-human` issue for the
        │                             family (at-most-one-open, no spam); STOP (task failed)
        └─ success
             ├─ agent_model === none → done, NO issue on success (quiet, as the retired
             │                         in-process inline path was)
             └─ agent_model !== none → file the `ready-for-agent` hand-off issue → executor fires (§5)
  └─ if code-work is NOT set (agent task, no prep):
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
> `code_work`: such a task hands off to the agent **only when its worker
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

**No code→agent data channel, with one named exception.** Preprocessing
communicates with the agent *only* through the repository — commits it pushes,
files it writes. Nothing it prints is threaded into the dispatch issue; the issue
stays "data, not instructions" with a first-line task path and the precondition's
binding Context, exactly as `dispatch.mjs` builds it today. This keeps the
executor's label-as-authorization / first-line-path-validation security model
intact.

**The exception: the artifacts this run created** (owner decision, 2026-08-06).
A worker that opens a branch or a PR writes their identifiers into the
agent-request file, and `dispatch.mjs` renders them as a `### Delivered by
code-work` section — a PR number and a branch ref, which is how the agent
addresses them. An agent left to rediscover them instead can only search, and a
search that finds nothing is indistinguishable from nothing having been created.

The exception is deliberately narrow, and the security model is unchanged: this
channel carries **identifiers for what this run created**, never findings, never
instructions, never anything the agent then executes. The first line is still the
task path, Context is still the binding scope, and the agent still reads its
behaviour from the task file alone. **If the issue names no artifact, none
exists.**

## 4. The `agent_model: none` path is now preprocessing

The in-process inline-worker path (`run.mjs` lines ~191–198) is retired. A
pure-code task declares `code_work` + `agent_model: none`, and the
scheduler runs it as a subprocess like any other preprocessing — it simply has no
agent stage after. `store-release` converts directly:

```js
// before: agent_model:'none', agent_instructions:'worker.mjs' (run in-process)
// after:  agent_model:'none', code-work:'node worker.mjs',
//         code_work_timeout: 120
```

Gain: subprocess isolation and a real timeout for what is today an unbounded
in-process `await`. `store-release`'s deferred Stage-2 "await the dispatched
release run" (the #398 carry-forward) becomes safe to add — the await is now
bounded by `code_work_timeout` instead of running unbounded inside the
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

- **`code_work_timeout` — a hard kill.** The subprocess is the
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

- **The migration notes** → vendor the recent `migrations/<date>-<slug>/`
  records (and the `apply.mjs` applier + `registry.mjs`)
  into the mount's `engine/migrations/` and `packs/<pack>/migrations/` via `vendoring/compute-vendor-set.mjs`.
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


## 9. Required secrets

Preprocessing runs Action-side, so a repo's **Actions secrets** are reachable
there. They are reachable *nowhere else* in a task's life: the executor session is
MCP-only and carries no repo token or secret, by design (§7). The consequence
worth designing around is that **a workflow whose only job is to hold a secret on
an agent's behalf is redundant** — an agent that had to dispatch such a workflow,
poll it, and pull its result can instead do the work in its task's preprocessing.

A task states what it needs:

```js
required_secrets: ['SOME_API_KEY'],
```

That is the entire mechanism at the task level. Two things read it, and nothing
else does:

1. **The executor** selects it out of the secret bag and puts it in the work step's
   environment, where a worker reads `process.env.NAME` as before. The executor
   workflow carries every repo secret in one static line
   (`CLAUDINITE_SECRETS: ${{ toJSON(secrets) }}`) and `secrets-bag.mjs` is its only
   reader, so this list decides what one task sees rather than what the workflow
   passes. Nothing about a declaration rewrites a workflow — that coupling is what
   wedged a member in #1296, since `.github/workflows/` is the one path a converge
   cannot write (#1301).

2. **Baselining** asks the owner for any declared name the repo has not configured
   — one open issue per repo, matched by exact title, so an unconfigured secret
   costs one issue rather than one per night.

This is the **adoption interview's posture**, deliberately: a declared requirement,
minus what the project has, drives an *ask*. It is never a gate, never a
conformance finding, and never fails a run. A repo may sit with a secret
unconfigured; the task that needs it does not work until someone adds it, and says
so in its own words when it runs.

### What this does not change

Secrets are a *worker* capability, not a channel to the agent: preprocessing still
communicates with the agent only through the repository (§3), so a secret's product
is a committed artifact, never a value threaded into the dispatch issue.
