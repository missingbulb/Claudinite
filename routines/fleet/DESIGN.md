# routines/fleet/ — the code planner for the daily maintenance routine

> **Status: Stage 1 spec — not yet implemented.** This doc is the agreed design (issue #241); the
> `signals.mjs`, `gates.mjs`, and `tasks/` modules it describes are the work it authorizes. Reviewed
> before implementation code, so the shape settles here first.

The fleet daily maintenance routine ([../auto-all-repos-maintenance.md](../auto-all-repos-maintenance.md))
today fans an agent out to **every task × every member repo** every night, and decides *what to do*
in-session. Most repos have nothing to do for most tasks on most nights, so the expensive tier — a
model turn — is entered to discover "nothing to do." This engine moves that discovery into
**deterministic code** and lets agents run only the work a gate already proved is live.

## The one boundary: code decides, agents act

Every maintenance task is split into two halves that never mix:

- **"should I run" — the gate.** Code. Runs in the planner (the fleet-coverage Action, fleet PAT).
  Given a repo + the signal bundle, returns `{ run, targets, reason }`. Costs an API read, never a
  token.
- **"what to do" — the worker.** A doc/skill a subagent runs, handed the gate's `targets`. Costs a
  model turn — spent only on `(repo, task)` units a gate marked live.

The planner is the aggregate of every gate; the orchestrator dispatches every worker. **The entire
worklist is computed by code that runs to completion and emits a plan, before a single worker agent
is spawned.** That boundary is the frugality lever.

## Process map — the orchestrator IS the routine session

```
[Routine session]  (agent, capable model, home repo)          ← trigger + orchestrator, one run
   ├─ dispatch + await ─►  [Planner]  (code, GitHub Actions, FLEET_GITHUB_TOKEN)  ─► plan.json (artifact)
   ◄─ download plan.json ──┘
   └─ per unit, honoring barriers ─►  [worker subagent] × N    ← children of the session
```

The planner is the **only** out-of-process piece, and only because it needs the account-spanning
token and must stay pure code. Trigger and orchestrator are two phases of one session, so the plan
stays in-context and one supervisor owns the run (and the failure log). This is continuous with how
the sweep already "triggers the `Fleet Coverage` workflow and awaits the run" today
([../auto-fleet-bootstrap.md](../auto-fleet-bootstrap.md) Step 1).

## The task registry

A task descriptor is a plain object:

```js
{
  id:     'branch-cleanup',                 // stable task name
  scope:  'fleet',                          // 'fleet' (all members) | 'pack:<name>' (implicit for pack tasks)
  worker: '../auto-repo-tidy.md#branches',  // the "what to do" doc, canon-relative
  order:  null,                             // null = independent/concurrent | 'growth:N' = phase N barrier
  gate:   async (repo, signals, gh) => ({ run, targets, reason }),   // the "should I run" predicate
}
```

- **Fleet-core tasks** live in `tasks/`, discovered structurally: `branch-cleanup`, `pr-assess`,
  `issue-triage`, `growth-extract-new-instructions`, `growth-dedup-local-instructions`, `align`.
  Always applicable to every member. (The three growth **task ids** name the maintenance units in the
  plan; their `worker` docs keep their existing filenames — `growth/extract.md`, `growth/dedup.md`,
  `growth/promote.md` — so the rename doesn't ripple into the growth lifecycle or consumer-vendored
  copies. The central `growth-promote-to-claudinite` step is orchestrator-run post-barrier, not a
  planned unit — see Orchestration.)
- **Pack tasks** register exactly like a pack's checks and skills — a new **`maintenance: [...]`**
  field on `pack.mjs`, listing descriptor modules (parallel to `rules`, `skills`, `env`). A task
  declared by a pack is `scope: "pack:<that pack>"` automatically, and applies to a repo **iff** the
  repo declares that pack in `.claudinite-checks.json`. Adding a task is dropping a `(gate, worker)`
  pair — the engine discovers it, no orchestrator edit.

`gates.mjs` assembles, per covered repo, `applicable = fleet-core ∪ (active packs' maintenance)`,
runs each gate, and collects the units that returned `run: true`.

## The signal bundle

`signals.mjs` builds one bundle per covered repo (plus one global signal), from a small, bounded set
of cheap reads. Gates lean on it and/or do a targeted probe of their own via `gh`.

| Signal | Source | Feeds |
|---|---|---|
| `fullSweep` | `hash(full_name) % 7 === weekdayUtc` | forces **every** task for that repo tonight |
| `pushedAt` | repo object (already in hand from enumeration) | short-circuits the code-side probes when idle |
| `mainMoved` | commits on the default branch `since` the window | the **landed/implemented** tests (branch-cleanup, issue-triage) |
| `projectChanged` | commits / merged PRs in the window | **growth-extract-new-instructions** |
| `prsTouched[]` | open PRs `updated_at` in window (∪ all if `mainMoved`/`fullSweep`) | **pr-assess** |
| `issuesTouched[]` | open issues `updated_at` in window (∪ all if `mainMoved`/`fullSweep`) | **issue-triage** |
| `branchesTouched[]` | branch tips moved in window (∪ all if `mainMoved`/`fullSweep`) | **branch-cleanup** |
| `activePacks[]` | member's `.claudinite-checks.json` | which pack tasks apply |
| `canonChanged` *(global)* | home-repo commits in window touching member-affecting paths (`packs/`, `checks/`, `skills/`, `migrations/`, bootstrap wiring) — **excluding** `plan.json`, trackers, and orchestration docs | **growth-dedup-local-instructions** (all repos) + **align** |

Two rules the table encodes, because getting them wrong defeats the purpose:

- **The landed/implemented tests key off `mainMoved`, not per-object recency.** A branch that hasn't
  moved in weeks becomes *superseded* the moment `main` advances past its idea; an untouched issue
  becomes *closeable* when a new commit implements it. So when `mainMoved`, the candidate set widens
  to **all** open branches/issues, not just recently-touched ones.
- **`canonChanged` excludes the plan/tracker/orchestration artifacts.** The planner's own artifact
  and the routines docs must not count as canon movement, or the engine self-triggers dedup every
  night.

### Two guarantees, one stateless

The daily loop is **stateless** — a fixed ~25h lookback window (UTC; the Action runs UTC, and
`consumer-safe-changes.md` says normalize schedules to UTC at the door). No watermark to persist or
corrupt. The **weekly full sweep** (`fullSweep`) is the self-healing safety net: each repo does one
guaranteed full re-examination per week, staggered so ~1/7 of the fleet full-sweeps each night.
Anything the daily window misses (a skipped/failed night, a subtle supersession) is caught within
≤7 days; anything inside the window, immediately. `fullSweep` and `canonChanged` override
`pushedAt`'s idle short-circuit.

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
    { "repo": "owner/foo", "task": "branch-cleanup", "worker": "routines/auto-repo-tidy.md#branches",
      "targets": { "branches": ["feat-x"] }, "reason": "mainMoved", "order": null },
    { "repo": "owner/foo", "task": "growth-extract-new-instructions", "worker": "growth/extract.md",
      "targets": {}, "reason": "projectChanged", "order": "growth:1" },
    { "repo": "owner/foo", "task": "growth-dedup-local-instructions", "worker": "growth/dedup.md",
      "targets": {}, "reason": "canonChanged", "order": "growth:3" },
    { "repo": "owner/bar", "task": "chrome-store-release",
      "worker": "packs/chrome-extension-release/maintenance/store-release.worker.md",
      "targets": { "unreleasedVersion": "1.4.0" }, "reason": "unreleased manifest bump", "order": null }
  ]
}
```

Each unit fully specifies one subagent dispatch: repo, worker doc, targets. `order` carries the only
ordering the orchestrator must honor.

## Orchestration — dispatch from the plan, honor the barriers

The routine session downloads `plan.json` and dispatches one subagent per unit. It adds **no
behavior** to any worker — each runs exactly per its own doc, just handed a pre-filtered target set.
Ordering:

- **Independent units** (`order: null` — branch-cleanup, pr-assess, issue-triage, align, pack tasks)
  run concurrently, capped to a sane batch.
- **Growth units** run in the lifecycle's phased order with a barrier between each
  ([../../growth/README.md](../../growth/README.md)): all `growth:1`
  (`growth-extract-new-instructions`) units → barrier → `growth-promote-to-claudinite` → barrier →
  all `growth:3` (`growth-dedup-local-instructions`) units.
- **`growth-promote-to-claudinite` is orchestrator-decided post-barrier**, not a planned unit: it's
  central-once and its input is *this night's* extractions, unknown at plan time. After the extract
  barrier the session runs it iff ≥1 extract produced new local-doc content.

**Await async completion, don't report at the trigger** (`unattended-agents` SKILL.md; #140). A unit
that kicks off an async downstream process whose output matters is done only when that output exists,
not when it was triggered — the session **dispatches-and-awaits** the planner Action up front, and
any worker that triggers a dispatch-only Action (e.g. `chrome-store-release` → the release Action)
polls it to completion on a rolling backoff before the unit counts as finished. Reporting at the
trigger point would race a follow-on unit onto stale output.

Failure logging is unchanged — the session logs only failures to its own home-repo tracker, per the
parent routine.

## Scheduling — one scheduler for the whole fleet

The fleet daily routine is the **only** schedule. Every other recurring piece — the coverage census,
the bootstrap sweep, and **every pack task's supporting GitHub Action** — is a `workflow_dispatch`-only
**executor** that the routine triggers and awaits. This is the `unattended-agents` rule verbatim:
*"give [an executor] a cron and it silently becomes a second orchestrator with a competing trigger;
one schedule, owned by the orchestrating routine; executors run only when dispatched."* A second cron
would double-run the work and race the fleet routine's barriers.

`chrome-store-release` makes this concrete: because the nightly task triggers the release flow, the
release Action **must not carry a `schedule:` trigger** — it is dispatch-only, fired by the pack
task's worker (which then awaits its completion, per the async-completion rule above). This closes the
gap the in-flight `chrome-store-release-schedule-*` branch would otherwise open.

- **The home of the principle** is `scheduling.md` (a Stage 1 deliverable) — a thin doc stating "the fleet
  routine is the only schedule; every census/sweep/pack-task Action is `workflow_dispatch`-only,
  triggered by it," pointing to `skills/unattended-agents/SKILL.md` for the *why*. So a future
  pack-based routine has one place that tells it not to self-schedule.
- **Enforced, not just stated** (the promotion ladder — a check beats prose): a `github-actions`-pack
  check flags any workflow that both carries a `schedule:` trigger **and** is a pack-task /
  fleet-executor workflow (everything except the one sanctioned fleet-routine schedule). A
  self-scheduling pack task then fails a member's own CI, not just review here.

## Where it lives, and the census fold-in

```
routines/
  fleet/
    DESIGN.md                 ← this spec
    signals.mjs               ← per-repo signal bundle + global canonChanged
    gates.mjs                 ← registry assembly + per-repo gate evaluation → plan units
    tasks/                    ← fleet-core task descriptors (gate + worker pointer)
      branch-cleanup.mjs  pr-assess.mjs  issue-triage.mjs  align.mjs
      growth-extract-new-instructions.mjs  growth-dedup-local-instructions.mjs
  scheduling.md               ← the single-scheduler contract (see Scheduling, below)
  check-fleet-coverage.mjs    ← EXTENDED: the same single fleet walk now also builds + emits plan.json
.github/workflows/fleet-coverage.yml  ← uploads plan.json as an artifact
packs/chrome-extension-release/
  pack.mjs                    ← + maintenance: [storeRelease]
  maintenance/
    store-release.mjs         ← the (gate, worker) descriptor
    store-release.worker.md   ← the "what to do" doc (defers to RELEASE.md)
```

**One walk, three outputs.** `check-fleet-coverage.mjs` already visits every repo once and emits the
coverage census + migration-retirement telemetry. The planner is the third thing that walk emits —
it reuses the same per-repo pass (which already separates `covered`), gathering signals and running
gates for each covered repo. No second enumeration.

> **Open structural decision (recommend: extend in place for Stage 1).** The file's name will
> undersell its role once it also plans work. But it is central-only (no consumer holds a copy), and
> renaming it forces a canon-wide reference sweep — `fleet-coverage.yml`, `migrations/README.md`,
> `auto-fleet-bootstrap.md`, and the migration framework all name it. So Stage 1 keeps the name and
> factors the new logic into `routines/fleet/` modules; a rename to `routines/fleet/scan.mjs` is a
> clean, contained follow-up (a grep sweep, not a fleet migration).

## Blast radius (it's small)

The planner and **every gate run centrally** in the home repo's Action. No consumer executes any new
code. A member contributes only its existing `.claudinite-checks.json` (read for `activePacks`, never
written). Pack **worker docs** are canon docs the dispatched subagent reads over the API — the same
propagation as the growth phase docs today. The only new home-repo write is the ephemeral
`plan.json` artifact.

## Proving the pack seam: `chrome-store-release`

`chrome-extension-release` is an opt-in pack, so its task rides `scope: "pack:chrome-extension-release"`
and is evaluated only on repos that declare the pack:

- **gate** (`maintenance/store-release.mjs`): compares the shipped manifest/package version to the
  last released/tagged version (via `gh`); returns `run: true` + `targets.unreleasedVersion` when a
  bump has landed but not shipped, or when the store listing is stale. Silent on nights with nothing
  to ship.
- **worker** (`maintenance/store-release.worker.md`): runs the pack's existing release / store-
  conformance flow (defers to [../../packs/chrome-extension-release/RELEASE.md](../../packs/chrome-extension-release/RELEASE.md)).

No new schedule, no orchestrator change — declaring the pack on a repo is what enrolls it in the
nightly, and its release Action stays `workflow_dispatch`-only (see [Scheduling](#scheduling--one-scheduler-for-the-whole-fleet)).

## Verifying before the nightly does

Per `consumer-safe-changes.md` ("verify against a real consumer before the nightly does"):

- `signals.mjs` and `gates.mjs` are unit-tested against a fake `gh` (the census already tests its
  pure helpers this way).
- The planner runs **dry**: a `workflow_dispatch` emits `plan.json` without the orchestrator
  consuming it, so the plan can be inspected against the real fleet before the session is wired to
  dispatch from it.

## Stage 2 — narrow per-object worker skills

Stage 1 dispatches today's **whole-repo** tidy-up worker, just fed a target list. Stage 2 replaces
that worker with **single-object skills**, so a repo with one stale branch spins a one-branch check
instead of a whole-repo pass — maximal context isolation and the last of the frugality. It changes
**only the worker side**; the engine, plan schema, and per-object `targets` are unchanged, which is
why it's cleanly separable.

**The skills** (the "what to do" at single-object granularity, in `skills/`):

- `single-branch-status` — given **one** branch, run the landed-status test
  (merged / already-in-main / superseded / orphaned / genuine) and return a verdict. **Assess-only** —
  never deletes or pushes.
- `single-pr-status` — given **one** PR, classify (keep-open, or closeable: merged / superseded /
  stale) and return a verdict. **Assess-only** — never closes.
- `single-issue-triage` — given **one** issue, apply the first-matching action (close-if-implemented /
  needs-decision / blocked / quick-win / leave) and act. The **only acting** skill; its trigger is
  concrete and its default safe (`unattended-agents`: define the trigger, default to comment/leave
  when inconclusive; "implemented in main" must be verified against `main`'s current content, never
  inferred).

**Dispatch granularity — per-object logic, per-(repo, task) dispatch.** The plan still emits one unit
per `(repo, task)` carrying the ID list; the worker applies the single-object skill across that list.
One subagent *per branch* would explode the agent count; the skill is the unit of **logic**, the
`(repo, task)` is the unit of **dispatch** (a repo with many targets can be batched). So Stage 2 does
not change the plan schema — it changes what the `branch-cleanup` / `pr-assess` / `issue-triage`
workers point at.

**The report-reconciliation problem (the real work of Stage 2).** The standing tidy tracker is
inherently **repo-level** — a snapshot of *all* the repo's PRs, branches, and issues — but a
single-object skill only sees its own object. So decomposing the whole-repo pass strands the report.
Stage 2 adds a per-repo **`tidy-report`** unit that runs **after** that repo's assess/triage units
settle and rewrites the tracker from their collected verdicts:

- Rewrites the tracker **body** to today's dated snapshot (newest-first) and adds a **dated comment**
  as the per-run trail — exactly the standing-tracking-issue convention (`unattended-agents`;
  `auto-repo-tidy.md`).
- **Ordering:** a per-repo mini-barrier — `tidy-report` waits on that repo's `branch-cleanup` /
  `pr-assess` / `issue-triage` units (a repo-scoped dependency the orchestrator honors, narrower than
  the fleet-wide growth barrier).
- **Gate:** runs if any of the repo's tidy units ran tonight (or on `fullSweep`). If none ran, the
  tracker's last dated snapshot stands, and the weekly full sweep refreshes it — so it never goes
  silently stale.

**`auto-repo-tidy.md` refactor.** The per-object *judgment* (the landed-status test, the issue-action
ladder) moves **into** the skills — one home for that logic (the promotion ladder: reusable judgment
becomes a skill). `auto-repo-tidy.md` keeps only the policy the skills don't own: assess-only-vs-act,
and the tracker/report contract — pointing at the skills for the mechanics. It shrinks to a policy +
report spec.

```
skills/
  single-branch-status/SKILL.md   ← one-branch landed-status verdict (assess-only)
  single-pr-status/SKILL.md       ← one-PR verdict (assess-only)
  single-issue-triage/SKILL.md    ← one-issue action (the only acting skill)
routines/fleet/tasks/
  tidy-report.mjs                 ← per-repo report unit (gate + worker); runs after the repo's tidy units
routines/auto-repo-tidy.md        ← shrinks to policy + tracker/report contract; mechanics move to the skills
packs/basics/pack.mjs             ← declares the three skills (baseline tidy activity)
```

Pack tasks decompose the same way **if** they have per-object structure; `chrome-store-release` is
already single-object (one repo, one release), so it needs no Stage-2 decomposition.

## Stage boundaries — summary

- **Stage 1 (this spec):** the planner + signal bundle + gate registry emitting `plan.json`; the
  fleet-core gates reusing today's whole-repo workers; the `chrome-store-release` pack task; the
  `scheduling.md` contract + its enforcing check; the orchestrator rewritten to dispatch from the plan.
- **Stage 2:** the three single-object skills, the per-repo `tidy-report` unit, and the
  `auto-repo-tidy.md` refactor — a pure worker-granularity change, no engine change.
