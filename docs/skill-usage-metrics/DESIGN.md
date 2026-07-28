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

The shape: session transcripts already record every skill invocation. Capture
already ships transcripts to each repo's orphan `conversation-logs` branch at
merge time. This design (a) enriches capture with a best-effort session-end
event, (b) adds a deterministic daily **fold** in each repo that counts skill
loads and activity denominators from the live logs into a small tracked
aggregate, and (c) adds a **fleet sweep** in the sheepdog pack that recomputes
a fleet-wide aggregate from the members' files into the fleet-enforcer repo.
Every stage is deterministic code — no agent judgment anywhere in the pipeline.

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
                    "skillLoads": { "merge-to-main": 1 } }
  },
  "weeks": {
    "2026-W30": { "days": 7, "captures": 11, "merges": 9, "sessionDays": 8,
                  "userMessages": 210, "userCommands": 23,
                  "skillLoads": { "merge-to-main": 6 } }
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
auditable.

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

- **Grain**: full (week × repo × skill) for history, plus the members' current
  day windows verbatim for the fast view — "what happened this week?" at
  day-grain, trends at week-grain. Nothing pre-summed.
- **Coverage is explicit**: a member without the usage file (not yet folding)
  or with an unreadable one is listed in a `coverage` section as absent —
  census-style, never silently skipped — so gaps in the denominators are
  visible rather than baked in.
- **A `_note` field** states the sampling population: captured sessions only —
  merging sessions plus sessions that ended cleanly enough for the SessionEnd
  hook. Reclaimed containers and crashes are invisible. The file must not read
  as a census.
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
