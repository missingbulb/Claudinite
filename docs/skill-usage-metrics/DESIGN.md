# Skill-usage metrics — design

Status: **agreed** (owner decisions recorded in §10; design review in the
2026-07-28 session). Refs #520. This document describes the **final state**
only; there is no migration plan — the rollout self-converges through the
existing machinery (the nightly vendored-canon refresh carries the code, a
baselining-applied migration note registers the hook), and the one ordering
constraint (§3.5) is satisfied by shipping the capture changes in one PR.

The problem: skills are mounted per repo, but mounting only puts a name and a
one-line description into the session's system prompt — actually *loading* the
skill is model discretion, and nothing records whether it ever happens. The
only evidence is the session transcript, which is ephemeral (and, once captured
to the `conversation-logs` branch, deleted at retention). So the promotion
ladder's rung-4/rung-5 call — skill vs prose — has no empirical feedback: a
skill whose trigger never fires is indistinguishable from one that fires daily,
and a "skill" that fires in every session (rules wearing a skill's clothes) is
indistinguishable from a genuinely activity-scoped one.

The same blind spot covers the **conformance checks**, from the other side. A
check that fails is a win: the finding reaches the session through the Stop
hook and the agent corrects before the work leaves the branch. Nothing counts
those corrections either — so "is this rule earning its place" and "is
enforcement even running" are as unanswerable as "does this skill ever load".
The checks ride the same pipeline, and §4.1 is where they are counted.

A third blind spot sits outside sessions entirely. Most of what a repo does on a
schedule opens no session at all — a precondition that finds nothing to do, an
`agent_model: none` task whose deterministic pass is the whole task, a dispatch
suppressed because an earlier one is still open — so "how much agent work did
this task cause" and "is this task doing anything" are not under-counted by the
capture pipeline, they are absent from it. §4.2 counts them from the scheduler's
own run records. And the sessions that *do* run unattended never captured at all
until §3.4: an executor session ends by having its container reclaimed, which is
exactly the ending no `SessionEnd` hook fires on.

The shape: session transcripts already record every skill invocation, and the
check runners leave readable marks in them too. Capture already ships
transcripts to each repo's orphan `conversation-logs` branch at merge time.
This design (a) enriches capture with a best-effort session-end event and an
explicit one for unattended runs, (b) adds a deterministic daily **fold** in each
repo that counts skill loads, check activations and failures, activity
denominators, and task invocations into a small tracked aggregate, and (c) adds a
**fleet sweep** in the sheepdog pack that recomputes a fleet-wide aggregate from
the members' files into the fleet-enforcer repo. Every stage is deterministic
code — no agent judgment anywhere in the pipeline.

```
transcript ──(merge capture / SessionEnd capture / the executor's own last step)──▶ conversation-logs branch
    conversation-logs ─────┐
    scheduler run logs ────┴──(usage-fold, per repo, daily)──▶ .claudinite/local/usage.GENERATED.json
    member usage files ───────(fleet-usage, sheepdog, daily)──▶ usage-fleet.GENERATED.json (enforcer repo)
```

---

## 1. Where knowledge lives — the placement rule

The canon knows **mechanisms**, never repos. The fleet-enforcer repo knows
**the fleet**. Each member knows **itself**.

| piece | home | knows about |
|---|---|---|
| capture (merge + SessionEnd + the executor's explicit call) | `grow_with_claudinite` pack (canon) | its own session, its own logs branch |
| the task-run record format | `engine/scheduler/run-record.mjs` (core) | the scheduler's own outcomes — no pack, no repo |
| `usage-fold` (daily) | `grow_with_claudinite/tasks/usage-fold/` (canon) | its own logs branch, its own aggregate file |
| `fleet-usage` (daily) | `sheepdog/tasks/fleet-usage/` (canon pack; runs only where sheepdog is declared) | nothing hardcoded — members enumerated at runtime from the sheepdog config (`{ owner, kind, exclude, canonRepo }`) via `fleet-api.mjs`, exactly as `fleet-census` does |
| the fleet aggregate | the fleet-enforcer repo's default branch | — |

No repo list exists in any code, canon or otherwise. The member set is derived
where it already is today for the census and freshness sweeps.

## 2. Sources of truth, and what is derived

- The **transcript** is the source of truth for what happened in a session.
- The **`conversation-logs` branch** is a byte-faithful (scrubbed) window onto
  transcripts, retained `retention_days` (§3).
- The **scheduler's Actions log** is the source of truth for what each run did
  with each due task, by an owned contract rather than by scraping (§4.2).
- The **per-repo aggregate** is derived: capture-derived day rows are a pure
  function of the live logs; task rows are appended once past their own run
  watermark; week rows are append-once sums of closed day rows (§5).
- The **fleet aggregate** is derived: a pure function of the current member
  files, fully recomputed each run (§6). Never store what you can derive —
  the fleet file keeps full (week × repo × skill) grain precisely so every
  coarser view remains derivable from it.

Both aggregate files are `GENERATED`-named and machine-written only, under the
canon's GENERATED-file discipline (regenerated, never hand-edited).

## 3. Capture — three events, one idempotent mechanism

### 3.1 The delta contract (existing, now pinned by tests)

`capture-log.mjs` keys on the **session id**: every capture refetches the
branch tip, finds all prior `*--<sessionId>.jsonl` files (whatever event or
issue produced them), takes the max entry timestamp across them, and pushes
only the entries strictly after it. Zero delta ⇒ no file, no commit, no push.
This makes double-writing safe **by construction** — any two capture events for
one session chain into disjoint files — and it is the property the SessionEnd
hook (§3.3) relies on, so it is pinned by dedicated tests (repeat capture of an
unchanged transcript produces nothing; a post-merge tail produces exactly the
tail).

One file therefore maps 1:1 to a **capture event**, not to a merge.

### 3.2 No-issue captures: `issue-0`

The filename stays `<stamp>--issue-<n>--<session>.jsonl`, with **`0` meaning
"no associated issue"**. The filename regex, the retention prune, and the
scheduler's `conversationLogs` signal already accept `0` — only the CLI's
argument validation refuses it, and that is the whole change. Keeping the
filename shape identical is deliberate: any *new* shape would be invisible to
the prune and become immortal. The extract's conversation half treats an
`issue-0` file as having no issue to post its exchange summary on; everything
else about its two-pass lifecycle is unchanged.

### 3.3 The SessionEnd hook — best effort, fail-soft

A `SessionEnd` hook (`engine/hooks/session-end-command.mjs`, registered in the
consumer's `.claude/settings.json` like its siblings) runs capture with
`--issue 0`. Properties:

- **SessionEnd, not Stop.** Stop fires at every turn end (and already runs the
  conformance checks); capturing there would push to the orphan branch once per
  turn and shred the branch into per-turn files. SessionEnd fires once.
- **Best effort, and that is enough.** A container reclaimed by timeout never
  fires it. Every firing strictly enriches the record (non-merging sessions,
  and the post-merge tail of merging ones); every miss leaves exactly today's
  behaviour. No correctness anywhere depends on the hook having fired.
- **Fail-soft.** It swallows every error, logs the attempt via `hooklog`, and
  must never block a session from ending. Absent `grow_with_claudinite` in the
  repo's declared packs, it exits without acting.
- Scrubbing is the existing capture scrub, unchanged — the hook adds a capture
  *event*, not a new write path.

### 3.4 The unattended sessions — capture where no hook fires

The two events above cover the sessions a **human** is in. They covered none of
the sessions a human is not: a scheduled task's executor session runs a dispatch
in a cloud container, never merges through `merge-to-main` (its task delivers by
opening a PR, or by converging its issue), and ends by having that container
reclaimed — which is exactly the ending that fires no `SessionEnd`. Measured on
the canon repo the day this was written: **47 capture files, not one of them from
an executor session**, while the scheduler had dispatched hundreds. Every skill
those runs loaded and every check that caught something in them was invisible.

The fix is not a third capture path but the **same** step, invoked deliberately
instead of waited for. `session-end-command.mjs` is a runner, not a hook body: it
invokes every active pack's `session-end.mjs`, discovering them structurally. So
the executor's last step (`executor.md` step 5, after its issue is converged)
runs that runner itself:

```bash
CLAUDINITE_SESSION_ISSUE=<issue> node <engine>/hooks/session-end-command.mjs
```

- **`CLAUDINITE_SESSION_ISSUE`** is the runner's documented pass-through: *the
  issue this session was about, when its launcher knew one*. A hook firing never
  does (nothing tells `SessionEnd` what the session was for), so it is only ever
  set by an explicit invocation. The capture step uses it in place of `0` — which
  files an unattended run's log under **the dispatch issue whose title names
  `pack/task`**, so the log is attributable to the task that produced it rather
  than landing in the issueless pile.
- **Core still names no pack.** The executor invokes a runner; the runner invokes
  whatever steps the declared packs contribute; a repo that declares no capturing
  pack does nothing at all.
- **Mid-session invocation is safe and lossy in one known way**: the transcript is
  complete only up to that call, so the executor's own final message is not in the
  file. If the hook *does* fire later, its capture is a second event over the same
  session, which §3.1's session-keyed delta already makes safe by construction.
- **It cannot fail the dispatch.** The issue is already converged; a failed
  capture is reported in the session's final message and nothing else.

The one thing this cannot assert in advance is whether a *trigger-started*
session can push to the logs branch at all. Capture pushes over `origin` with
git, not over the MCP GitHub tools the executor is otherwise restricted to; every
existing capture on the branch was pushed from a cloud container of the same
kind, but all of them were owner-started sessions. If a trigger-started one turns
out to lack that credential, the step reports the failure in the session's final
message and the outcome is exactly today's — no capture, nothing worse — and the
task-invocation counts (§4.2) are unaffected, because they never depended on a
session at all.

### 3.5 Ordering constraint

The idempotence tests and the `issue-0` relaxation must be in the canon before
the hook registration reaches any member — an old `conversation-extract` would
try to comment on issue `#0`. Shipping all of §3 in one canon PR satisfies
this; the baselining task refreshes a member's mount before applying migration
notes, so a member can never run the hook against a stale capture script.

## 4. Counting — one tested function per question

All counting happens in the fold worker (§5), in exported, individually tested
functions. The capture path computes nothing.

- **`skillLoads`** (per skill name): `Skill` tool_use entries, plus user-typed
  `/command` entries whose name matches a skill mounted in this repo (the
  mounted set comes from the pack registry — `loadPacks()` — not from the
  gitignored `.claude/skills/` mounts). Built-in CLI commands (`/model`,
  `/clear`, …) never match. Sidechain (subagent) streams are included — a
  subagent loading a skill is a load.
- **`captures`**: files folded (capture events). **`merges`**: the subset with
  issue > 0. Once the SessionEnd hook exists, these differ — the split exists
  from day one so no consumer ever reads an ambiguous column.
- **`sessions`**: distinct session ids among the bucket's captures (one
  session can capture more than once).
- **`userMessages`**: genuine human turns — user-role entries that are neither
  tool results nor scheduled-task/automated firings (the transcript marks
  these). This heuristic is the most fragile line in the design, so it lives
  in one function with fixtures for each entry shape it excludes.
- **`userCommands`**: user-typed `/command` entries, all of them — the
  cleanest "explicit asks" workload measure.

Stated overlap: a typed `/merge-to-main` counts in both `userCommands` and
`skillLoads` — one event, two axes, both true.

### 4.1 Check activations — and, above all, check *failures*

Skills are half the picture. The conformance checks are the other half, and the
more valuable half: a check that **fails is a win**. The finding lands back in
the session through the Stop hook and the agent corrects before the work
leaves the branch — so "how often did the checks catch something" is a direct
measure of what the corpus is worth, and "which rule caught it" is the most
actionable number in the whole pipeline.

Neither runner writes a metrics file, so both are counted off the marks they
already leave in the transcript. There are exactly three, each verified against
real captured logs rather than inferred:

1. **The Stop hook's `hooklog` line** — `<iso> run=<id> Stop: done exit=<n>
   <reason>`. It reaches the transcript because `hooklog` mirrors to stderr and
   the harness records hook stderr (as an `isMeta` feedback turn, a
   `stop_hook_summary`, or a `hook_success` attachment). This is the **only**
   mark a *passing* run leaves, which is what makes work-scope run counts — not
   merely failure counts — possible at all. Its `reason` distinguishes the four
   outcomes the hook itself declares: `checks-passed`, `blocking-findings`,
   `loop-guard-relent` (blocking findings that survived two fix attempts — a
   failure that prints no findings block, readable *only* here), and
   `runner-error` (the checks did not run, an anti-win that would otherwise
   masquerade as a quiet clean day).
2. **`report-findings`' summary line** — `N blocking, M advisory (<scope>
   scope: …)`. It names its own scope and survives the `| tail` an agent
   usually pipes a run through. It is printed *only* when there were findings,
   so it counts failures and finding volume — never runs.
3. **The runner's invocation in a Bash command** (`node …/check_the_world.mjs`).
   This is how the world scope runs at all: its Stop-hook sibling does not
   exist, because the world sweep is wired into the test/CI flow rather than
   the hook (`engine/checks/README.md`, "Enforcement wiring").

**CI counts when the agent was in the loop on it.** Write, commit, let CI run,
fix what it caught is the same correction loop as the Stop hook's, one turn
wider, so a CI check failure the session acted on is the same kind of win. It
is counted exactly when the session **pulled the job log in** — which is what
"the agent was in the loop" means operationally, and it draws the line the
owner asked for: a nightly or post-merge run nobody looked at stays uncounted,
correctly, because nothing was corrected. Two things follow, and both are
mechanism, not policy:

- CI logs arrive through a CI-log tool rather than Bash (matched by name shape
  — `job_logs` / `run_logs` / `workflow_logs` — so a different MCP server or a
  rename still lands), and every line carries the Actions timestamp in front of
  the command's own output, so each mark tolerates that prefix. Without it a
  fetched CI log reads as having printed nothing.
- A job log can be fetched repeatedly while iterating on the failure, and
  nothing in a fetch says *which run* it was. So CI texts dedupe on the check
  output itself: two fetches of one job are identical and collapse; two real
  runs differ by their Actions timestamps at least. Two genuinely identical
  runs collapse too — an under-count, the direction this counter is allowed to
  be wrong in.

From those, per bucket:

- **`checks`**, keyed by scope (`work` / `world`): `runs` — observed
  activations; `failures` — the subset that reported at least one blocking
  finding; `errors` — runs where the runner could not launch; `blocking` /
  `advisory` — finding *volume* summed over those runs. A rule blocking in two
  consecutive runs counts twice: the question is how often the checks caught
  something, not how many distinct problems existed. Plus `ciRuns` /
  `ciFailures`, the **subset** of those that came from a fetched CI log —
  carried separately because that source can only see a run that printed
  something (a green CI sweep prints nothing and is invisible), so a consumer
  wanting a rate over runs it can see the whole of subtracts them, while one
  asking "how often did the checks catch something" uses the totals.
- **`checkFindings`**, keyed by rule id, `{ blocking, advisory }` — read off
  each rendered `[BLOCKING] <rule>  <file>` header. Lossier than the summary
  totals (a run piped through `tail -3` keeps the summary and drops the
  headers), which is why both are kept: a gap between them *is* the truncation,
  visible rather than assumed away.

Runs are counted only from the marks a passing run also leaves — hook
completion lines, and Bash invocations — never from the summary line. Where a
runner ran without its command naming it (a `make test` step wrapping it), the
summary lines in its output are the floor: the count is the **max** of the two
signals, never their sum, because they are two views of the same runs.

Two things keep this honest and must stay stated wherever the numbers are read:

- **Only Bash and CI-log tool results count**, paired back to their `tool_use`.
  In the corpus that owns the runners, reading a file that merely *contains*
  this vocabulary is the ordinary case, not a corner one.
- **These are floors, never over-counts.** A sweep whose CI log nobody fetched
  left no mark in any transcript. A hook killed before it logged left none
  either. A green CI run prints nothing to be seen by. The bias is
  one-directional by construction, which is the direction that keeps "the
  checks caught N things this week" a claim worth making.

One hook execution is recorded under two entry shapes (the feedback turn the
model sees, and the harness's `stop_hook_summary` repeating the same stderr).
They dedupe on the `hooklog` stamps the text carries — the one identity stable
across both shapes and unique per execution. Counting both would double every
failure, which is precisely the number that must not be inflated.

Zeros are implicit everywhere: a mounted skill with no loads simply has no
key. Consumers derive the zero set by diffing against the repo's mounted
skills (pack registry for a member; for the fleet view, each member's declared
packs), which is what makes "never loads" visible at all.

### 4.2 Task invocations — what the scheduler did, from the scheduler's own log

Skill loads and check failures are both read out of *sessions*. A whole half of
what a repo does never opens a session at all: a precondition that says "nothing
to do", an `agent_model: none` task whose deterministic pass is the entire task,
a dispatch suppressed because an earlier one is still open. None of those leave a
transcript, and the first of them is the single most common thing the scheduler
does. So "how much agent work did this task actually cause" and "is this task
doing anything at all" were unanswerable from the capture pipeline by
construction — not under-counted, absent.

**Source: the scheduler's own Actions log, by contract rather than by scraping.**
Each run prints one machine-readable record per evaluated task —
`claudinite-task-run v1 <pack>/<task> [<slot>] <outcome>` — emitted **after** the
action loop, so it states what happened rather than what was planned. Renderer
and parser live in one module (`engine/scheduler/run-record.mjs`) with a
round-trip test, because a format written in one place and re-guessed in another
is precisely the drift this corpus bans. The human job-summary line is
deliberately *not* the source: it is written before the actions run, so an
agentful task whose preprocessing then requested no agent still reads there as
its dispatch decision.

**Why a log line and not a file.** The scheduler is stateless by design — its
only watermark is the Actions run ledger — and a per-run write to a tracked
branch would be 24 commits a day of data the run already emits. Writing them to
the `conversation-logs` branch was considered and rejected for a second reason:
that branch's retention prune is *filename-shaped*, so a new shape on it would be
invisible to the prune and become immortal (§3.2).

**The five outcomes**, one counter each, keyed by `pack/task`:

| outcome | means |
|---|---|
| `agent` | a dispatch issue was filed — an executor session ran this task with an agent |
| `preprocess` | the task ran with no agent: `agent_model: none`, or an agentful task whose preprocessing requested no agent stage |
| `skipped` | due, but its precondition said there was nothing to do |
| `failed` | its preprocessing failed; the run converged it to a needs-human issue |
| `deferred` | due and past its precondition, but no new agent run started (this slot was already dispatched, or an earlier dispatch is still open) |

`failed` and `deferred` are not decoration. Folding `failed` into `preprocess`
would make a task that fails every night identical to one that works every night;
folding `deferred` into `agent` would report executions that never happened, and
into `skipped` would hide a task whose dispatches are piling up unrun.

**Forward-only, past a `runsFoldedThrough` watermark** — the one place the day
tier departs from "recomputed from scratch every run" (§5), and the reason is the
source rather than taste. The capture files are a local git branch the fold
re-reads for free; the run logs are a paged REST resource at two calls per run,
where re-reading a 10-day window nightly would cost ~20× the API calls for an
identical answer. So each fold reads only the completed runs newer than the
watermark, and the watermark is the whole exactly-once mechanism. It advances
past an idle run too — a quiet hour legitimately prints no records, and re-reading
it forever is the one way this stays expensive. The trade is the same one the
week rows already make and is stated the same way: **a counting bug fixed later
applies from the fix forward, it does not heal history.** A per-fold cap
(240 runs, ~10 days of catch-up) bounds a backlog, advances the watermark only
through what it actually read, and *logs the remainder* rather than truncating
silently.

**These rows are a census, not a sample** — and that is the sharpest difference
between them and everything else in the file. Every scheduler run records every
due task, whether or not a session was ever captured. The distinction is stated
in the fleet file's own `_note`, because a consumer reading task counts beside
skill counts would otherwise apply the sampling caveat to both.

**Fail-soft and independent.** An unreadable ledger costs the task rows for that
run and nothing else; the watermark stays put, so the next fold retries exactly
those runs.

### 4.3 Executor execution statuses — as built (owner, 2026-08-06)

§4.2 counts what the SCHEDULER did; nothing counted what the EXECUTOR SESSION
then did with a dispatch — ran it to success, failed it to `needs-human`, or
closed it because the repo no longer carries the task. Those statuses are now
distilled **from the conversation logs**, deterministically: executor-side code
prints one `claudinite-task-exec v1 <pack>/<task> [<slot>] <status>` record per
terminal state (`success` / `failed` printed via `record-exec.mjs` at
convergence; `task-gone` / `invalid` printed by `resolve-dispatch.mjs` itself),
the record rides the captured transcript to the logs branch (§3.4), and the fold
counts it into `taskExec` rows (per `pack/task`, per status), deduped on the
full record tuple within a capture file so an echoed line never double-counts.
Renderer and parser live in `run-record.mjs` beside the §4.2 vocabulary — same
single-home rule. These rows are a SAMPLE (captured executor sessions only),
and sit beside the §4.2 census; the two populations stay distinct keys.

## 5. The per-repo aggregate — `.claudinite/local/usage.GENERATED.json`

Written by **`usage-fold`**: an agentless daily task of `grow_with_claudinite`
(deterministic preprocessing, no agent, cheapest possible run), outcome
`merged-pr` — the worker opens a PR with the regenerated file and arms
auto-merge; a byte-identical recompute opens nothing. It lives under
`.claudinite/local/` because that is the repo-owned area the vendoring refresh
never touches — the mount root itself is read-only canon.

Two tiers, per the owner's fast-insight requirement:

- **Days** (short term): keyed by the capture filename's UTC date. A file's
  stamp is its push moment, so day *D* gains files only during *D* and is
  immutable once *D* ends. While a day is inside the raw retention window, the
  fold recomputes it **from scratch from the live files, every run** — no
  ingest ledger, no double-count risk, and a counting-bug fix self-heals the
  whole visible window on its next run. Day rows older than the window drop
  out of the file (their content lives on in their week row).
- **Weeks** (long term): ISO-8601 weeks, append-once via a single
  **`foldedThrough` watermark**. Each run, every completed day *d* with
  `foldedThrough < d < today` is added into its week and the mark advances.
  Days close strictly in order, so a monotone mark is the entire exactly-once
  mechanism. Days fold at day+1 — long before their raw files die — so the
  pipeline tolerates ~`retention_days − 1` consecutive days of task outage
  before losing anything; past that, the loss is **visible, never silent**:
  each week row records how many days it absorbed (`days: 5` declares its own
  hole).

The task-invocation rows (§4.2) ride in the same two tiers and fold into weeks
identically, but reach the day tier by the other mechanism: appended once past
`runsFoldedThrough`, on top of what earlier folds counted, rather than
recomputed. They are accumulated **before** the week fold, so a day that closes
carries its scheduler counts into its week in the same pass that freezes it. Two
consequences worth stating rather than discovering: a day with scheduler activity
and no captures still gets a day row (a repo whose sessions are all unattended
would otherwise show nothing at all), and those rows leave the day tier on their
own 14-day window rather than the raw retention window, because nothing about
them ages out when a capture file does.

The fold's precondition is therefore no longer "there is a `conversation-logs`
branch": it has two sources, and the second exists in any repo that has a
scheduler. A repo that has never captured folds its task rows and nothing else.

```json
{
  "version": 2,
  "foldedThrough": "2026-07-26",
  "runsFoldedThrough": "2026-07-28T22:44:00Z",
  "fields": {
    "day": ["captures","merges","sessions","userMessages","userCommands"],
    "week": ["days","captures","merges","sessionDays","userMessages","userCommands"],
    "checks": ["runs","failures","errors","blocking","advisory","ciRuns","ciFailures"],
    "checkFindings": ["blocking","advisory"],
    "tasks": ["agent","code_work","skipped","failed","deferred"],
    "taskExec": ["success","failed","task-gone","invalid"]
  },
  "days": {
    "2026-07-28": {"totals":[3,2,2,31,4],"skillLoads":{"merge-to-main":1},"checks":{"work":[34,12,0,15,0,0,0],"world":[42,3,0,5,131,1,1]},"checkFindings":{"task-lifecycle":[8,0]},"tasks":{"tidy-repo/tidy-issues":[1,0,23,0,0]}}
  },
  "weeks": {
    "2026-W30": {"totals":[7,11,9,8,210,23],"skillLoads":{"merge-to-main":6},"checks":{"work":[190,51,0,66,3,0,0]},"checkFindings":{"task-lifecycle":[40,0]},"tasks":{"tidy-repo/tidy-issues":[7,0,161,0,0]}}
  }
}
```

### The shape, and why it is that shape

Every counter row is a positional **tuple** whose field order the file declares
once, in its own `fields` header, and the file is written **one line per row**.
Fully spelling each row cost ~120 bytes to carry seven numbers, once per day per
scope per rule per task, and `JSON.stringify(…, null, 2)` then spent a line on
each of those numbers; together the two took this repo's own file from 64 KB to
18 KB and made the diff of a regenerated file one line per changed **row**
rather than one per changed number. Each writer emits its own file directly —
there is no shared renderer, because a row on a line is a few lines of code and
the two files have different shapes.

The format lives in the fold's own task folder
(`grow_with_claudinite/tasks/usage-fold/usage-format.mjs`), beside the only code
that writes the file and the only code that reads it back — its own next run.
**The header in the file is what every other consumer reads**, which is why the
vocabulary is declared in the data rather than in a module: §6's fleet sweep
consumes these files across repos and imports nothing to do it.

Three properties are load-bearing, and each is a test:

- **Names stay literal keys** — packs, skills, rules and tasks are never
  dictionary ids. Adding or removing one has to be nothing but key presence, and
  week rows freeze forever, so an id table renumbering under them would rewrite
  history silently.
- **Unknown is not zero.** A tuple slot is `null`, and a short tuple simply
  stops, when the row predates the field — a week frozen before a counter
  existed did not see zero of them, it could not have seen any. Decoding drops
  the key, and the accumulators start that field from the first day that
  actually carries it (the same "a partial series beats a wedged one" trade the
  frozen weeks already make, stated below).
- **Reading is version-tolerant.** Rows expand against the *file's* declared
  vocabulary, not the reader's, and a version-1 file — the original fully-spelled
  objects — decodes as itself, so the fold reads back weeks it froze under
  earlier code with no rollout ordering. A *retired* field is the one thing that
  does not survive: it decodes, and then drops out of the file the next time that
  row is written. **Renaming a counter is therefore a history-losing change** —
  the frozen week rows spelling the old name are rewritten without it — so a
  rename keeps both spellings in the vocabulary, or accepts the loss knowingly.

**There is no migration, and no migration record.** The fold rewrites the whole
file from its decoded prior every run, so a repo carrying the old format is
converted by its next ordinary nightly run — including a run that finds nothing
new to count. Both watermarks come across untouched, so nothing is re-counted
and no closed day is re-folded into a week that already holds it. A repo whose
fold PR from before the upgrade is still open is no different: prior state is
read from the base branch, never from that PR.

Keys are sorted for stable diffs. All counters sum exactly under folding —
except distinct-session counts, which do not (a session spanning two days is
distinct in each). Weeks therefore carry **`sessionDays`** — the sum of the
day-level distinct counts — named for what it is rather than pretending to a
precision folding cannot give.

Frozen weeks are a stated trade, not a surprise: a counting bug found later
heals the day window automatically, but weeks folded under the old counting
keep it — re-freezing would need raw data the retention TTL deliberately
destroyed. Git history records which commit folded what, so the boundary is
auditable. The same trade applies to a *new* counter: weeks folded before the
check counts existed carry no `checks` key, and the fold extends them from the
day they close forward rather than refusing to advance the watermark past them
— a partial series beats a wedged one, and the boundary is visible in the file.

Precondition: none — it runs daily. Runs where nothing changed are no-ops (no
PR), and the agentless run costs seconds.

## 6. The fleet aggregate — `usage-fleet.GENERATED.json`

Written by **`fleet-usage`**: an agentless daily task of the **sheepdog**
pack, alongside `fleet-census` and `fleet-freshness` and shaped exactly like
them — the sweep (`aggregate-fleet-usage.mjs`, inside the task's folder) *is*
the `code_work`, `required_secrets` asks for `FLEET_GITHUB_TOKEN`,
and members are enumerated via `fleet-api.mjs` from the sheepdog config entry.
It runs only where the sheepdog pack is declared — the fleet-enforcer repo.

The aggregation is a **stateless full recompute**: read each member's
`.claudinite/local/usage.GENERATED.json` at its default branch over REST (one
file per member, no clones), and rebuild the fleet file as a pure function of
the inputs. Stateless recompute is idempotent by definition and self-heals any
past error; at this cardinality (~repos × skills × weeks, all small) there is
nothing to optimize.

- **Grain**: full (week × repo × skill, week × repo × **rule**, and week × repo
  × **task**) for history, plus the members' current day windows for the fast view —
  "what happened this week?" at day-grain, trends at week-grain. Nothing
  pre-summed. **Rows are copied, never rewritten**: this sweep re-keys the fleet's
  rows, and each member's file already declares how to read its own, so that
  declaration is carried beside them under `repos[repo]` (`format`, `fields`) and
  a reader decodes each repo's rows with that repo's header. The sweep therefore
  imports no format code at all — which is what keeps two packs from needing a
  shared module, and stops one repo's numbers from being quietly restated in
  another repo's vocabulary. The fleet is permanently mid-upgrade (members
  converge on their own nightly cadence), so per-repo is the honest grain for
  this, not a migration artifact. The checks are carried at the same grain and for the same reason
  as the skill loads: whether a rule earns its place is a fleet-shaped
  question. A rule that never fires in one repo may simply not be that repo's
  subject; a rule that never fires in **any** of them is mis-described or
  worthless — and a rule that keeps firing everywhere is the corpus's
  best-performing guard. Only a view across every member tells those apart.
- **Coverage is explicit**: a member without the usage file (not yet folding)
  or with an unreadable one is listed in a `coverage` section as absent —
  census-style, never silently skipped — so gaps in the denominators are
  visible rather than baked in. A member still on an older fold (no `checks`
  key) lands as a row without one rather than an exception: the sweep leads
  the members' upgrades, so that is the normal state for a while — and a counter
  its rows predate stays absent, never a zero it never measured.
- **A `_note` field** states the sampling population: captured sessions only —
  merging sessions plus sessions that ended cleanly enough for the SessionEnd
  hook. Reclaimed containers and crashes are invisible. The file must not read
  as a census. The note carries the checks' second, narrower boundary too: the
  counts are what a *session* saw, so a world sweep that ran in CI is not in
  them, and every check number is a floor on activations.
- Outcome `merged-pr` (owner decision): the sweep opens a PR on a run-stamped
  branch in the enforcer repo and arms auto-merge. This keeps the write inside
  the outcome taxonomy `verify-outcome.mjs` enforces, lets the enforcer's CI
  gate a malformed file, and makes the daily PR stream a browsable audit trail.
  A byte-identical recompute opens nothing.

## 7. Consumers — who learns from this

- **The owner**, ad hoc: both files are small sorted JSON on tracked branches —
  readable in the GitHub UI, over MCP, or via `git show`, with full history.
- **Canon curation** (the promote run): the empirical feedback the rung-4/5
  routing decision currently lacks, in both directions. Never loads across the
  fleet ⇒ the trigger is mis-described, or the content should not be gated at
  all (rules wearing a skill's clothes); always loads ⇒ likewise not
  activity-scoped. Raw counts alone cannot distinguish healthy-rare from
  broken — a version-bump skill loading rarely is fine — which is why the
  denominators exist: the metric is loads against the sessions where the
  skill's own declared trigger plausibly applied.
- **Canon curation, on the rules** (the same run): the checks' half answers a
  sharper question than the skills' half, because a check failure is an
  observed correction rather than an inferred one. A rule with steady failures
  across the fleet is a guard earning its keep and an argument for converting
  more prose into checks (`prose-to-checks`); a rule that has never fired
  anywhere is either unreachable or describing something that does not happen;
  a rule firing on nearly every run is a *default the corpus should change*
  rather than a violation worth blocking on. `errors` reads differently from
  all three: it means enforcement was silently off, and it is the one number
  here whose right value is zero.
- **The scheduled system itself** (new with §4.2): whether a task earns its slot
  is now answerable. A task that has skipped every run in every member for weeks
  has a precondition that never fires — either its signal is broken or the work
  it waits for does not happen. One with a steady `failed` count is broken
  machinery rather than a bad night. One with a rising `deferred` count is
  dispatching faster than its executor drains. And "how many agent executions did
  this task cause" — the cost question — has a number instead of an impression.
- **Shepherd's fleet tasks**, later: freshness-style drift issues citing the
  fleet file ("skill X: 0 loads fleet-wide in 6 weeks"). The learning loop
  stays in the enforcer's domain, not the canon's. Out of scope here; noted so
  the file's grain is chosen for it (it is).

## 8. TTLs, end to end

| data | where | TTL |
|---|---|---|
| transcript | harness config dir | harness-owned (ephemeral in cloud sessions) |
| raw capture `.jsonl` | `conversation-logs` branch | `retention_days` (unchanged; unset ⇒ capture-only, no prune) |
| scheduler run log | GitHub Actions | platform-owned (90 days by default) |
| day rows (capture-derived) | member usage file | the raw window — then their week row carries them |
| day rows (task invocations) | member usage file | 14 days — then their week row carries them |
| week rows | member usage file | indefinite (~KBs/year; revisit only if a file nears 1 MB) |
| fleet file | enforcer repo | none needed — derived; history is git's |

## 9. Failure modes, stated

- **Fold outage** longer than ~`retention_days − 1` days: unfolded days lose
  their raw backing. The hole is visible (week's `days` count short), never a
  silently wrong number.
- **Hook never fires** (reclaim, crash): the record degrades exactly to
  today's merge-only capture. No consumer breaks. For an *unattended* session
  that is the normal case, which is why its capture is an explicit step rather
  than a hook (§3.4); if that step is skipped or fails, that session is
  invisible exactly as it was before, and its task-invocation record (§4.2) is
  unaffected — the scheduler logged it either way.
- **Scrub boundary** (unchanged from capture's existing statement): a secret
  the session itself transformed is invisible to any static scrub; the branch
  shares the repo's access control and push protection stays the last net.
- **A member goes quiet**: its day window empties, its weeks stop growing, and
  the fleet file shows it with zeros-by-absence plus its last folded week —
  distinguishable from "not folding" via the `coverage` section.
- **A check ran where no session saw it** (a CI run nobody fetched the log for,
  a hook killed before it logged, a green CI sweep that printed nothing): the
  run is simply not counted. This is the one under-count the design accepts by
  construction, and it is one-directional — the numbers are floors, never
  inflated. Stated in the fleet file's own `_note` so a consumer cannot read
  them as a census of enforcement. Detached CI is *deliberately* out: the
  metric is about the correction loop, and a run nobody looked at corrected
  nothing.
- **Fold outage longer than the Actions log retention**: the task records for
  those runs are gone, and the watermark still points before them, so the fold
  reads what survives and the lost runs are simply never counted. Silent in the
  file itself — but the same outage is loud in the week rows' `days` count, and
  the fold would have to be down for ~90 days for it to happen at all.
- **A run's log is unreadable** (a 404, a rate limit): the task rows do not
  advance that run, the watermark stays put, and the next fold retries exactly
  those runs. The skill and check counts are unaffected — the two sources fail
  independently, by design.
- **A counting bug in the task rows**: unlike the capture-derived days, these do
  NOT self-heal, because the fold no longer re-reads the runs behind them. A fix
  applies from the fix forward. This is the price of not re-fetching a
  rate-limited API every night, and it is the same trade the week rows make.
- **The harness changes how it records hooks**: the marks in §4.1 are harness
  output, not a contract Claudinite owns. A shape change makes check counts
  fall to zero — loudly, since a repo with checks wired cannot plausibly report
  no activations — rather than drift quietly wrong. Each mark is read by one
  exported function with a fixture copied from a real capture, so re-pinning is
  a fixture update, not an investigation.

## 10. Decisions on record (owner, 2026-07-28)

1. **Two tiers, days + weeks** — days for insight faster than a week, matched
   to the 10-day raw TTL; weeks as the long-term series, aggregated from days.
2. **Days statelessly recomputed; weeks append-once from days** — the
   watermark replaces any ingest ledger.
3. **Denominators include sessions and user commands**, alongside captures,
   merges, and user messages.
4. **Fleet awareness is the sheepdog domain** — the canon must not know
   specific member repos; the aggregate lands in the fleet-enforcer repo via
   its pack's tasks.
5. **Auto-merged daily PR, not a direct commit**, for the GENERATED aggregate
   writes — into the enforcer repo, and by extension the member fold.
6. **SessionEnd capture is a welcome best-effort bonus**, contingent on
   double-write safety being proven first (§3.1's tests), with `issue-0`
   naming for issueless captures.
7. **No migration plan** — the existing convergence machinery carries the
   rollout; ordering is handled by shipping §3 in one PR (§3.5).

### Owner, 2026-07-29

8. **Check activations and check failures are counted too** (§4.1), at both
   levels — per repo in the fold, and fleet-wide in the sheepdog sweep, exactly
   as the skill loads are. **Failures are the point**: when a check fails the
   agent corrects immediately, so a failure is a win, and every one is counted.
   Executions are counted as far as the transcript allows and the shortfall is
   stated rather than papered over (§9) — the numbers are floors.
9. **Per-rule grain is kept**, not just per-scope totals: "which rule catches
   things" is what the promote run and `prose-to-checks` actually need, and it
   is what the fleet view exists to answer across members.
10. **CI counts when it was part of the agent loop** — write, commit, let CI
    run, fix what it caught — and not otherwise. Operationally: the session
    pulled the job log in. A nightly or post-merge run nobody looked at is
    explicitly *not crucial* and stays uncounted, because nothing was
    corrected. The CI share is carried separately (`ciRuns` / `ciFailures`)
    since that source sees only runs that printed.

### Owner, 2026-07-29 (second round)

11. **Unattended runs must reach the conversation-logs branch** (§3.4). They did
    not: no executor session had ever been captured, because those sessions end
    by container reclaim and merge nothing. Capture becomes an explicit last step
    of the executor routine, filed under its dispatch issue, rather than a hook
    firing nobody can rely on.
12. **The aggregation counts task invocations** (§4.2), per task: agent
    executions first, and beside them the runs that were deterministic
    preprocessing only and the runs whose precondition said no. Read from the
    Actions logs — all task invocation data is already there — which keeps the
    scheduler stateless and needs no new storage anywhere.
13. **`failed` and `deferred` are counted too**, not folded into their
    neighbours: a task that fails every night must not read as one that runs
    quietly, and a dispatch that was never filed must not read as an execution.
14. **These rows are a census, and the file says so** — every scheduler run
    records every due task, unlike the skill and check counts, which see only
    captured sessions. The two populations sit side by side in one file, so the
    difference is stated in the file rather than assumed by the reader.
