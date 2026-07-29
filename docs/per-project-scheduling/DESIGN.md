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

`run_daily/` is superseded by `tasks/`, one directory per task, in canon packs
and local packs alike:

```
packs/<pack>/tasks/<task-name>/
  task.mjs        # declaration + precondition — self-contained, importable standalone
  task.md         # the worker spec the agent executes; the dispatch issue's first line points here
  *.sh, *.js      # optional deterministic helper scripts (the routine-folder convention, absorbed)
```

> **As-built (Phase 0, #396):** `tasks/` lands **additively** — a canon pack
> carries both `tasks/` and its untouched `run_daily/` through the rollout, so
> the legacy central planner keeps working while the scheduler discovers `tasks/`
> from disk (`pack.mjs` is not touched). `run_daily/` is removed only at Phase 4.
> The two conformance guards for this shape (`task-declaration-shape`,
> `scheduler-workflow-shape`) live in the **basics** pack, not a separate one —
> scheduling is baseline discipline (see
> [`packs/basics/scheduled-tasks.md`](../../packs/basics/scheduled-tasks.md)).

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
  precondition_signals: ['commits', 'prs', 'issues'],   // which parts of the signals object to collect
  agent_model: 'opus',     // opus | sonnet | haiku | none — 'none' = pure code, no agent, no issue
  expected_outcome: 'merged-pr', // none | open-pr | merged-pr — the task's write ceiling (§4)
  agent_instructions: 'task.md',
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
- **`precondition_signals`** — the scheduler collects only the union of what the *due* tasks
  declare; a non-daily slot never pays for daily tasks' signals.
- **`agent_model`** — family names, resolved to a concrete model id in **one** vendored
  module (`engine/scheduler/model-map.mjs`), so a model-generation bump is one
  edit. `none` replaces `smarts: 'none'`: the worker is an `.mjs` the scheduler
  runs inline — no issue, no agent.
- **`expected_outcome`** — a declared **ceiling**, not a promise: `none` may never open a
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
"taskScheduler": { "dailyHour": 4, "weeklyDay": "Sun", "monthlyDay": 1 }
```

All values **UTC** (requirements normalize to UTC at the door). Defaults when
absent: `dailyHour: 4`, `weeklyDay: "Sun"`, `monthlyDay: 1`. `monthlyDay` clamps
to the month's last day; `daily-2h` with `dailyHour < 2` wraps into the previous
calendar day (the slot keeps the anchor's date). With the default anchor the four
daily slots stage the whole growth chain in order:

```
02:00  daily-2h   baselining (+ migrations-apply)   ─ own mount converged before anything reads it
03:00  daily-1h   extract, conversation-extract     ─ lessons captured from a converged repo
04:00  daily      promote (canon repo)              ─ lifts the night's merged extracts to canon
05:00  daily+1h   dedup                             ─ prunes against the mounted (merged) canon
```

The stages couple through *merged* upstream state, not a barrier: extract's
auto-merge PR usually lands well within the hour before promote reads it, and
dedup reads only the merged/mounted canon (never an in-flight promote PR), so the
ordering is freshness staging that mostly holds and self-heals to next-day
propagation when a merge lags.

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
   `taskScheduler`. Fetch the timestamp `T` of this workflow's last **successful** run
   (Actions API). A slot is due iff its time ∈ `(T, now]`.
   - Miss/outage → the next successful run catches up daily/weekly/monthly slots;
     no watermark file, nothing to corrupt.
   - Only the most recent slot per frequency is considered → a 3-day outage
     yields one catch-up evaluation, never a backfill storm.
   - **Hourly slots never catch up** (stale polls are worthless).
   - Late fire (15:02 for a ~15:00 slot) is irrelevant — due-ness is schedule
     math, never wall-clock equality.
   - No prior success (fresh adoption) → the most-recent slots of the **first-run
     set** are due: `hourly` plus the daily family, never weekly or monthly. The
     first run is an adoption smoke test, and the wiring it proves — discovery,
     signals, dispatch issue, label, executor pickup — is the same whatever the
     frequency, so the daily family exercises all of it. Adding weekly/monthly
     would only buy an off-anchor run of their unconditional tasks (open-web
     research, pack discovery, the fleet sweep) on the least-proven repo in the
     fleet; they wait for their real anchor, which is due normally once this run
     is in the ledger.
   - An **unreadable** ledger is not an empty one. `T = null` is a positive claim
     that the repo has never run, so the read returns it only for a 200 that
     found no successful run; a non-2xx (or a run record with no timestamp)
     throws and the run **fails**, evaluating nothing. Failing is free here —
     a failed run never enters the success ledger, so `T` stays put and the next
     successful run catches up the missed slots by the same outage rule above.
     An exit-0 abort would not be free: it would enter the ledger and advance `T`
     past the slots it declined to evaluate.
2. **Discovers tasks** with one uniform scan —
   `.claudinite/{shared,local}/packs/<p>/tasks/*/task.mjs` — activation-gated by
   the `packs` declaration exactly like checks and skills; filters to due
   frequencies.
3. **Collects signals** — only the declared union. Vocabulary (one collector
   module each; window = the task's period + 1h slack, stateless fixed lookback;
   overlap absorbed by dedupe):
   - `commits` — default-branch commits in window, `substantiveChange`
     classification, touched paths.
   - `prs`, `issues`, `branches` — open + touched-in-window. `branches` carries
     `touched` by reading each distinct tip sha's commit date (one read per tip;
     no REST branch listing carries a date), because before that it carried
     *names only* — leaving the branch dimension with no notion of newness and
     every gate over it degenerate to "a branch exists". An unreadable tip is
     `updatedAt: null`, never touched. `prs` additionally
     carries `merged`, the PRs **merged during the window** (the review
     discussion behind a change is the richest lesson material there is, and it
     is closed by the time a window sees it). `merged` is a separate field, not
     folded into `open`/`touched`, so widening it cannot widen the target set of
     a task that sweeps the open PRs. Self-trigger exclusions carried over **and
     extended**: the housekeeping-commit regex, tracker titles, and now
     `[claudinite-task]` issues and `ready-for-agent` label events are invisible
     to signals.
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
   A **manual** `workflow_dispatch` run may additionally carry `overrides` — one
   free-form `KEY=value` string, since GitHub cannot declare arbitrary named
   inputs. It reaches the engine as `CLAUDINITE_OVERRIDES`, and the engine
   understands exactly one key: **`FORCE_TASKS=<comma-separated task ids>`**.
   A forced task is put in the due list under its most-recent slot **and runs
   without its precondition being consulted at all** — forcing is a decision the
   operator already made, so nothing asks the task whether it agrees, and no task
   declaration mentions forcing anywhere (#515). The engine learns "run these
   ids", never what any of them do. An id matching no discovered task forces
   nothing; a task due on its own merit is judged normally, not forced; and a
   forced dispatch carries a generic Context saying so, since its issue Context
   is the agent's binding scope and nothing here asserts there is work to do.

   The case it exists for is `FORCE_TASKS=baselining`: the age gate
   (`ageDays > 1`) means a repo that baselined this morning is not due again for
   over a day, so a canon fix worth propagating *today* otherwise had no lever
   short of hand-editing each repo's stamp. The two gates are why forcing has to
   live in the engine: the SLOT gate runs before any precondition, so an override
   a task read for itself was unreachable on exactly the mid-day run that needs
   it.

4. **Runs preconditions** — pure code, per-task try/catch isolation; a throwing
   precondition converges to the standard failure state (`report-failure`
   composite → `workflow-failure` issue); other tasks proceed.
5. **Executes or dispatches** — `model: 'none'` → run the worker `.mjs` inline
   (which may itself dispatch and await another workflow); otherwise file the
   dispatch issue (§4) labeled `ready-for-agent`.
6. **Reports** — the job summary lists every evaluated task with run/skip/reason
   (the observability `plan.json` used to give). Whole-run failure escalates per
   `gha/scheduled-failure-escalation`. Beside the prose, the run prints one
   **machine-readable record per evaluated task** — `claudinite-task-run v1
   <pack>/<task> [<slot>] <outcome>`, outcome ∈ `agent` / `preprocess` /
   `skipped` / `failed` / `deferred` (`run-record.mjs`, the single home of both
   the renderer and its parser). Printed *after* the action loop, so it states
   what happened rather than what was planned. Nothing in the scheduler reads it
   back — it exists so the usage aggregation can count task invocations without
   the scheduler acquiring state of its own (skill-usage-metrics DESIGN §4.2).

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
- **Session sources** are the **member repo alone** (agent-preprocessing DESIGN
  §7/E5). The executor no longer needs the canon checkout: baselining fetches
  PUBLIC canon **Action-side** in its `agent_preprocessing` worker and reads
  migration notes from the member's own vendored mount, so a project-only session
  is all the ambient scope executor work requires. (Superseded the earlier model,
  where the canon rode in the session sources so the baselining task could run the
  canon's vendoring script directly.)
- **`executor.md`** (vendored, hyper-specific, MCP-only GitHub access):
  1. **The triggering issue is the session's *only* work item.** It never lists or
     processes another open `ready-for-agent` issue.

     This is the fix for the duplicate-execution bug. One scheduler run files every
     due task's dispatch issue seconds apart, each already labeled, so **one run
     emits one label event per issue and starts one session per event**. The
     original design paired that fan-out with a self-healing sweep in which every
     session also drained its siblings — so N dispatches produced N sessions each
     building the same N-issue work list. The step-3 claim could not save it: every
     session read the list before any of them claimed. Observed on 2026-07-26 —
     dispatch #427 run twice (#452), #425 run three times, leaving four duplicate
     tracker issues, three duplicate filings of one finding, and duplicate PRs
     making the same changes.

     One session, one issue: concurrency between sessions stays normal and becomes
     safe by construction. The recovery the sweep provided moves into deterministic
     scheduler code (below).

     Steps 1 and 2 are one command: `resolve-dispatch.mjs` does both, so neither
     the identification nor the validation depends on the session's judgment.

     **The trigger reaches the session by two transports, and both are read.**
     GitHub Actions writes the webhook payload to `$GITHUB_EVENT_PATH` (number +
     label + body, one shot). Claude Code on the web writes no payload file and
     instead sets `CCR_TRIGGER_SOURCE` / `CCR_TRIGGER_EVENT` / `CCR_TRIGGER_REPO`
     / `CCR_TRIGGER_ISSUE_NUMBER`, which name the issue but carry neither its
     labels nor its body — so that path resolves in two shots (`needs-issue`,
     exit 13: the executor fetches that one issue over MCP, saves the raw
     response JSON verbatim, and re-invokes with `--issue-json`; the shell
     extracts body/labels/title itself and rejects a response for the wrong
     issue number — `--issue-body-file` / `--issue-labels` remain as the manual
     fallback). Reading only the Actions transport
     is what let the duplicate-execution bug back in: every CCR-run executor
     session missed its own trigger, fell through to the fallback, and selected
     an issue by listing. Observed 2026-07-28, dispatch #772 claimed twice one
     second apart.

     **There is no fallback, deliberately.** A session that cannot name its
     trigger runs *nothing* (exit 12) — it never selects a dispatch by listing the
     queue. That fallback was the same N-sessions-racing-over-N-issues failure as
     the sweep it replaced, reached from the other direction: every session that
     cannot identify its trigger builds the same work list, and the claim cannot
     save them because they all read the list before any of them claims. The
     scheduler's hourly re-arm is the recovery, in code, once.
  2. Deterministic validation in code, before any model judgment
     (`resolve-dispatch.mjs`, over `validate-dispatch.mjs`'s pure core): the body's
     first line matches
     `^(\.claudinite\/(shared|local)\/)?packs\/[^/]+\/tasks\/[^/]+\/task\.md$`,
     the file exists at HEAD, its pack is declared, its `task.mjs` sibling
     parses; prints the resolved model and outcome ceiling. The shell itself makes
     no GitHub call on either transport — the body arrives from the payload or
     from the executor's own MCP fetch — which is what keeps it runnable in the
     MCP-only, tokenless executor session. Exit codes are the interface: valid /
     invalid (comment + de-label + `needs-human`) / not-this-scope / needs-issue /
     no-trigger (stop).
  3. **Claim** the issue as a *verified lease*, since GitHub offers no
     compare-and-swap on labels: **read** the current labels and abandon if the
     ready label is gone or `agent-running`/`needs-human` is present; **swap**
     `ready-for-agent` → `agent-running` and post a claim comment; **re-read** and,
     if a second claim comment is present, let the earliest claim win and end the
     session without dispatching. The read-swap-*confirm* shape is what makes the
     claim meaningful — the original blind swap could not detect a lost race, and
     the missing third step is what let a duplicate through.
  4. Dispatch a subagent at the declared model: read `task.md`, follow it
     exactly; the issue's Context section is binding scope — never re-decide or
     widen it.
  5. Post-verify in code (`verify-outcome.mjs`): outcome ceiling respected (a
     `none` task that opened a PR, or an `open-pr` task that merged one, fails
     the run); then close the issue with a result comment, or converge the
     failure (comment + `needs-human`, remove `agent-running`).
  6. **No backstop sweeps.** Converging a dead `agent-running` claim, and
     re-arming a dispatch whose label event never landed, are the **scheduler's**,
     in code, once per hourly run — not the executor's. Sweeping them here meant
     every session triggered by the same run swept the same issues in parallel:
     the duplicate-work bug again, in miniature.

**The scheduler's maintenance pass** (`run.mjs` `maintainDispatchIssues`, over the
pure rules in `dispatch.mjs`) is now the single home for executor recovery. Each
hourly run, after filing the cycle's dispatches:

  1. **Stale** — a dispatch open past ~2 of its own scheduling periods →
     escalation comment, drop the ready label, add `needs-human`
     (`staleDispatchIssues`; specified since the original design, but never
     actually wired into `main()` until now).
  2. **Dead claim** — `agent-running` with no activity for ~3h → comment, drop
     `agent-running`, add `needs-human` (`staleClaimedDispatchIssues`). Scoped to
     `[claudinite-task]` titles, so a task's claim on an issue *it* owns is never
     swept.
  3. **Re-arm** — armed, unclaimed, uncommented and past a 20-minute grace window
     → the trigger event was lost, so remove and re-add its own ready label to
     emit a fresh one (`rearmDispatchIssues`). Remove-then-add is load-bearing:
     re-applying a label already present emits no `labeled` event. A fleet
     dispatch re-arms under the fleet label, never the self one.

Stale wins over re-arm, so an issue converging to triage is never put back into
circulation; and stale is what bounds the re-arm loop when the executor is down
for good.

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

| Task (pack) | frequency | precondition_signals | agent_model | expected_outcome | Notes |
|---|---|---|---|---|---|
| baselining (basics) | daily-2h | stamp, sharedMount | sonnet | merged-pr | **Now a per-repo self-refresh, not a fleet pass**: converge own `.claudinite/shared/` to canon head, apply pending migration notes (the old fleet apply pass folds in here), advance the stamp — delivered on the per-cycle `claudinite/maintenance-*` PR, delivery per member config. **Superseded by agent-preprocessing DESIGN §7/E4–E5**: the deterministic converge is now `agent_preprocessing` fetching **public** canon Action-side (no in-session canon checkout — E5 drops canon from the executor's sources), and the agent stage runs only on the nights judgment is left (conditional hand-off). Precondition fires ~daily via the stamp-age fallback (`canonHead` is null now — the worker fetches canon, not the Action). The canon repo skips naturally (no shared mount). |
| growth-extract (grow_with_claudinite) | daily-1h | commits, prs, issues | opus | merged-pr | Precondition = substantiveChange; context = the commit/PR/issue lists. |
| conversation-extract (grow_with_claudinite) | daily-1h | commits, conversationLogs | opus | merged-pr | Age-based retention prune fires correctly on quiet repos. |
| growth-dedup (grow_with_claudinite) | daily+1h | localPacks, sharedMount, commits | opus | open-pr | `relevantCanonChanged` → `sharedMount`. The weekly re-check crutch retires; a quiet repo skips. |
| tidy-issues (tidy-repo) | daily | issues, commits | sonnet | none | The undeclared-canon carve-out dies: the canon repo declares tidy-repo like everyone else. **One task per tidy dimension** (the single `repo-tidy` pass split, #481): the acting dimension. Trigger = an issue touched in the window; scope = those issues, widened to every open issue when the default branch ALSO moved substantively — that move is what can make an old issue implemented, so the "full sweep" is signal-triggered, never a calendar flag. The move does not *wake* the task, only widen it: on a repo whose `main` moves most days, waking on it re-triaged every open issue daily. |
| tidy-prs (tidy-repo) | weekly | prs | sonnet | none | Assess-only. Gated on an open PR being opened or updated in the window; full whenever it runs (scope = every open PR, since a verdict is relative to the others). A PR verdict is a standing recommendation, not a same-day alert, so the full sweep is the **frequency declaration** — consistent with `fullSweep` retiring in §3. An untouched set of open PRs yields the verdicts already in the tracker, so it is not re-swept. |
| tidy-branches (tidy-repo) | weekly | branches | sonnet | none | Assess-only. Gated on a branch being created or pushed in the window (the `branches` signal carries tip dates for exactly this; a push to the default or an infra branch does not count); full whenever it runs, since a branch verdict is relative to the others. Branch cruft accumulates on a weekly clock. Excludes the presumed default names and the infra branches (`conversation-logs`, `claudinite/maintenance`); the worker owns excluding the repo's *real* default branch. |
| wiki-growth (product-wiki) | weekly | commits | opus | open-pr | The open-growth-PR preflight is subsumed by the at-most-one-open-issue guard + a precondition check. |
| store-release (chrome-extension-release) | daily | release, commits | none | none | **Absorbs the release workflow's independent 00:30 cron**: the precondition detects a deployable change since the last release (or an unreleased manifest bump); the inline worker dispatches the `Release to Chrome Store` workflow in daily mode and awaits it. The workflow becomes push + `workflow_dispatch` only; its conformance check flips from *requiring* the contract cron to *forbidding* any cron. |
| create-extractor (gcec, local) | **hourly** | issues | sonnet | open-pr | **Revised by agent-preprocessing (§9), as built.** The *precondition* is only the cheap gate it can be from signals alone: is any open request issue eligible (not already claimed or handed to a human)? Everything deterministic — triage, closing the requests that need no work, branch + scaffold, the page fetch its `required_secrets` pays for, and the draft PR — is `agent_preprocessing`, which needs the issue bodies, GitHub writes, and network fetch a precondition may not do. The agent is requested (conditional hand-off) only when there is genuinely something left to write. The user-facing request issue stays; the dispatch issue references it. |
| auto-fallback-coverage (gcec, local) | daily | commits | opus | open-pr | `preconditions.sh` becomes the precondition over `commits`. Fixes the live cadence bug (daily spec vs weekly cron: ~6/7 of windows currently unexamined). |
| fleet-freshness (sheepdog) | weekly | none | none | none | **Added after this design, by what this design caused.** Making every member maintain itself removed the last outside look at a member: one whose scheduler was never vendored, was deleted, or was auto-disabled after 60 quiet days is still `covered` to the census and files no failure issue, because nothing runs there to fail — self-maintenance cannot detect its own absence. This sweep probes each covered member's declaration, scheduler workflow, and stamped ref against Claudinite's default branch, and classifies drift by root cause (`no-stamp` → `no-scheduler` → `ref-not-on-trunk` → `behind`), converging `fleet-drift` issues. Same classification as its sibling: an ordinary pack task whose *implementation* spans the fleet. Weekly because drift is measured in days (`staleDays`, default 14); it shares the census's PAT and adds no scope. |
| fleet-census (sheepdog) | daily | none | none | none | **An ordinary pack task, not a fleet mechanism**: its *implementation* — preprocessing that runs the census with the account-spanning PAT, declared as `required_secrets` — happens to scan every repo under the owner, but its declaration, scheduling, and lifecycle are exactly those of any pack task. This classification is noted in the sheepdog pack's RULES.md and in the task file itself. (As designed here this was a dispatch-only workflow holding the PAT; #472 folded it into preprocessing, since a workflow existing only to hold a secret is redundant once a task can declare one.) |

Canon-repo tasks — the canon's own packs on the same machinery. Only three are
genuinely fleet-scoped (they need the `fleet` signal / cross-repo reach); the
rest of what the old central routine did has moved above:

| Task | frequency | agent_model | expected_outcome | Fleet-scoped? | Notes |
|---|---|---|---|---|---|
| growth-promote (canon-curation) | daily | opus | open-pr | yes | Reads members' local packs (`fleet` signal: which members' local packs changed); writes the canon; owner-gated PR. 04:00, after the fleet's 03:00 extracts. |
| growth-discover-packs (canon-curation) | weekly | opus | open-pr | yes | Moves from member-scheduled/centrally-executed to plainly central: one weekly sweep over members; first-sight dedup is trivial with a single run. |
| migrations-retire (canon-curation) | daily+1h | none | open-pr | yes | Apply evidence is now per-repo (each member's stamp advances when its own baselining applies notes), so the retire guard reads member stamps + `legacyPresent` probes over the `fleet` signal — the same five-condition guard with per-repo stamps replacing the in-memory same-cycle handoff. No artifact plumbing. |
| prose-to-checks-sweep (canon-curation) | **daily** | opus | open-pr | no | Not a fleet thing — a canon task going over the canon's own prose. Daily per owner decision. |

## 7. Recoverability semantics (the message-semantics contract)

- **Scheduler miss** → next successful run catches up non-hourly slots (run-ledger
  due-ness). **Late/early fire** → irrelevant (schedule math). **Double run** →
  workflow `concurrency` + exactly-once issue per (task, slot) via state=all
  title search.
- **Missed label event / executor down** → the issue stays labeled and open; the
  scheduler's next run re-arms it, and escalates it to `needs-human` if it is
  still unrun past ~2 periods. **Duplicate label events on one issue** → the
  read-swap-confirm claim lease. **Several issues dispatched at once** → not a
  race at all: each session runs only its own issue. **Executor died mid-run** →
  the scheduler converges the stale `agent-running` claim to `needs-human`.
- Recovery lives in **one place, in code**. The rule it cost a duplicate-execution
  incident to learn: when a trigger fans out to N concurrent sessions, never also
  give each session a sweep over the shared work — every session will do every
  other session's work, and a claim taken after the work list is read cannot
  prevent it.
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
agent work is dispatched only through `ready-for-agent` issues; recurring work
that used to be its own cron'd workflow becomes a scheduler task, and that
workflow is deleted."

A competing cron is **not** retained as a dispatch-only workflow for a task to
fire. That shape keeps two files and two edit sites for one job, and leaves a
workflow whose only caller is the thing that replaced it — the task's worker is
where the steps belong. The one shape that legitimately survives is a workflow
that must run *as an Action* for something a task cannot reach (see
`store-release`, §7) — and even then the task owns the schedule, not the
workflow.

## 9. Bootstrap changes

Part 6 of `bootstrap.md` (the "Enroll <PROJECT> …" owner issue) is **replaced**.
Bootstrap now: (a) vendors the scheduler workflow, (b) writes `taskScheduler` defaults
into `.claudinite-checks.json`, (c) creates the label-wired executor routine via the
trigger API — or files the enclosed-config owner issue when the API isn't reachable.
The `ready-for-agent` / `agent-running` / `needs-human` / `workflow-failure` labels
need **no** bootstrap step: the scheduler ensures each exists (create-if-missing,
idempotent) before it dispatches, so they materialize on the first run and self-heal
if deleted — GitHub never creates a label on demand when it is applied, so the
assigner guaranteeing it is the correct home for that (the label-create-before-add
principle, in code). "A consuming project
schedules nothing" flips to "a consuming project schedules **itself**";
baselining's close-the-enrollment-issue step retires; open Enroll issues are
closed during migration.

## 10. Docs and checks rewritten alongside

`routines/fleet/scheduling.md` + `DESIGN.md` (new doctrine),
`gha/no-scheduled-fleet-executor` (rescope: the vendored scheduler workflow is
the repo's only permitted cron; a competing cron's work moves into a scheduler
task and the workflow is deleted),
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
9. **Growth chain ordered across the four daily slots** (review): baselining +
   migrations-apply `daily-2h` (02:00) → extract `daily-1h` (03:00) → promote
   `daily` (04:00) → dedup `daily+1h` (05:00).
10. **Scheduler cron minute constrained to :10–:50** (review).
