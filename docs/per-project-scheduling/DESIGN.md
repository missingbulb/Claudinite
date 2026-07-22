# Per-project maintenance scheduling — design

Status: **agreed** (owner decisions recorded in §11). Supersedes, once migrated, the
central fleet routine ([`routines/auto-all-repos-maintenance.md`](../../routines/auto-all-repos-maintenance.md)
and its external CCR trigger) and the two out-of-band GCEC CCR triggers.
The phased rollout lives in [MIGRATION.md](MIGRATION.md). Refs #390.

The shape: every repo schedules **itself** — a vendored hourly **scheduler Action**
evaluates task preconditions and dispatches agent work as `ready-for-agent` issues;
a per-repo hourly **executor routine** (Claude Code session) executes them. Fleet-scoped
work becomes ordinary tasks *of the canon repo* on the same machinery — no separate
central mechanism survives.

---

## 1. Task anatomy — the pack folder

`run_daily/` is renamed to `tasks/`, one directory per task, in canon packs and
local packs alike:

```
packs/<pack>/tasks/<task-name>/
  task.mjs        # declaration + precondition — self-contained, importable standalone
  task.md         # the worker spec the agent executes; the dispatch issue's first line points here
  *.sh, *.js      # optional deterministic helper scripts (the routine-folder convention, absorbed)
```

In a consumer repo the two valid task-file prefixes are therefore exactly:

```
.claudinite/shared/packs/<pack>/tasks/<task>/task.md     (vendored canon task)
.claudinite/local_packs/<pack>/tasks/<task>/task.md      (project-owned task)
```

`task.mjs` carries the whole contract:

```js
export default {
  id: 'growth-extract',
  frequency: 'daily-2h',   // hourly | daily-2h | daily-1h | daily | daily+1h | weekly | monthly — nothing else
  signals: ['commits', 'prs', 'issues'],   // which parts of the signals object to collect
  model: 'opus',           // opus | sonnet | haiku | none — 'none' = pure code, no agent, no issue
  outcome: 'merged-pr',    // none | open-pr | merged-pr — the task's write ceiling (§4)
  worker: 'task.md',
  precondition(signals, config) {
    // Pure code over the collected signals + this pack's entry config from .claudinite-checks.json.
    // Decides "needs to run" AND emits binding context for the dispatch issue.
    return {
      run: true,
      reason: '2 substantive commits in window',
      context: ['Only PRs #12 and #15 are in scope. #13 is a bot bump — do not touch it.'],
    };
  },
}
```

- **`frequency`** — exactly the seven values above. `daily±Nh` offsets the repo's
  daily anchor hour (§2); weekly/monthly fire at the anchor hour on the configured day.
- **`signals`** — the scheduler collects only the union of what the *due* tasks
  declare; a non-daily slot never pays for daily tasks' signals.
- **`model`** — family names, resolved to a concrete model id in **one** vendored
  module (`engine/scheduler/model-map.mjs`), so a model-generation bump is one
  edit. `none` replaces `smarts: 'none'`: the worker is an `.mjs` the scheduler
  runs inline — no issue, no agent (store-release is the exemplar).
- **`outcome`** — a declared **ceiling**, not a promise: `none` may never open a
  PR, `open-pr` may open but never merge, `merged-pr` may arm auto-merge. "No
  change" is always a legal result. Enforced post-hoc by the executor in code,
  not just requested in prose. A repo whose `maintenance.delivery` is `review`
  degrades `merged-pr` tasks to `open-pr` — member config wins. Pushes to
  non-default branches (e.g. the `conversation-logs` prune) are outside the
  taxonomy.
- **`precondition`** — today's `gate` renamed. It both asserts need-to-run and
  **pre-decides scope**: `context` lines land verbatim in the dispatch issue, and
  the executor treats them as constraints the agent may not re-litigate (if the
  precondition can rule a PR irrelevant in code, the agent never re-decides it).
- Per-task project settings ride the already-sanctioned container — the pack
  entry's `config` in `.claudinite-checks.json`. No new per-task engine keys.
- The self-contained-module rule carries over from `local-tasks.mjs`: `task.mjs`
  imports nothing, so scheduler, executor, and humans load it standalone. Local
  pack dir-name == id stays load-bearing.

## 2. Repo-level schedule settings

New top-level key in `.claudinite-checks.json` (added to the engine's closed
`CONFIG_KEYS` set):

```json
"schedule": { "dailyHour": 4, "weeklyDay": "Sun", "monthlyDay": 1 }
```

All values **UTC** (requirements normalize to UTC at the door). Defaults when
absent: `dailyHour: 4`, `weeklyDay: "Sun"`, `monthlyDay: 1`. `monthlyDay` clamps
to the month's last day; `daily-2h` with `dailyHour < 2` wraps into the previous
calendar day (the slot keeps the anchor's date). With the default anchor the
growth ordering falls out of declarations alone: extract (`daily-2h`) 02:00,
canon promote (`daily-1h`, on the canon repo) 03:00, dedup (`daily`) 04:00.

## 3. The scheduler — one vendored hourly Action per repo

`.github/workflows/claudinite-scheduler.yml` (vendored stub, shape-enforced by a
conformance check): hourly cron on a **repo-hashed minute** (spreads the fleet
and dodges GitHub's :00 stampede), `workflow_dispatch` for manual runs, a
`concurrency` group serializing runs. It runs
`node .claudinite/shared/engine/scheduler/run.mjs`, which:

1. **Decides due slots statelessly from the run ledger GitHub already keeps.**
   For each frequency, compute the most recent scheduled slot time ≤ now from
   `schedule`. Fetch the timestamp `T` of this workflow's last **successful** run
   (Actions API). A slot is due iff its time ∈ `(T, now]`.
   - Miss/outage → the next successful run catches up daily/weekly/monthly slots;
     no watermark file, nothing to corrupt.
   - Only the most recent slot per frequency is considered → a 3-day outage
     yields one catch-up evaluation, never a backfill storm.
   - **Hourly slots never catch up** (stale polls are worthless).
   - Late fire (15:02 for a ~15:00 slot) is irrelevant — due-ness is schedule
     math, never wall-clock equality.
   - No prior success (fresh adoption) → all frequencies' most-recent slots are
     due: an immediate full evaluation as the smoke test.
2. **Discovers tasks** from `.claudinite/shared/packs/<p>/tasks/*/task.mjs` and
   `.claudinite/local_packs/<p>/tasks/*/task.mjs`, activation-gated by the
   `packs` declaration exactly like checks and skills; filters to due frequencies.
3. **Collects signals** — only the declared union. Vocabulary (one collector
   module each; window = the task's period + 1h slack, stateless fixed lookback;
   overlap absorbed by dedupe):
   - `commits` — default-branch commits in window, `substantiveChange`
     classification, touched paths.
   - `prs`, `issues`, `branches` — open + touched-in-window. Self-trigger
     exclusions carried over **and extended**: the housekeeping-commit regex,
     tracker titles, and now `[claudinite-task]` issues and `ready-for-agent`
     label events are invisible to signals.
   - `release` — latest GitHub release + manifest version.
   - `localPacks` — present / changed-in-window.
   - `sharedMount` — which *declared* packs' vendored files changed in the
     window. Replaces the cross-repo `relevantCanonChanged`: the member's own
     merged vendor-refresh commit is the local echo of "canon changed".
   - `conversationLogs` — logs branch present, oldest JSONL age vs retention
     (wall-time prune becomes a first-class signal, correct on quiet repos).
   - `fleet` — canon repo only, over the fleet PAT (the members aggregate for
     promote/census). Consumers cannot declare it.
4. **Runs preconditions** — pure code, per-task try/catch isolation; a throwing
   precondition converges to the standard failure state (`report-failure`
   composite → `workflow-failure` issue); other tasks proceed.
5. **Executes or dispatches** — `model: 'none'` → run the worker `.mjs` inline;
   otherwise file the dispatch issue (§4) labeled `ready-for-agent`.
6. **Reports** — the job summary lists every evaluated task with run/skip/reason
   (the observability `plan.json` used to give). Whole-run failure escalates per
   `gha/scheduled-failure-escalation`.

`fullSweep`, `full_sweep_supported`, and the hash-stagger retire: "weekly" is now
a declaration, not a gate trick.

## 4. The dispatch issue — exactly-once, bounded, recoverable

- **Title**: `[claudinite-task] <pack>/<task> <slot-id>`; slot-id
  `h2026-07-22T14Z` (hourly), `d2026-07-22` (daily family), `w2026-07-19`
  (weekly, the slot's day), `m2026-07` (monthly).
- **Body** — first line is the task-file path; everything behavior-defining
  (model, outcome, worker content) is read from the tracked repo file, never
  from the issue:

  ```
  .claudinite/local_packs/gcec/tasks/create-extractor/task.md

  Execute the Claudinite task above (pack `gcec`, task `create-extractor`, slot `h2026-07-22T14Z`).
  The Context section below is binding scope — do not re-decide it.

  ### Context
  - Eligible requests: #123, #125. #124 is labeled extractor-blocked-needs-human — do not touch it.
  ```
- **Exactly-once per (task, slot)**: before creating, search issues state=**all**
  for the exact title; found → skip. Makes scheduler double-runs and
  crash-retries safe (`concurrency` serializes; the search closes the
  crashed-mid-run window).
- **At-most-one open issue per task**: any open `[claudinite-task] <pack>/<task>`
  issue (any slot) suppresses new filings — an executor outage accumulates zero
  backlog beyond one issue per task. An open dispatch issue older than ~2 of its
  periods gets an escalation comment + `needs-human` from the scheduler.
- **Lifecycle**: success → executor comments the result and closes it. Failure →
  comment naming what failed, remove `ready-for-agent`, add `needs-human`.
  Every exit converges to one visible triage state (the canon's
  failure-convergence rule — which also fixes create-extractor's current
  "trigger label never removed" gap).

## 5. The executor — a per-repo hourly Claude Code routine

One CCR routine per repo (owner decision, §11), created at bootstrap:

- **Schedule**: hourly, cron minute = the repo's scheduler minute + 10, so a
  freshly filed issue is typically picked up ~10 minutes later (worst case ~1h).
- **Session model**: `sonnet` — the routine itself only orchestrates; each task
  runs as a **subagent at the task's declared model family** (that is how
  per-task model survives a single-model routine).
- **Launcher prompt** (thin pointer, per the unattended-agents rule):
  `Execute the Claudinite executor: .claudinite/shared/engine/scheduler/executor.md`.
- **`executor.md`** (vendored, hyper-specific, MCP-only GitHub access):
  1. List open issues labeled `ready-for-agent`. None → stop immediately.
  2. Per issue, run `node .claudinite/shared/engine/scheduler/validate-dispatch.mjs <n>`
     — deterministic validation in code, before any model judgment: first line
     matches `^\.claudinite\/(shared\/packs|local_packs)\/[^/]+\/tasks\/[^/]+\/task\.md$`,
     the file exists at HEAD, its pack is declared, its `task.mjs` sibling
     parses; prints the resolved model and outcome ceiling. Invalid → comment +
     de-label + `needs-human`, skip.
  3. **Claim** the issue: swap `ready-for-agent` → `agent-running` (a second
     executor session overlapping sees nothing ready — no double execution).
  4. Dispatch a subagent at the declared model: read `task.md`, follow it
     exactly; the issue's Context section is binding scope — never re-decide or
     widen it.
  5. Post-verify in code (`verify-outcome.mjs`): outcome ceiling respected (a
     `none` task that opened a PR, or an `open-pr` task that merged one, fails
     the run); then close the issue with a result comment, or converge the
     failure (comment + `needs-human`, remove `agent-running`).
  6. An `agent-running` issue older than ~3h with no activity → converge to
     `needs-human` (a died-mid-run session never strands an issue silently).

**Security**: applying a label requires triage/write permission, so only the
scheduler's token and the owner can mark an issue `ready-for-agent` — a stranger
filing a look-alike issue cannot summon the agent. Instructions come from
reviewed, tracked repo files; the issue contributes only the path, the slot, and
machine-generated context. Path validation runs as code before any model reads
the issue.

**Creation at bootstrap**: the adopting session creates the routine via the
Routines/trigger API when available; otherwise it files an owner issue carrying
the exact routine config (name, cron, model, launcher prompt) in one enclosed
block — the only human action left in wiring a repo into maintenance.

## 6. Task-by-task mapping

Per-project tasks (consumer repos):

| Task (pack) | frequency | signals | model | outcome | Notes |
|---|---|---|---|---|---|
| growth-extract (grow_with_claudinite) | daily-2h | commits, prs, issues | opus | merged-pr | Precondition = substantiveChange; context = the commit/PR/issue lists. |
| growth-dedup (grow_with_claudinite) | daily | localPacks, sharedMount, commits | opus | open-pr | `relevantCanonChanged` → `sharedMount`. The weekly re-check crutch retires; a quiet repo skips. |
| conversation-extract (grow_with_claudinite) | daily-1h | commits, conversationLogs | opus | merged-pr | Age-based retention prune now fires correctly on quiet repos. |
| repo-tidy (tidy-repo) | daily | prs, issues, branches, commits | sonnet | none | The undeclared-canon carve-out dies: the canon repo declares tidy-repo like everyone else. |
| wiki-growth (product-wiki) | weekly | commits | opus | open-pr | The open-growth-PR preflight is subsumed by the at-most-one-open-issue guard + a precondition check. |
| store-release (chrome-extension-release) | daily | release | none | none | Runs inline in the scheduler; Stage 2 (dispatch + await the release Action) fits Action context naturally. The release workflow's own 00:30 cron (pure Actions, no agent) stays — legitimate under the new doctrine. |
| create-extractor (gcec, local) | **hourly** | issues | sonnet | open-pr | `2-triage.js` is deterministic and the scheduler has a checkout, so deny/allow/duplicate-sample dispositions run **inside the precondition** (issue closed with the canned message, no agent); only genuinely-new hosts produce a dispatch issue, with mode/branch/caseName precomputed in context. The user-facing `extractor-request` issue stays; the dispatch issue references it. |
| auto-fallback-coverage (gcec, local) | daily | commits | opus | open-pr | `preconditions.sh` becomes the precondition over `commits`. Fixes the live cadence bug (daily spec vs weekly cron: ~6/7 of windows currently unexamined). |

Canon-repo tasks (the centralized work, on the same machinery — the canon's own
packs, the canon's own scheduler, the existing fleet PAT where cross-repo access
is needed):

| Task | frequency | model | outcome | Notes |
|---|---|---|---|---|
| baselining / vendor-refresh | daily-2h | sonnet | merged-pr | Inherently canon→fleet; stays central. Enrollment-issue closing retires with the enrollment flow. |
| migrations-apply | daily-2h | none | merged-pr | Pure code over the PAT; uploads `applied-<date>.json` as a run artifact… |
| migrations-retire | daily+1h | none | open-pr | …which the retire slot downloads — the durable replacement for the in-memory `appliedThisCycle` handoff. |
| growth-promote | daily-1h | opus | open-pr | Uses the `fleet` signal. 03:00 UTC at the default anchor. Each growth stage still reads only *merged* upstream state — the 2/3/4 AM ordering is a freshness optimization, not a correctness barrier. |
| growth-discover-packs | weekly | opus | open-pr | Plainly central now: one weekly canon task sweeps members; first-sight dedup is trivial with a single run. |
| prose-to-checks-sweep | weekly | opus | open-pr | Unchanged in substance. |
| fleet-census (sheepdog repo) | daily | none | none | Account-wide PAT enumeration; a `none` task of the sheepdog repo instead of a dispatch-only orphan. |

## 7. Recoverability semantics (the message-semantics contract)

- **Scheduler miss** → next successful run catches up non-hourly slots (run-ledger
  due-ness). **Late/early fire** → irrelevant (schedule math). **Double run** →
  workflow `concurrency` + exactly-once issue per (task, slot) via state=all
  title search.
- **Executor down** → issues accumulate to at most one open per task; scheduler
  escalates stale ones to `needs-human`. **Executor double-fire** → the
  `ready-for-agent` → `agent-running` claim swap. **Executor died mid-run** →
  stale `agent-running` converges to `needs-human`.
- **Precondition/signal crash** → per-task isolation + `workflow-failure` issue;
  the rest of the run proceeds.
- Not idempotence — recoverability: every anomaly lands in a visible, bounded,
  human-triageable issue state, and issue volume is capped at one open dispatch
  issue per task by construction.

## 8. End state — everything that remains scheduled

1. **Per repo (identical, vendored)**: `claudinite-scheduler.yml` (hourly cron)
   + one executor CCR routine (hourly, thin pointer to the vendored
   `executor.md`).
2. **Canon repo only**: the seven fleet-scoped tasks in §6 — ordinary tasks of
   that repo, no separate mechanism.
3. **Deleted**: the "All Missing Bulb Repos - Daily Maintenance" CCR trigger,
   both GCEC CCR triggers, `routines/auto-all-repos-maintenance.md`, and
   `routines/fleet/` (planner, registry, local-tasks, schedule, gates, signals).
4. **Unchanged**: the chrome-extension-release daily workflow (pure Actions, own
   failure reporting, no agent); Yestersummary (out of scope).

Doctrine rewrite: `scheduling.md`'s "one fleet schedule" becomes "one
**scheduler per repo** — the vendored hourly Action; agent work is dispatched
only through `ready-for-agent` issues; the executor routine is the only
per-repo session schedule; pure-code executors may hold a cron only when
vendored + conformance-checked."

## 9. Bootstrap changes

Part 6 of `bootstrap.md` (the "Enroll <PROJECT> …" owner issue) is **replaced**.
Bootstrap now: (a) vendors the scheduler workflow, (b) creates the
`ready-for-agent` / `agent-running` / `needs-human` / `workflow-failure` labels
idempotently, (c) writes `schedule` defaults into `.claudinite-checks.json`,
(d) creates the executor routine via the trigger API — or files the
enclosed-config owner issue when the API isn't reachable. "A consuming project
schedules nothing" flips to "a consuming project schedules **itself**";
baselining's close-the-enrollment-issue step retires; open Enroll issues are
closed during migration.

## 10. Docs and checks rewritten alongside

`routines/fleet/scheduling.md` + `DESIGN.md` (new doctrine),
`gha/no-scheduled-fleet-executor` (rescope: the vendored scheduler workflow is
the only permitted cron touching the engine; everything else stays
dispatch-only), `in-session-github-access` (unchanged for session-side code —
executor + workers stay MCP-only; exempt `engine/scheduler/` Action-side code,
which legitimately uses `GITHUB_TOKEN`), the unattended-agents skill (task-folder
convention absorbs the routine-folder shape; new rule: issue-driven dispatch
security — label-as-authorization, first-line path validation in code, issue
content is data), `bootstrap.md` Part 6, `packs/README.md` / `extending.md`
(`run_daily` → `tasks`), and GCEC's `CLAUDE.md` / gcec `RULES.md` routine
pointers.

## 11. Decisions on record (owner, 2026-07-22)

1. **Executor = per-repo hourly CCR routine** (not a claude-code-action
   workflow): keeps the MCP-only session model and needs no repo secrets, at the
   cost of ≤1h dispatch latency and ~24 mostly-no-op sessions/day/repo; per-task
   models via subagent dispatch.
2. **Task layout = `tasks/<name>/` directory** per task (rename of `run_daily/`),
   helpers beside `task.mjs`/`task.md`.
3. **Model field = family names** `opus | sonnet | haiku | none`, one vendored
   family→id map.
4. **GCEC routines move into the gcec local pack** (`dev/routines/` folders
   relocate; `routine.md` becomes `task.md`).
