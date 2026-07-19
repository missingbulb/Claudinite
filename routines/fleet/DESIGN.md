# routines/fleet/ — the code planner for the daily maintenance routine

> **Status: Stages 1 and 2 implemented** (issue #241). Stage 1 — the engine (`registry.mjs`,
> `gates.mjs`, `signals.mjs`, `schedule.mjs`, `tasks/`), the plan wired into the census walk, the
> seed-migration mechanism that backfills a default-on pack into the existing fleet, an example pack task,
> `scheduling.md` + its enforcing check, and the plan-driven orchestrator. Stage 2 — single-object
> worker skills and the single per-repo `repo-tidy` unit (assess branches/PRs, act on issues, reconcile
> the tracker in one pass), with the standalone tidy routine retired into the pack that owns it. All
> built and tested.

The fleet daily maintenance routine ([../auto-all-repos-maintenance.md](../auto-all-repos-maintenance.md))
today fans an agent out to **every task × every member repo** every night, and decides *what to do*
in-session. Most repos have nothing to do for most tasks on most nights, so the expensive tier — a
model turn — is entered to discover "nothing to do." This engine moves that discovery into
**deterministic code** and lets agents run only the work a gate already proved is live.

## The one boundary: code decides, agents act

Every maintenance task is split into two halves that never mix:

- **"should I run" — the gate.** Code. Runs in the planner, over the run's own token.
  Given a repo + the signal bundle, returns `{ run, targets, reason }`. Costs an API read, never a
  token.
- **"what to do" — the worker.** A doc/skill a subagent runs, handed the gate's `targets`. Costs a
  model turn — spent only on `(repo, task)` units a gate marked live.

The planner is the aggregate of every gate; the orchestrator dispatches every worker. **The entire
worklist is computed by code that runs to completion and emits a plan, before a single worker agent
is spawned.** That boundary is the frugality lever.

## Process map — the orchestrator IS the routine session

```
[Routine session]  (agent, capable model, home repo)          ← orchestrator, one run
   ├─ run the core planner over the environment's repos ─► units  (plan.mjs — pure gate code, no pack)
   └─ per unit (all independent) ─►  [worker subagent] × N    ← children of the session
```

The planner is **pack-agnostic core code** (`plan.mjs`): the orchestrator hands it the environment's
repos — for each, assemble its declared packs' `run_daily` gates, run them, emit units. It never
enumerates GitHub, and it depends on **no** pack. An enforcer pack's coverage census (the account-spanning
audit that needs the fleet PAT) is a **separate, isolated** concern with its own dispatch — it never
gates the plan, so a missing or broken enforcer pack can't stop the day's work from being planned over
the repos already reachable. One supervisor owns the run (and the failure log).

## The task registry

A task descriptor is a plain object:

```js
{
  id:     'repo-tidy',                                   // stable task name
  scope:  'pack:<name>',                                 // 'fleet' | 'pack:<name>' (implicit for pack tasks)
  worker: 'packs/<name>/maintenance/<task>.worker.md',   // the "what to do" doc, canon-relative
  full_sweep_supported: true,                            // has a distinct weekly/full mode? (see below)
  smarts: 'medium',                                      // judgment the WORKER needs: 'high'|'medium'|'low'|'none' (see below)
  gate:   async (repo, signals, gh) => ({ run, targets, reason }),  // the "should I run" predicate
}
```

**The `full_sweep_supported` capability — declared, so the engine knows whether a weekly pass is even
meaningful.** Only some tasks have a *distinct* full mode: `repo-tidy` in full re-examines **all** open
branches / PRs / issues (not just the touched ones), `baselining` in full re-runs the bootstrap + the
whole check suite to catch member-side drift the canon diff can't see. Others have none — a task that either fires or
doesn't has nothing "fuller" to do. So each descriptor **declares `full_sweep_supported`**: on a
repo's `fullSweep` night the engine runs the full pass **only** of the tasks that declare
`full_sweep_supported: true` (it invokes their gate in full mode — the exhaustive candidate set); a
task with it omitted/false just runs its normal incremental gate, and `fullSweep` is a no-op for it.
This keeps the weekly sweep from *attempting* a full action a task doesn't have.

**The `smarts` level — declare the judgment the worker needs, and drive it down.** The gate is *always*
code (deciding "should I run" costs no model); `smarts` governs only the **worker** ("what to do"):

- `high` / `medium` / `low` → the worker subagent runs on a **descending capability tier**. The
  descriptor names the *need*, not a model — the engine resolves level → tier at dispatch, so the
  model mapping lives in **one** place and can change without touching a single task. (The current
  mapping is three tiers, most-capable → least; the tier names stay out of the descriptors on purpose.)
- `none` → **no agent at all.** The engine runs the worker as a direct **code / tool execution**, no
  subagent spawned. A `none` task is code end-to-end — gate *and* worker.

**Lowering a task's `smarts` is the standing goal** — push mechanical judgment out of the worker and
into code, tier by tier, exactly as the planner already did for the "should I run" half
(the agent-practices rule: "match the agent model to the judgment it must make," and "hard-code the
deterministic parts … push that boundary continually"). **`none` — code only — is the best version of
any task**; every tier down is a win, in cost and in reliability (a cheaper deterministic path can't
hallucinate the judgment a model tier might fumble). So `smarts` is not a fixed property but a *current
high-water mark* each task is meant to descend.

- **Every task is a pack task** — there is no fleet-core category (`registry.mjs`): a task is active
  exactly where its pack is declared. "Fleet-universal" is achieved by riding a universally-declared
  pack: **`baselining`** rides the baseline pack — restore the member to the current
    canonical baseline — re-run the idempotent bootstrap to refresh the mount + wiring, and evaluate the
    member against its declared packs' *current* checks (the same engine its Stop hook and CI run),
    applying each failing check's own `fix` and opening a member-side issue for any finding needing
    judgment. Incrementally gated by `canonChanged` (the canon shipped new checks/wiring →
    propagate them). Its **full** mode baselines regardless, catching member-side drift the canon diff
    can't see. (The census/adoption half of the sweep stays in the census executor, not this task.)
    Its gate self-skips the home repo — the canon doesn't mount itself.
  The growth lifecycle's member-side tasks ride the growth pack; its central promote stage
  rides a home-only curation pack (see the home-repo paragraph under
  [Where it lives](#where-it-lives--the-planner-is-core-the-census-is-the-enforcer-packs)) — an
  ordinary planned unit, **not** a bespoke orchestrator step.
- **Pack tasks** register exactly like a pack's checks and skills — the **`run_daily: [...]`**
  field on `pack.mjs`, listing descriptor modules (parallel to `rules`, `skills`, `env`). A task
  declared by a pack applies to a repo **iff** the
  repo declares that pack in `.claudinite-checks.json`. Adding a task is dropping a `(gate, worker)`
  pair — the engine discovers it, no orchestrator edit.
- **A member's own local packs could contribute tasks too — EXPERIMENTAL, not enabled by default.** A
  repo's `.claudinite/local_packs/` packs can carry `run_daily` descriptors exactly like a canon pack,
  but they live in the *member* tree, not the canon checkout the planner reads. The planner takes an
  injected `localTasksFor(repo)` seam ([local-tasks.mjs](local-tasks.mjs)) that fetches each member's
  local-pack descriptors over the same MCP `gh`, imports each self-contained descriptor, and tags it
  with its pack and `workerRepo` so the unit's worker is read from the member. This path is built and
  tested but **not yet proven for arbitrary member-authored daily jobs**, so the orchestrator does
  **not** wire `localTasksFor` (the seam defaults to none → no local task planned). Enable it
  deliberately once proven; running the member's own gate code centrally is safe under the single-owner
  fleet model — the same trust the routine already extends to every member-authored worker — but the
  load/variety of local daily jobs is the unproven part.

`gates.mjs` assembles, per covered repo, `applicable = (active canon packs' tasks) ∪ (the member's
active local packs' tasks)`, runs each gate, and collects the units that returned `run: true`.

## The signal bundle

`signals.mjs` builds one bundle per covered repo (plus one global signal), from a small, bounded set
of cheap reads. Gates lean on it and/or do a targeted probe of their own via `gh`.

| Signal | Source | Feeds |
|---|---|---|
| `fullSweep` | `hash(full_name) % 7 === weekdayUtc` | the full pass of every task that declares `full_sweep_supported: true` (others just run their normal gate) |
| `pushedAt` | repo object (already in hand from enumeration) | short-circuits the code-side probes when idle |
| `mainMoved` | commits on the default branch `since` the window | `projectChanged` |
| `projectChanged` | the default branch advanced (any commit, merges included) | the fleet aggregate |
| `substantiveChange` | a **non-housekeeping** default-branch commit in the window — excludes bot bumps, `[skip ci]`, and the nightly baselining/seed commits | **growth-extract-new-instructions**; widens the **repo-tidy** landed/implemented candidate set |
| `prsTouched[]` | open PRs `updated_at` in window (∪ all if `substantiveChange`/`fullSweep`) | **repo-tidy** |
| `issuesTouched[]` | open issues `updated_at` in window (∪ all if `substantiveChange`/`fullSweep`), **excluding the routine's own standing trackers** (whose nightly self-update would otherwise re-fire tidy forever) | **repo-tidy** |
| `branchesTouched[]` | all open branches, only when `substantiveChange`/`fullSweep` (else empty) | **repo-tidy** |
| `activePacks[]` | member's `.claudinite-checks.json` | which pack tasks apply |
| `hasLocalPacks` | member tracks ≥1 `.claudinite/local_packs/<pack>/` subdir | gates **growth-dedup-local-instructions**; and the central **promote**'s weekly full sweep (re-promote over all with local packs) |
| `localPacksChanged` | a default-branch commit in the window touched `.claudinite/local_packs/` (per-commit scan, only run when `hasLocalPacks`) | the central **promote**'s daily trigger — target only members whose local packs *actually changed*, not merely have them |
| `canonChanged` *(global, coarse)* | home-repo commits in window touching member-affecting paths (`packs/`, `checks/`, `skills/`, `migrations/`, bootstrap wiring) — **excluding** `plan.json`, trackers, and orchestration docs | **baselining** |
| `relevantCanonChanged` *(per repo)* | a canon **pack this repo declares** moved, or a cross-cutting area (checks/skills/migrations/mount/bootstrap) moved | **growth-dedup-local-instructions** |
| `isHome`, `fleetMembers[]` *(home bundle only)* | stamped by the planner, which plans the home repo **last**: every successfully-probed member's `{ repo, activePacks, packConfigs, projectChanged, substantiveChange, hasLocalPacks, localPacksChanged }` | home-only packs' gates (e.g. the central promote gate targets members that declare the growth pack, whose **local packs changed** in the window, and whose growth entry doesn't set `config.promote: false`) |

Three rules the table encodes, because getting them wrong defeats the purpose:

- **The landed/implemented tests key off `substantiveChange`, not `mainMoved`.** A branch that hasn't
  moved in weeks becomes *superseded* the moment `main` advances past its idea; an untouched issue
  becomes *closeable* when a new commit implements it — so when the project genuinely moves, the
  candidate set widens to **all** open branches/issues. But a *housekeeping-only* move (a nightly
  baseline commit, a bot version bump) lands nothing and implements nothing, so it must **not** widen —
  otherwise every maintained-but-quiet repo is re-tidied every night against its whole backlog.
- **A member only re-dedups when a pack it actually mounts changed (`relevantCanonChanged`), not on any
  canon movement.** A change to a pack the repo doesn't declare can't newly cover its local items; and a
  repo with **no** local packs (`!hasLocalPacks`) has nothing to prune at all, so the unit is skipped
  before a subagent is ever booted.
- **`canonChanged` excludes the plan/tracker/orchestration artifacts.** The planner's own artifact
  and the routines docs must not count as canon movement, or the engine self-triggers dedup every
  night.

### Two guarantees, one stateless

The daily loop is **stateless** — a fixed ~25h lookback window (UTC; the Action runs UTC, and
`consumer-safe-changes.md` says normalize schedules to UTC at the door). No watermark to persist or
corrupt. The **weekly full sweep** (`fullSweep`) is the self-healing safety net: each repo does one
guaranteed full re-examination per week — of the `full_sweep_supported` tasks — staggered so ~1/7 of the fleet
full-sweeps each night. Anything the daily window misses (a skipped/failed night, a subtle
supersession, member-side drift) is caught within ≤7 days by the full pass of the task that owns it;
anything inside the window, immediately. `fullSweep` and `canonChanged` override `pushedAt`'s idle
short-circuit.

## The plan

`plan.json`, emitted as a workflow **artifact** (ephemeral — not committed, so no commit noise and
nothing for `canonChanged` to trip over) and mirrored to the step summary for humans:

```json
{
  "generatedAt": "2026-07-12T04:00:00Z",
  "windowStartUtc": "2026-07-11T03:00:00Z",
  "weekdayUtc": 6,
  "canonChanged": true,
  "units": [
    { "repo": "owner/foo", "task": "repo-tidy", "worker": "packs/<tidy-pack>/run_daily/repo-tidy.worker.md",
      "targets": { "branches": ["feat-x"], "prs": [7], "issues": [3] }, "reason": "project changed substantively — re-check landed status", "smarts": "medium" },
    { "repo": "owner/foo", "task": "growth-extract-new-instructions", "worker": "packs/<growth-pack>/extract.md",
      "targets": {}, "reason": "project changed substantively in the window", "smarts": "high" },
    { "repo": "owner/foo", "task": "growth-dedup-local-instructions", "worker": "packs/<growth-pack>/dedup.md",
      "targets": {}, "reason": "a declared pack changed in canon — local items may now be covered", "smarts": "high" },
    { "repo": "owner/bar", "task": "<pack-release-task>",
      "worker": "packs/<pack>/maintenance/<task>.worker.md",
      "targets": { "unreleasedVersion": "1.4.0" }, "reason": "unreleased manifest bump", "smarts": "none" }
  ]
}
```

Each unit fully specifies one dispatch: repo, worker doc, targets, and `smarts` (copied from the task
descriptor so the orchestrator picks the tier — or runs code — without re-loading descriptors). The
release unit above is `smarts: "none"`: the version comparison is already code, so the whole task runs
without an agent.

## Orchestration — dispatch from the plan

The routine session runs the core planner over the reachable fleet, reads its units, and runs one
worker per unit — **at the tier the unit's `smarts` names**: a subagent on the matching capability
tier for `high`/`medium`/`low`, or, for
`none`, a **direct code / tool execution** with no subagent at all. It adds **no behavior** to any
worker — each runs exactly per its own doc, just handed a pre-filtered target set.

**Every unit is independent — no ordering, no barriers of any kind.** Units run concurrently, capped to
a sane batch. Nothing waits on anything else: the growth stages each read only what's already **merged**
(promote picks up tonight's extracts on its *next* run, its input list decided at plan time from the
`fleetMembers` aggregate), and the repo tidy-up is a single `repo-tidy` unit that assesses branches/PRs,
acts on issues, and reconciles the tracker in one pass — so its own dimensions-then-reconcile sequencing
lives inside the one worker, not in the plan. (The old per-repo `tidy-report` mini-barrier — the last
ordering the orchestrator honored — is gone with the merge.)

**Await async completion, don't report at the trigger** (the async-completion rule; #140). A unit
that kicks off an async downstream process whose output matters is done only when that output exists,
not when it was triggered — the session **dispatches-and-awaits** the planner Action up front, and
any worker that triggers a dispatch-only Action (e.g. a release task → its release Action)
polls it to completion on a rolling backoff before the unit counts as finished. Reporting at the
trigger point would race a follow-on unit onto stale output.

Failure logging is unchanged — the session logs only failures to its own home-repo tracker, per the
parent routine.

## Scheduling — one scheduler for the whole fleet

The fleet daily routine is the **only** schedule. Every other recurring piece — the coverage census,
the bootstrap sweep, and **every pack task's supporting GitHub Action** — is a `workflow_dispatch`-only
**executor** that the routine triggers and awaits. This is the one-scheduler rule verbatim:
*"give [an executor] a cron and it silently becomes a second orchestrator with a competing trigger;
one schedule, owned by the orchestrating routine; executors run only when dispatched."* A second cron
would double-run the work and race the fleet routine's dispatch.

A release task makes this concrete: because the nightly task triggers the release flow, the
release Action **must not carry a `schedule:` trigger** — it is dispatch-only, fired by the pack
task's worker (which then awaits its completion, per the async-completion rule above).

- **The home of the principle** is `scheduling.md` (a Stage 1 deliverable) — a thin doc stating "the fleet
  routine is the only schedule; every census/sweep/pack-task Action is `workflow_dispatch`-only,
  triggered by it," pointing to the agent-practices skill for the *why*. So a future
  pack-based routine has one place that tells it not to self-schedule.
- **Enforced, not just stated** (the promotion ladder — a check beats prose): a workflow-lint-pack
  check flags any workflow that both carries a `schedule:` trigger **and** is a pack-task /
  fleet-executor workflow (everything except the one sanctioned fleet-routine schedule). A
  self-scheduling pack task then fails a member's own CI, not just review here.

## Where it lives — the planner is core, the census is the enforcer pack's

```
routines/
  fleet/
    DESIGN.md                 ← this spec
    plan.mjs                  ← the PLANNER: over the repos the routine hands it → assemble packs'
                                 run_daily gates → emit units. Pack-agnostic; MCP-native (injected gh).
    signals.mjs               ← per-repo signal bundle + global canonChanged
    gates.mjs                 ← per-repo gate evaluation → plan units
    registry.mjs              ← per-repo assembly of its active packs' run_daily tasks
  scheduling.md               ← the single-scheduler contract (see Scheduling, above)
packs/
  <enforcer-pack>/            ← contributes the coverage/adoption CENSUS (a separate concern: its own
                                dispatch, its own account-wide REST client)
  <maintenance-pack>/         ← contributes run_daily: [(gate, worker), …] tasks (+ any single-object
                                worker skills); the engine discovers them from the active packs, naming none
migrations/
  active_migrations/          ← the migration records (specs); the mechanism reads beside them
    <date>-<pack>-seed.mjs    ← one-time seed of a default-on pack into the existing fleet; the retire pass auto-retires it
  registry.mjs                ← discovery + write ops + the retirement guard (quiescence-gated)
  fleet-apply.mjs             ← phase-1 APPLY pass (fleet-wide, migrations-owned)
  fleet-retire.mjs            ← phase-3 RETIRE pass (fleet-wide, migrations-owned)
```

**Everything here operates on the repos it's given, over MCP.** The **planner** (`plan.mjs`) and the
migration **apply** / **retire** passes (`../../migrations/fleet-apply.mjs`, `../../migrations/fleet-retire.mjs`)
all operate over the repos the routine hands them (this session's scoped repos) through a single injected
`gh` reader/writer the orchestrator backs with its GitHub MCP tools — they never enumerate GitHub and carry
**no REST client or token**. The one Claudinite process that *does* need account-wide REST — enumerating
every owned repo to discover coverage gaps — is the enforcer pack's **census** (its own account-wide REST
client), a wholly separate concern in a separate repo's Action: it is not scheduled, dispatched, or
depended on here. (Earlier the plan was emitted *inside* the census; that coupling is exactly what let a
missing census workflow sink the whole plan, so the planner was split back out — held apart now by the
core⟂pack barrier declared in `.claudinite-checks.json`.)

## Blast radius (it's small)

The planner and **every gate run centrally** in the home repo's Action. No consumer executes any new
code. A member contributes only its existing `.claudinite-checks.json` (read for `activePacks`, never
written). Pack **worker docs** are canon docs the dispatched subagent reads over the API — the same
propagation as the growth stage docs today. The only new home-repo write is the ephemeral
`plan.json` artifact.

A **maintenance pack** rides the ordinary pack channels (`consumer-safe-changes.md`): its `RULES.md`
loads at session start where declared and its skills mount — low blast radius, same as any pack prose.
Its *maintenance tasks* still execute centrally like every pack task. A default-on pack adds one
bootstrap-wiring change — seeded at `--init`, with the deliberate carve-out that baselining does
**not** backfill an opt-out — travelling the bootstrap channel to converge from every layout in the wild.

## Verifying before the nightly does

Per `consumer-safe-changes.md` ("verify against a real consumer before the nightly does"):

- `signals.mjs` and `gates.mjs` are unit-tested against a fake `gh` (the census already tests its
  pure helpers this way).
- The planner runs **standalone**: `node routines/fleet/plan.mjs` emits `plan.json` over the
  reachable fleet without the orchestrator consuming it, so the plan can be inspected against the
  real fleet before the session is wired to dispatch from it.

