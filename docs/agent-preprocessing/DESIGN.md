# Task pre-agent preprocessing — design

Status: **proposed** (owner-driven; the three gating decisions were taken in
session 2026-07-23 and are recorded in §10). A capability added to the
per-project scheduler ([`../per-project-scheduling/DESIGN.md`](../per-project-scheduling/DESIGN.md));
this record extends that one and does not restate it. Refs #394.

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
   changed contract. (This is exactly the finding of the open design PR #405 —
   see §8.)

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
instructions in the issue). The executor discovers it the same way #407's
maintenance flow does: **find the task family's open PR by head-branch prefix**
and continue on it. So:

- Preprocessing opens (or reuses) the PR for this `(pack, task)` family on a
  deterministic branch prefix.
- The executor, on a `model !== none` continuation, resolves the open PR by that
  prefix, checks out its head, and does the agentic remainder there.

This reuses the exact `findOpenPrByPrefix` idea #407 introduces (see §8 for the
reconciliation) rather than inventing a second branch-discovery mechanism.

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

## 8. Interaction with in-flight work

- **PR #405 (open, design-only) — this record obsoletes only its execution-host
  third; the rest survives and stays valuable.** #405 splits into two halves:
  - **Obsoleted** (its premise was a *private* canon): the whole "Execution host
    — why the executor, not the scheduler Action" section, the **executor
    code-dispatch path**, and the **`model: haiku` interim**. A public canon lets
    preprocessing fetch head Action-side and commit natively — a delivery option
    #405 explicitly ruled out only because it assumed the Action can't reach canon
    ("vendor enough to self-refresh offline… impossible" rejected the *stale
    offline copy*, not a *live public fetch*).
  - **Survives — absorbed here as tracked work (§11), since #405 is now closed
    (owner, 2026-07-23):** the 7-step mechanical/agentic **classification**; the
    machine-readable **`agentic` flag** on migration records + its conformance
    check (with `pack-independence` as first user); the **stamp/agentic-note
    coupling rule**; **`converge-wiring.mjs`** (+ bootstrap Part 6 calling it, the
    drift guard); the **check-fix subsumption audit**; and the "file residual
    findings as one issue, fix none" stance. That surviving content **is** the
    spec for what baselining's preprocessing (§7) actually runs.
  - **Division of ownership:** this doc owns the *mechanism* (the preprocessing
    stage, Action-side host, timeouts, dropping canon); re-scoped #405 owns the
    *baselining pipeline content* and the migration-note `agentic` primitive. They
    reference each other.
- **PR #407 — SUPERSEDED (owner, 2026-07-23).** #407 renamed the maintenance
  delivery branch per-cycle (date + random seed) and found the open PR by prefix,
  but on the OLD fleet-apply **MCP** path. E4's baselining delivery is native-git
  Action-side, so it carries its own equivalent (the `claudinite/maintenance-<date>-<seed>`
  prefix + `openMaintenanceBranch` find-by-prefix in `worker.mjs`) rather than depending
  on #407's unmerged branch. #407 can be closed.
- **Per-project-scheduling Phase 2 (next in #394).** Phase 2 authors four new
  canon tasks. The contract change (§2) should land **before or with** Phase 2 so
  those tasks are written against the final contract, not retrofitted.

## 9. Checks & docs to update

- `engine/scheduler/task-contract.mjs` — the three fields + validation (§2).
- `packs/basics/task-declaration-shape.mjs` (+ test) — enforce the §2 rules,
  including "agentless-with-no-preprocessing is an error" and the containment of
  the preprocessing command.
- `engine/scheduler/run.mjs` — the two-stage flow, subprocess spawn + kill,
  deferred labeling (§3); retire the in-process inline path (§4).
- `engine/scheduler/validate-dispatch.mjs` — accept the new fields.
- `engine/scheduler/executor.md` — self-budget (§6.1), per-task stale bound
  (§6.2), sources = project only (§7).
- `vendoring/compute-vendor-set.mjs` (+ test) — include `migrations/` (§7).
- `packs/basics/tasks/baselining/{task.mjs,task.md}` — converge-as-preprocessing;
  agent stage gated on a flagged-agentic note.
- `packs/chrome-extension-release/tasks/store-release/task.mjs` — convert to the
  preprocessing form (§4).
- `packs/basics/scheduled-tasks.md`, per-project-scheduling `DESIGN.md`/
  `MIGRATION.md` cross-refs, bootstrap Part 6 (project-only sources).

## 10. Decisions on record (owner, 2026-07-23)

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

## 11. Open questions & absorbed work

Tracked here now that #405 is closed (§8):

- **`agentic`-flag mechanics on migration records** (from #405): a machine-readable
  flag (e.g. `agentic: { model, instructions }`) marking a note as needing the
  agent stage, plus a conformance check that a record describing member-side
  adaptation must carry it. How baselining's preprocessing reads it to decide
  whether to apply `ready-for-agent`.
- **Baselining's stamp/agentic coupling** (from #405, #329/#330): preprocessing
  advances the stamp only when every pending note is fully mechanical; the agent
  stage handles a flagged note and advances the stamp itself. Exact transaction
  boundary to be specified in the baselining rework.
- **`converge-wiring.mjs`** (from #405): the fresh-path wiring convergence as an
  idempotent script that bootstrap Part 6 *calls* (one source of truth, the drift
  guard) — a mechanical step baselining preprocessing runs.
- **The check-fix subsumption audit** (from #405, load-bearing): **DONE** —
  [`check-fix-subsumption-audit.md`](check-fix-subsumption-audit.md). Conclusion:
  it **is** safe to drive the common-night model toward `null`. Every check that
  judges standing repo state is world-scoped and so is caught by the
  `check_the_world` escalation gate; the 8 work-scoped checks the gate omits judge a
  *session's change* a mechanical converge never makes (no silent regression); only
  2 checks are deterministically subsumed today, and 3 world-scoped needs-judgment
  checks (`catalog-completeness`, `generated-merge-driver`, `cer/version-sync`) have
  rote fixes worth mechanizing later to reduce needless escalation.
- **Rollout sequencing** of the contract change vs. #407 vs. Phase 2 (§8) —
  ordering agreed in principle (#407 → contract → Phase 2), dates open.

### Implementation status

- **Increment 1 — the declaration contract (landed on this branch):** the three
  fields + runtime validation (`task-contract.mjs`), the static
  `task-declaration-shape` guard, the doc, and every agentic canon task carrying
  an `agent_execution_timeout`. Behaviour-preserving — no task yet declares
  `agent_preprocessing`, and the scheduler does not act on the new fields.
- **Increment 2a — the staging mechanism (landed):** `run.mjs` two-stage flow
  (`preprocess.mjs` subprocess spawn + hard SIGKILL timeout, failure → one open
  needs-human issue, agentful success → hand-off, §3).
- **Increment 2b — inline-path retirement + first proof (landed):** an agentless
  task now REQUIRES `agent_preprocessing` (contract + static check), the in-process
  inline worker path is removed, and `store-release` converts to a standalone
  subprocess worker (§4).
- **Increment 2c — executor best-effort bound (landed):** `validate-dispatch`
  returns `executionTimeout`; `executor.md` gives the subagent its "fail after N
  minutes" bound from the trusted task decl, never the issue body (§6).
- **§7-1 — the migration-record `agentic` flag (landed):** `migrationAgentic` /
  `agenticMigrations` in `migrations/registry.mjs` + the pack-independence record
  structured.
- **§7-2 — vendor `migrations/` into the mount (landed):** `compute-vendor-set.mjs`
  carries the applier + registry + records, so baselining reads notes locally.
- **§7-3 — `converge-wiring.mjs` (landed):** the deterministic fresh-path wiring
  convergence (scheduler workflow + hashed cron, settings hooks, retired-import
  removal), which bootstrap Part 6 and baselining both call — the single wiring
  source of truth.
- **E4 — baselining converge-as-preprocessing (landed):** `packs/basics/tasks/baselining/`
  gains a native-git `worker.mjs` (`agent_preprocessing`) that fetches PUBLIC canon
  directly, runs `apply-vendor-set` + `converge-wiring` + mechanical `migrations/apply`,
  holds the stamp for a pending `agenticMigrations()` note, and delivers the converge on
  a per-cycle maintenance branch (find-by-prefix; **supersedes #407**). The AGENT stage
  (`task.md`, now the residual only) is requested via the run.mjs **conditional hand-off**
  above — only on a pending agentic note or a converge left non-green by `check_the_world`
  (owner, 2026-07-23); every other night is agentless. Pure decision helpers are unit-tested;
  the native-git/clone/REST I/O is **live-pilot-gated (GCEC)** — not yet exercised in CI.
### Remaining work — start here (a fresh session picks up from this section)

**E4 and the GCEC conversion have LANDED** (branch `claude/agent-preprocessing-remaining-kymhh9`,
session 2026-07-23). The **GCEC mount bootstrap is DELIVERED** as a maintenance PR
(`GoogleCalendarEventCreator#712`, session 2026-07-23) — the out-of-band vendor refresh that
lands `executor.md` + the E4 `worker.mjs` into GCEC's mount. On merge it drains the 6 stuck
dispatches (#703–#708) and starts the real E4 live pilot. What's left is **E5**, gated behind
that merge + the pilot proving out.

- **E4 — baselining converge-as-preprocessing (LANDED).** `packs/basics/tasks/baselining/`
  now carries `worker.mjs` (native-git `agent_preprocessing`) + a rewritten `task.mjs`
  (agentic residual model + preprocessing/execution timeouts) + a rewritten `task.md`
  (the residual agent stage only). Owner decision (2026-07-23): **agentless common
  nights** via the run.mjs **conditional hand-off** (worker writes `CLAUDINITE_REQUEST_AGENT`
  only when a pending agentic note exists OR the converge left `check_the_world` non-green).
  **Supersedes #407** (native-git delivery carries its own maintenance-branch prefix / find-
  by-prefix). Pure decision helpers unit-tested. **Partial pilot done (2026-07-23):** against a
  real target stamped at an older ref, the public-canon clone (through the proxy, no token) →
  rootless tree → `apply-vendor-set` converged to HEAD **without tripping the anti-rewind
  guard**, `converge-wiring` rewrote the workflow + hooks, mechanical migrations were idempotent,
  and the agentic-note detection + stamp-hold + escalation decision were verified both ways
  (pending note → hold + escalate; no pending note → advance). **Residual:** the native-git
  `deliver()` (per-cycle branch push, PR create, auto-merge arm) needs one real Action-token
  run — the E5 gate. The check-fix subsumption
  audit ([`check-fix-subsumption-audit.md`](check-fix-subsumption-audit.md)) is **done** and
  clears the common-night model to go toward `null`; the escalation gate (`check_the_world`
  green + no pending agentic note) is the operative safety net now and after the flip.
- **GCEC task conversion (LANDED, its own repo/PR).** `missingbulb/GoogleCalendarEventCreator`,
  branch `claude/agent-preprocessing-remaining-kymhh9`: `fallback-extractor-improvements`
  gained `agent_execution_timeout`. No deterministic pre-step was split into
  `agent_preprocessing` — its baseline must be *seen* by the agent and preprocessing has no
  code→agent channel; the fetch/scaffold pre-step belongs to the still-legacy create-extractor
  routine (outside `tasks/`).
- **FLEET-FIX — `executor.md` was never vendored (LANDED in this branch/#413).** Root cause of
  GCEC's broken executor (`GoogleCalendarEventCreator#710`): `compute-vendor-set` stripped ALL
  engine `*.md`, including `engine/scheduler/executor.md` — the executor routine's operating
  instructions. So **every cut-over consumer's executor booted with no instructions and could
  drain nothing.** Fixed with a `VENDORED_ENGINE_DOCS` whitelist + regression tests. Baselining
  can't self-heal this (a refresh re-excludes the file), so the fix must **merge**, then each
  cut-over consumer's mount needs a one-time out-of-band refresh to pull it (below).
- **GCEC mount bootstrap (DELIVERED — `GoogleCalendarEventCreator#712`, deadlock-breaker).** GCEC
  was stuck: broken executor → can't run baselining → can't refresh its mount to *get* the fix.
  With #413 merged (canon head `61b90ee`), GCEC's `.claudinite/shared/` was converged to that
  fixed head **out-of-band** via `vendoring/apply-vendor-set.mjs` — a GCEC maintenance PR, **NOT**
  through the executor (the anti-rewind guards passed: stamped `b5103ea` is an ancestor of
  `61b90ee`). That single refresh (28 files, 192-file set, 0 deletions, stamp `b5103ea → 61b90ee`)
  lands `executor.md` **and** the new E4 baselining `worker.mjs` + its primitives (vendored
  `migrations/`, `converge-wiring.mjs`, `preprocess.mjs`, the `run.mjs`/`task-contract.mjs`/
  `validate-dispatch.mjs` updates). **On merge:** the executor has instructions and drains the 6
  stuck dispatches (#703–#708); baselining becomes the Action-side worker. This refresh **is** the
  start of the real E4 pilot.
- **E5 — drop canon from the executor CCR session (NEXT after #712 merges + the pilot proves out).**
  `executor.md` sources become the project alone; update bootstrap Part 6 and the executor-routine
  creation to provision a project-only environment. Keep canon in GCEC's executor sources until it
  baselines onto the new worker, THEN re-create project-only.

**⚠️ PILOT GATE — the scheduler workflow can't `deliver()` yet (found 2026-07-23).** Two
independent facts block a real Action-side pilot run of baselining's `deliver()`:

1. **Can't force it via `workflow_dispatch`.** Baselining is `daily-2h` (the 02:00 slot); the
   run-ledger due-slot math (`slots.mjs`) makes a slot due only when it falls in
   `(lastSuccess, now]`, and the hourly scheduler already consumes it. A manual dispatch prints
   `- no tasks due` (empirically confirmed, GCEC run 30019987993). So the pilot fires **only in
   the natural 02:xx run**, and only when the stamp is `> 1d` old — after the out-of-band
   bootstrap re-stamped GCEC to head (2026-07-23), the first eligible fire is ~2026-07-25 02:xx.
2. **`deliver()` would 403 on permissions.** `worker.mjs` `deliver()` `git push`es the
   maintenance branch and opens/auto-merges a PR using the Action `GITHUB_TOKEN`, but the
   vendored `stubs/claudinite-scheduler.yml` grants only `contents: read` (+ `issues: write`,
   `actions: read`). With an explicit `permissions:` block, `contents` is read and
   `pull-requests` defaults to `none` — the push and the PR both fail. This is a gap in the E4
   landing: `store-release` (the other scheduler-run worker) deliberately **delegates** delivery
   to a separate write-perm workflow to keep the scheduler read-only, whereas E4's baselining
   pushes **directly** and the stub was never provisioned for it.

   **Resolved (owner, 2026-07-23): widen the scheduler stub.** The stub now grants
   `contents: write` + `pull-requests: write` (matches E4's direct-push design; the read-only
   invariant `store-release` preserves by delegating is dropped for the scheduler, which runs
   only trusted committed code — untrusted issue bodies go to the tokenless executor). A
   `scheduler-workflow-shape` drift-guard asserts both writes so a repo can't silently regress to
   read-only. Two owner-only steps remain per repo: the setting *Allow GitHub Actions to create
   and approve pull requests* and *Allow auto-merge*. And because the scheduler workflow file
   lives in `.github/workflows/` (converged by `converge-wiring`, delivered *by* baselining), the
   first GCEC run needs the write-perms bump applied **out-of-band** to GCEC's own workflow — the
   same deadlock-break as the executor.md bootstrap — before it can self-deliver.

**Live-pilot checklist for E4 (owner, before E5):** once the gate above is resolved, run
baselining's `worker.mjs` against a real GCEC scheduler run — confirm the public canon clone, the
converge writes, the per-cycle maintenance branch/PR, auto-merge arming, the stamp-hold on the
pending `pack-independence` agentic note, and that a clean night is truly agentless (no
`ready-for-agent` filed).
**Partial pilot already done** (converge path validated locally against a real older-stamped
target; only the native-git `deliver()` needs a real Action-token run) — see the E4 bullet above.

**Working notes.** Prefer git-free fs-fixture tests (see
`engine-tests/scheduler/converge-wiring.test.mjs`) over `makeRepo` where possible —
`makeRepo` does real git commits that hang and leak file descriptors if the signing MCP
degrades. Watch `ls /proc/542/fd | wc -l` (the env-manager) and pace full-suite runs
(~800 FDs each, cap 4096) to avoid re-triggering the outage the prior session hit.
Baseline sweeps: 0 blocking, 4 pre-existing file-placement advisories.
