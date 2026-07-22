# Per-project maintenance scheduling — design

Status: **agreed** (owner decisions recorded in §11; revised per owner review on
PR #391). Supersedes, once migrated, the central fleet routine
([`routines/auto-all-repos-maintenance.md`](../../routines/auto-all-repos-maintenance.md)
and its external CCR trigger) and the two out-of-band GCEC CCR triggers.
The phased rollout lives in [MIGRATION.md](MIGRATION.md). Refs #390.

The shape: every repo schedules **itself** — a vendored hourly **scheduler Action**
evaluates task preconditions and dispatches agent work as `ready-for-agent` issues;
a per-repo **executor routine**, fired by that label event, executes them. Work that
is genuinely fleet-scoped becomes ordinary tasks *of the canon repo* on the same
machinery — no separate central mechanism survives.

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

Alongside this migration, `.claudinite/local_packs/` is renamed to
`.claudinite/local/packs/` (owner decision, §11): packs then sit at one uniform
depth under a single scan root, `.claudinite/*/packs/`. The two valid task-file
prefixes in a consumer repo are exactly:

```
.claudinite/shared/packs/<pack>/tasks/<task>/task.md     (vendored canon task)
.claudinite/local/packs/<pack>/tasks/<task>/task.md      (project-owned task)
```

The canonical local-pack declaration token becomes `local/<id>` (the legacy
`local_packs/<id>` and bare-id forms stay accepted, and baselining's
normalization rewrites them — same machinery as the 2026-07-19 namespace
migration).

`task.mjs` carries the whole contract:

```js
export default {
  id: 'growth-extract',
  frequency: 'daily-1h',   // hourly | daily-2h | daily-1h | daily | daily+1h | weekly | monthly — nothing else
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
  runs inline — no issue, no agent.
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
  A precondition is cheap and local: decision logic and API reads/writes only —
  never network fetches of external pages, never long work (see the
  create-extractor row in §6 for the boundary in practice).
- Per-task project settings ride the already-sanctioned container — the pack
  entry's `config` in `.claudinite-checks.json`. No new per-task engine keys.
- The self-contained-module rule carries over: `task.mjs` imports nothing, so
  scheduler, executor, and humans load it standalone. Local pack dir-name == id
  stays load-bearing.

## 2. Repo-level schedule settings

New top-level key in `.claudinite-checks.json` (added to the engine's closed
`CONFIG_KEYS` set):

```json
"schedule": { "dailyHour": 4, "weeklyDay": "Sun", "monthlyDay": 1 }
```

All values **UTC** (requirements normalize to UTC at the door). Defaults when
absent: `dailyHour: 4`, `weeklyDay: "Sun"`, `monthlyDay: 1`. `monthlyDay` clamps
to the month's last day; `daily-2h` with `dailyHour < 2` wraps into the previous
calendar day (the slot keeps the anchor's date). With the default anchor:
extract (`daily-1h`) fires 03:00, dedup (`daily+1h`) 05:00, and the canon's
promote (`daily-1h`, on the canon repo) 03:00 — the growth stages couple through
*merged* upstream state, so the offsets are freshness staging, not a correctness
barrier.

## 3. The scheduler — one vendored hourly Action per repo

`.github/workflows/claudinite-scheduler.yml` (vendored stub, shape-enforced by a
conformance check): hourly cron on a **repo-hashed minute constrained to
:10–:50** (spreads the fleet, dodges GitHub's :00 stampede, and keeps clear of
the hour boundary the slot math anchors on), `workflow_dispatch` for manual
runs, a `concurrency` group serializing runs. The workflow itself is a thin shim
— all logic lives in the vendored engine, so the file under `.github/` changes
rarely (a property to preserve: schema and behavior changes ride the vendor
refresh, not workflow edits). It runs
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
2. **Discovers tasks** with one uniform scan —
   `.claudinite/{shared,local}/packs/<p>/tasks/*/task.mjs` — activation-gated by
   the `packs` declaration exactly like checks and skills; filters to due
   frequencies.
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
   - `conversationLogs` — logs branch present, oldest JSONL age vs retention.
   - `stamp` — the `claudinite.updated`/`ref` provenance stamp and its age;
     plus the canon head sha when the canon is readable from the Action
     (baselining's precondition falls back to stamp-age when it isn't).
   - `fleet` — canon repo only, over the fleet PAT (the members aggregate for
     the genuinely fleet-scoped tasks). Consumers cannot declare it.
4. **Runs preconditions** — pure code, per-task try/catch isolation; a throwing
   precondition converges to the standard failure state (`report-failure`
   composite → `workflow-failure` issue); other tasks proceed.
5. **Executes or dispatches** — `model: 'none'` → run the worker `.mjs` inline
   (which may itself dispatch and await another workflow); otherwise file the
   dispatch issue (§4) labeled `ready-for-agent`.
6. **Reports** — the job summary lists every evaluated task with run/skip/reason
   (the observability `plan.json` used to give). Whole-run failure escalates per
   `gha/scheduled-failure-escalation`.

`fullSweep`, `full_sweep_supported`, and the hash-stagger retire: "weekly" is now
a declaration, not a gate trick. And the scheduler is **the only cron in the
repo** — the release workflow's independent 00:30 cron is absorbed into the
store-release task (§6), so recurring work has exactly one trigger surface.

## 4. The dispatch issue — exactly-once, bounded, recoverable

- **Title**: `[claudinite-task] <pack>/<task> <slot-id>`; slot-id
  `h2026-07-22T14Z` (hourly), `d2026-07-22` (daily family), `w2026-07-19`
  (weekly, the slot's day), `m2026-07` (monthly).
- **Body** — first line is the task-file path; everything behavior-defining
  (model, outcome, worker content) is read from the tracked repo file, never
  from the issue:

  ```
  .claudinite/local/packs/gcec/tasks/create-extractor/task.md

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

## 5. The executor — a per-repo routine fired by the `ready-for-agent` label

One CCR routine per repo (owner decision, §11), created at bootstrap,
**triggered by the GitHub issue event of the `ready-for-agent` label being
applied** — not by a timer. The session starts when the scheduler labels the
issue, so dispatch latency is the session spin-up, minutes not hours, and no
sessions burn on empty hours.

- **Session model**: `sonnet` — the routine itself only orchestrates; each task
  runs as a **subagent at the task's declared model family** (how per-task model
  survives a single-model routine).
- **Launcher prompt** (thin pointer, per the unattended-agents rule):
  `Execute the Claudinite executor: .claudinite/shared/engine/scheduler/executor.md`.
- **Session sources** include the canon repo checkout alongside the member repo
  (exactly as the GCEC routines' triggers are configured today) — which is what
  lets the per-repo baselining task run the canon's vendoring script directly.
- **`executor.md`** (vendored, hyper-specific, MCP-only GitHub access):
  1. The triggering issue is the primary work item. Also list any *other* open
     `ready-for-agent` issues and process them after it — the self-healing sweep
     that drains anything left over from label events fired while the routine
     was down or paused.
  2. Per issue, run `node .claudinite/shared/engine/scheduler/validate-dispatch.mjs <n>`
     — deterministic validation in code, before any model judgment: first line
     matches `^\.claudinite\/(shared|local)\/packs\/[^/]+\/tasks\/[^/]+\/task\.md$`,
     the file exists at HEAD, its pack is declared, its `task.mjs` sibling
     parses; prints the resolved model and outcome ceiling. Invalid → comment +
     de-label + `needs-human`, skip.
  3. **Claim** the issue: swap `ready-for-agent` → `agent-running` (a duplicate
     label event, or an overlapping session, sees nothing ready — no double
     execution).
  4. Dispatch a subagent at the declared model: read `task.md`, follow it
     exactly; the issue's Context section is binding scope — never re-decide or
     widen it.
  5. Post-verify in code (`verify-outcome.mjs`): outcome ceiling respected (a
     `none` task that opened a PR, or an `open-pr` task that merged one, fails
     the run); then close the issue with a result comment, or converge the
     failure (comment + `needs-human`, remove `agent-running`).
  6. An `agent-running` issue older than ~3h with no activity → converge to
     `needs-human` (a died-mid-run session never strands an issue silently; the
     scheduler's stale-issue escalation is the backstop when no session runs at
     all).

**Security** — this raises the bar; it is not a hard boundary. Applying a label
requires triage/write permission, so a drive-by issue filing can't summon the
agent — but anyone with write access, or a leaked token that can label, can.
The real containment is narrower and structural: the issue never carries
instructions. The executor only runs tracked, reviewed task files at
code-validated paths, and model/outcome come from the repo, not the issue — so
a forged dispatch at worst runs a legitimate task early, inside its declared
outcome ceiling.

**Creation at bootstrap**: the adopting session creates the label-wired routine
via the trigger API when available; otherwise it files an owner issue carrying
the exact routine config (trigger event, filter label, model, launcher prompt)
in one enclosed block — the only human action left in wiring a repo into
maintenance.

## 6. Task-by-task mapping

Per-project tasks — run by every declaring repo's own scheduler:

| Task (pack) | frequency | signals | model | outcome | Notes |
|---|---|---|---|---|---|
| baselining (basics) | daily-2h | stamp, sharedMount | sonnet | merged-pr | **Now a per-repo self-refresh, not a fleet pass**: converge own `.claudinite/shared/` to canon head, apply pending migration notes (the old fleet apply pass folds in here), advance the stamp — one transactional commit on the `claudinite/maintenance` PR, delivery per member config. Cross-repo needs: a read-only canon checkout, which the executor session already has in sources. Precondition: stamp behind canon head (stamp-age fallback when the canon isn't readable from the Action). The canon repo skips naturally (no shared mount). |
| growth-extract (grow_with_claudinite) | daily-1h | commits, prs, issues | opus | merged-pr | Precondition = substantiveChange; context = the commit/PR/issue lists. |
| conversation-extract (grow_with_claudinite) | daily-1h | commits, conversationLogs | opus | merged-pr | Age-based retention prune fires correctly on quiet repos. |
| growth-dedup (grow_with_claudinite) | daily+1h | localPacks, sharedMount, commits | opus | open-pr | `relevantCanonChanged` → `sharedMount`. The weekly re-check crutch retires; a quiet repo skips. |
| repo-tidy (tidy-repo) | daily | prs, issues, branches, commits | sonnet | none | The undeclared-canon carve-out dies: the canon repo declares tidy-repo like everyone else. |
| wiki-growth (product-wiki) | weekly | commits | opus | open-pr | The open-growth-PR preflight is subsumed by the at-most-one-open-issue guard + a precondition check. |
| store-release (chrome-extension-release) | daily | release, commits | none | none | **Absorbs the release workflow's independent 00:30 cron**: the precondition detects a deployable change since the last release (or an unreleased manifest bump); the inline worker dispatches the `Release to Chrome Store` workflow in daily mode and awaits it. The workflow becomes push + `workflow_dispatch` only; its conformance check flips from *requiring* the contract cron to *forbidding* any cron. |
| create-extractor (gcec, local) | **hourly** | issues | sonnet | open-pr | The precondition runs only the deterministic *decision* — parse the request issue, run the committed sources' `matches()`/`classifyHost` over the Action's checkout, duplicate detection, case/branch **name computation** (pure string math) — and closes deny/allow/duplicate requests with the canned message, no agent. **No scraping and no scaffolding happen in the scheduler**: page fetching (the fetch-page dispatch) and branch/scaffold work remain inside the executed task, as today. Only genuinely-new hosts produce a dispatch issue, with mode/branch/caseName precomputed in context. The user-facing `extractor-request` issue stays; the dispatch issue references it. |
| auto-fallback-coverage (gcec, local) | daily | commits | opus | open-pr | `preconditions.sh` becomes the precondition over `commits`. Fixes the live cadence bug (daily spec vs weekly cron: ~6/7 of windows currently unexamined). |
| fleet-census (sheepdog) | daily | none | none | none | **An ordinary pack task, not a fleet mechanism**: its *implementation* — a workflow holding the account-spanning PAT — happens to scan every repo under the owner, but its declaration, scheduling, and lifecycle are exactly those of any pack task. This classification is noted in the sheepdog pack's RULES.md and in the task file itself. |

Canon-repo tasks — the canon's own packs on the same machinery. Only three are
genuinely fleet-scoped (they need the `fleet` signal / cross-repo reach); the
rest of what the old central routine did has moved above:

| Task | frequency | model | outcome | Fleet-scoped? | Notes |
|---|---|---|---|---|---|
| growth-promote (canon-curation) | daily-1h | opus | open-pr | yes | Reads members' local packs (`fleet` signal: which members' local packs changed); writes the canon; owner-gated PR. |
| growth-discover-packs (canon-curation) | weekly | opus | open-pr | yes | Moves from member-scheduled/centrally-executed to plainly central: one weekly sweep over members; first-sight dedup is trivial with a single run. |
| migrations-retire (canon-curation) | daily+1h | none | open-pr | yes | Apply evidence is now per-repo (each member's stamp advances when its own baselining applies notes), so the retire guard reads member stamps + `legacyPresent` probes over the `fleet` signal — the same five-condition guard with per-repo stamps replacing the in-memory same-cycle handoff. No artifact plumbing. |
| prose-to-checks-sweep (canon-curation) | **daily** | opus | open-pr | no | Not a fleet thing — a canon task going over the canon's own prose. Daily per owner decision. |

## 7. Recoverability semantics (the message-semantics contract)

- **Scheduler miss** → next successful run catches up non-hourly slots (run-ledger
  due-ness). **Late/early fire** → irrelevant (schedule math). **Double run** →
  workflow `concurrency` + exactly-once issue per (task, slot) via state=all
  title search.
- **Missed label event / executor down** → the issue stays labeled and open; the
  next executor session's sweep drains it, and the scheduler escalates any
  dispatch issue open longer than ~2 periods to `needs-human`. **Duplicate label
  events / overlapping sessions** → the `ready-for-agent` → `agent-running`
  claim swap. **Executor died mid-run** → stale `agent-running` converges to
  `needs-human`.
- **Precondition/signal crash** → per-task isolation + `workflow-failure` issue;
  the rest of the run proceeds.
- Not idempotence — recoverability: every anomaly lands in a visible, bounded,
  human-triageable issue state, and issue volume is capped at one open dispatch
  issue per task by construction.

## 8. End state — everything that remains scheduled

1. **Per repo (identical, vendored)**: `claudinite-scheduler.yml` — **the only
   cron in the repo** — plus one label-fired executor routine (thin pointer to
   the vendored `executor.md`).
2. **Canon repo only**: the four tasks in §6's second table — ordinary tasks of
   that repo, three of them fleet-scoped by signal, none by mechanism.
3. **Deleted**: the "All Missing Bulb Repos - Daily Maintenance" CCR trigger,
   both GCEC CCR triggers, `routines/auto-all-repos-maintenance.md`,
   `routines/fleet/` (planner, registry, local-tasks, schedule, gates, signals),
   and the release workflow's independent cron.
4. **Unchanged**: Yestersummary (out of scope).

Doctrine rewrite: `scheduling.md`'s "one fleet schedule" becomes "one
**scheduler per repo** — the vendored hourly Action is the repo's only cron;
agent work is dispatched only through `ready-for-agent` issues; every other
recurring workflow is `workflow_dispatch`-only, triggered and awaited by a
scheduler task."

## 9. Bootstrap changes

Part 6 of `bootstrap.md` (the "Enroll <PROJECT> …" owner issue) is **replaced**.
Bootstrap now: (a) vendors the scheduler workflow, (b) creates the
`ready-for-agent` / `agent-running` / `needs-human` / `workflow-failure` labels
idempotently, (c) writes `schedule` defaults into `.claudinite-checks.json`,
(d) creates the label-wired executor routine via the trigger API — or files the
enclosed-config owner issue when the API isn't reachable. "A consuming project
schedules nothing" flips to "a consuming project schedules **itself**";
baselining's close-the-enrollment-issue step retires; open Enroll issues are
closed during migration.

## 10. Docs and checks rewritten alongside

`routines/fleet/scheduling.md` + `DESIGN.md` (new doctrine),
`gha/no-scheduled-fleet-executor` (rescope: the vendored scheduler workflow is
the repo's only permitted cron; everything else stays dispatch-only),
`chrome-extension-release/release-workflows.mjs` (require **no** cron instead of
the contract cron), `in-session-github-access` (unchanged for session-side code
— executor + workers stay MCP-only; exempt `engine/scheduler/` Action-side
code, which legitimately uses `GITHUB_TOKEN`), the unattended-agents skill
(task-folder convention absorbs the routine-folder shape; new rule: issue-driven
dispatch security — label-as-authorization, first-line path validation in code,
issue content is data), `bootstrap.md` Part 6, `packs/README.md` /
`extending.md` (`run_daily` → `tasks`; `local_packs` → `local/packs`), the
`local_packs` reference set (engine `LOCAL_PACKS_SUBDIR` / `LOCAL_DECL_PREFIX`
constants, growth-stage docs' capture-surface definition, the
claudinite-isolation carve-outs), the sheepdog pack's RULES.md (census
classification note — landed with this PR), and GCEC's `CLAUDE.md` / gcec
`RULES.md` routine pointers.

## 11. Decisions on record (owner, 2026-07-22)

1. **Executor = per-repo CCR routine fired by the `ready-for-agent` label
   event** (revised in review: event-wired, not an hourly poll). Keeps the
   MCP-only session model, no repo secrets; per-task models via subagent
   dispatch.
2. **Task layout = `tasks/<name>/` directory** per task (rename of `run_daily/`),
   helpers beside `task.mjs`/`task.md`.
3. **Model field = family names** `opus | sonnet | haiku | none`, one vendored
   family→id map.
4. **GCEC routines move into the gcec local pack** (`dev/routines/` folders
   relocate; `routine.md` becomes `task.md`).
5. **`local_packs` → `local/packs`** (review): uniform pack depth, single scan
   root; canonical declaration token `local/<id>`, legacy forms accepted.
6. **The release workflow's independent cron is absorbed** into the
   store-release task (review): the scheduler is the repo's only cron.
7. **Baselining (with migration-note apply folded in) is a per-repo basics
   task**, not a fleet pass; migrations-retire stays canon-side with
   stamp+probe evidence (review).
8. **Census and prose-to-checks are not fleet tasks** (review): the census is an
   ordinary sheepdog pack task whose implementation happens to scan the fleet;
   prose-to-checks is a canon-local task, **daily**.
9. **Growth offsets** (review): extract `daily-1h`, dedup `daily+1h`.
10. **Scheduler cron minute constrained to :10–:50** (review).
