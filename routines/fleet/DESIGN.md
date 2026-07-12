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

- **Fleet-core tasks** live in `tasks/`, discovered structurally: `branch-cleanup`,
  `pr-assess`, `issue-triage`, `extract`, `dedup`, `align`. Always applicable to every member.
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
| `projectChanged` | commits / merged PRs in the window | **extract** |
| `prsTouched[]` | open PRs `updated_at` in window (∪ all if `mainMoved`/`fullSweep`) | **pr-assess** |
| `issuesTouched[]` | open issues `updated_at` in window (∪ all if `mainMoved`/`fullSweep`) | **issue-triage** |
| `branchesTouched[]` | branch tips moved in window (∪ all if `mainMoved`/`fullSweep`) | **branch-cleanup** |
| `activePacks[]` | member's `.claudinite-checks.json` | which pack tasks apply |
| `canonChanged` *(global)* | home-repo commits in window touching member-affecting paths (`packs/`, `checks/`, `skills/`, `migrations/`, bootstrap wiring) — **excluding** `plan.json`, trackers, and orchestration docs | **dedup** (all repos) + **align** |

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
    { "repo": "owner/foo", "task": "extract", "worker": "growth/extract.md",
      "targets": {}, "reason": "projectChanged", "order": "growth:1" },
    { "repo": "owner/foo", "task": "dedup", "worker": "growth/dedup.md",
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
  ([../../growth/README.md](../../growth/README.md)): all `growth:1` (extract) units → barrier →
  **promote** → barrier → all `growth:3` (dedup) units.
- **Promote is orchestrator-decided post-barrier**, not a planned unit: it's central-once and its
  input is *this night's* extractions, unknown at plan time. After the extract barrier the session
  runs promote iff ≥1 extract produced new local-doc content.

Failure logging is unchanged — the session logs only failures to its own home-repo tracker, per the
parent routine.

## Where it lives, and the census fold-in

```
routines/
  fleet/
    DESIGN.md                 ← this spec
    signals.mjs               ← per-repo signal bundle + global canonChanged
    gates.mjs                 ← registry assembly + per-repo gate evaluation → plan units
    tasks/                    ← fleet-core task descriptors (gate + worker pointer)
      branch-cleanup.mjs  pr-assess.mjs  issue-triage.mjs  extract.mjs  dedup.mjs  align.mjs
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
nightly.

## Verifying before the nightly does

Per `consumer-safe-changes.md` ("verify against a real consumer before the nightly does"):

- `signals.mjs` and `gates.mjs` are unit-tested against a fake `gh` (the census already tests its
  pure helpers this way).
- The planner runs **dry**: a `workflow_dispatch` emits `plan.json` without the orchestrator
  consuming it, so the plan can be inspected against the real fleet before the session is wired to
  dispatch from it.

## Stage boundaries

- **Stage 1 (this spec):** the planner, the fleet-core gates reusing today's workers, the
  `chrome-store-release` pack task, and the orchestrator rewritten to dispatch from the plan.
- **Stage 2 (deferred):** narrow per-object worker skills (`single-branch-status`, `single-pr-status`,
  `single-issue-triage`) fed specific IDs, replacing the broader tidy-up worker so a repo with one
  stale branch spins a one-branch check, not a whole-repo pass.
