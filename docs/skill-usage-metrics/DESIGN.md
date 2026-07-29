# Skill-usage metrics — design

Status: **agreed** (owner decisions recorded in §10; design review in the
2026-07-28 session). Refs #520. This document describes the **final state**
only; there is no migration plan — the rollout self-converges through the
existing machinery (the nightly vendored-canon refresh carries the code, a
baselining-applied migration note registers the hook), and the one ordering
constraint (§3.4) is satisfied by shipping the capture changes in one PR.

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

The shape: session transcripts already record every skill invocation, and the
check runners leave readable marks in them too. Capture already ships
transcripts to each repo's orphan `conversation-logs` branch at merge time.
This design (a) enriches capture with a best-effort session-end event, (b) adds
a deterministic daily **fold** in each repo that counts skill loads, check
activations and failures, and activity denominators from the live logs into a
small tracked aggregate, and (c) adds a **fleet sweep** in the sheepdog pack
that recomputes a fleet-wide aggregate from the members' files into the
fleet-enforcer repo. Every stage is deterministic code — no agent judgment
anywhere in the pipeline.

```
transcript ──(merge capture / SessionEnd capture)──▶ conversation-logs branch
    conversation-logs ──(usage-fold, per repo, daily)──▶ .claudinite/local/usage.GENERATED.json
    member usage files ──(fleet-usage, sheepdog, daily)──▶ usage-fleet.GENERATED.json (enforcer repo)
```

---

## 1. Where knowledge lives — the placement rule

The canon knows **mechanisms**, never repos. The fleet-enforcer repo knows
**the fleet**. Each member knows **itself**.

| piece | home | knows about |
|---|---|---|
| capture (merge + SessionEnd) | `grow_with_claudinite` pack (canon) | its own session, its own logs branch |
| `usage-fold` (daily) | `grow_with_claudinite/tasks/usage-fold/` (canon) | its own logs branch, its own aggregate file |
| `fleet-usage` (daily) | `sheepdog/tasks/fleet-usage/` (canon pack; runs only where sheepdog is declared) | nothing hardcoded — members enumerated at runtime from the sheepdog config (`{ owner, kind, exclude, canonRepo }`) via `fleet-api.mjs`, exactly as `fleet-census` does |
| the fleet aggregate | the fleet-enforcer repo's default branch | — |

No repo list exists in any code, canon or otherwise. The member set is derived
where it already is today for the census and freshness sweeps.

## 2. Sources of truth, and what is derived

- The **transcript** is the source of truth for what happened in a session.
- The **`conversation-logs` branch** is a byte-faithful (scrubbed) window onto
  transcripts, retained `retention_days` (§3).
- The **per-repo aggregate** is derived: day rows are a pure function of the
  live logs; week rows are append-once sums of closed day rows (§5).
- The **fleet aggregate** is derived: a pure function of the current member
  files, fully recomputed each run (§6). Never store what you can derive —
  the fleet file keeps full (week × repo × skill) grain precisely so every
  coarser view remains derivable from it.

Both aggregate files are `GENERATED`-named and machine-written only, under the
canon's GENERATED-file discipline (regenerated, never hand-edited).

## 3. Capture — two events, one idempotent mechanism

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
the prune and become immortal. `conversation-extract` treats an `issue-0` file
as having no issue to post its exchange summary on; everything else about its
two-pass lifecycle is unchanged.

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

### 3.4 Ordering constraint

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

From those, per bucket:

- **`checks`**, keyed by scope (`work` / `world`): `runs` — observed
  activations; `failures` — the subset that reported at least one blocking
  finding; `errors` — runs where the runner could not launch; `blocking` /
  `advisory` — finding *volume* summed over those runs. A rule blocking in two
  consecutive runs counts twice: the question is how often the checks caught
  something, not how many distinct problems existed.
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

- **Only Bash tool results count**, paired back to their `tool_use` command. In
  the corpus that owns the runners, reading a file that merely *contains* this
  vocabulary is the ordinary case, not a corner one.
- **These are floors, never over-counts.** A world sweep that ran in CI left no
  mark in any transcript. A hook killed before it logged left none either. The
  bias is one-directional by construction, which is the direction that keeps
  "the checks caught N things this week" a claim worth making.

One hook execution is recorded under two entry shapes (the feedback turn the
model sees, and the harness's `stop_hook_summary` repeating the same stderr).
They dedupe on the `hooklog` stamps the text carries — the one identity stable
across both shapes and unique per execution. Counting both would double every
failure, which is precisely the number that must not be inflated.

Zeros are implicit everywhere: a mounted skill with no loads simply has no
key. Consumers derive the zero set by diffing against the repo's mounted
skills (pack registry for a member; for the fleet view, each member's declared
packs), which is what makes "never loads" visible at all.

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

```json
{
  "version": 1,
  "foldedThrough": "2026-07-26",
  "days": {
    "2026-07-28": { "captures": 3, "merges": 2, "sessions": 2,
                    "userMessages": 31, "userCommands": 4,
                    "skillLoads": { "merge-to-main": 1 },
                    "checks": {
                      "work":  { "runs": 34, "failures": 12, "errors": 0, "blocking": 15, "advisory": 0 },
                      "world": { "runs": 41, "failures": 2, "errors": 0, "blocking": 4, "advisory": 127 }
                    },
                    "checkFindings": { "task-lifecycle": { "blocking": 8, "advisory": 0 } } }
  },
  "weeks": {
    "2026-W30": { "days": 7, "captures": 11, "merges": 9, "sessionDays": 8,
                  "userMessages": 210, "userCommands": 23,
                  "skillLoads": { "merge-to-main": 6 },
                  "checks": { "work": { "runs": 190, "failures": 51, "errors": 0, "blocking": 66, "advisory": 3 } },
                  "checkFindings": { "task-lifecycle": { "blocking": 40, "advisory": 0 } } }
  }
}
```

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

Precondition: the `conversationLogs` signal reports the branch present. Runs
where nothing changed are no-ops (no PR), and the agentless run costs seconds.

## 6. The fleet aggregate — `usage-fleet.GENERATED.json`

Written by **`fleet-usage`**: an agentless daily task of the **sheepdog**
pack, alongside `fleet-census` and `fleet-freshness` and shaped exactly like
them — the sweep (`aggregate-fleet-usage.mjs`, inside the task's folder) *is*
the `agent_preprocessing`, `required_secrets` asks for `FLEET_GITHUB_TOKEN`,
and members are enumerated via `fleet-api.mjs` from the sheepdog config entry.
It runs only where the sheepdog pack is declared — the fleet-enforcer repo.

The aggregation is a **stateless full recompute**: read each member's
`.claudinite/local/usage.GENERATED.json` at its default branch over REST (one
file per member, no clones), and rebuild the fleet file as a pure function of
the inputs. Stateless recompute is idempotent by definition and self-heals any
past error; at this cardinality (~repos × skills × weeks, all small) there is
nothing to optimize.

- **Grain**: full (week × repo × skill, and week × repo × **rule**) for
  history, plus the members' current day windows verbatim for the fast view —
  "what happened this week?" at day-grain, trends at week-grain. Nothing
  pre-summed. The checks are carried at the same grain and for the same reason
  as the skill loads: whether a rule earns its place is a fleet-shaped
  question. A rule that never fires in one repo may simply not be that repo's
  subject; a rule that never fires in **any** of them is mis-described or
  worthless — and a rule that keeps firing everywhere is the corpus's
  best-performing guard. Only a view across every member tells those apart.
- **Coverage is explicit**: a member without the usage file (not yet folding)
  or with an unreadable one is listed in a `coverage` section as absent —
  census-style, never silently skipped — so gaps in the denominators are
  visible rather than baked in. A member still on an older fold (no `checks`
  key) lands as an empty check row rather than an exception: the sweep leads
  the members' upgrades, so that is the normal state for a while.
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
- **Sheepdog's fleet tasks**, later: freshness-style drift issues citing the
  fleet file ("skill X: 0 loads fleet-wide in 6 weeks"). The learning loop
  stays in the enforcer's domain, not the canon's. Out of scope here; noted so
  the file's grain is chosen for it (it is).

## 8. TTLs, end to end

| data | where | TTL |
|---|---|---|
| transcript | harness config dir | harness-owned (ephemeral in cloud sessions) |
| raw capture `.jsonl` | `conversation-logs` branch | `retention_days` (unchanged; unset ⇒ capture-only, no prune) |
| day rows | member usage file | the raw window — then their week row carries them |
| week rows | member usage file | indefinite (~KBs/year; revisit only if a file nears 1 MB) |
| fleet file | enforcer repo | none needed — derived; history is git's |

## 9. Failure modes, stated

- **Fold outage** longer than ~`retention_days − 1` days: unfolded days lose
  their raw backing. The hole is visible (week's `days` count short), never a
  silently wrong number.
- **Hook never fires** (reclaim, crash): the record degrades exactly to
  today's merge-only capture. No consumer breaks.
- **Scrub boundary** (unchanged from capture's existing statement): a secret
  the session itself transformed is invisible to any static scrub; the branch
  shares the repo's access control and push protection stays the last net.
- **A member goes quiet**: its day window empties, its weeks stop growing, and
  the fleet file shows it with zeros-by-absence plus its last folded week —
  distinguishable from "not folding" via the `coverage` section.
- **A check ran where no session saw it** (world sweep in CI, hook killed
  before it logged): the run is simply not counted. This is the one under-count
  the design accepts by construction, and it is one-directional — the numbers
  are floors, never inflated. Stated in the fleet file's own `_note` so a
  consumer cannot read them as a census of enforcement.
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
   rollout; ordering is handled by shipping §3 in one PR (§3.4).

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
