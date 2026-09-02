# Data sources — what every figure reads, and the fields the fold gains

The specification a fold or page implementer works from. The fold's contract — three tiers,
tuples against a `fields` header, *unknown is not zero*, append-once past a watermark — is
[the usage-fold README](../../claudinite-tasks/tasks/usage-fold/README.md) and its shape
module [`usage-format.mjs`](../../claudinite-tasks/tasks/usage-fold/usage-format.mjs); nothing
here changes those rules, it adds fields under them. Page readers are named by file.

## 1. Every figure → its source

*Live* is a read the page already makes (ETag-revalidated, free on a 304); *fold* is the
member's `usage.GENERATED.json` at head sha; *declaration* is the task file at head sha;
*config* is the deployment's `dashboard.config.json`. A figure with two sources takes the live
one for the days it reaches and the fold for the rest, as `queueSeries` and `hourSeries` in
[`usage.mjs`](../usage.mjs) already do.

| Figure | Page | Source | Reader |
|---|---|---|---|
| Start here candidate, minutes, *N more* | both | live issues page, member summaries | `next-work.mjs`, `fleet.mjs` |
| Scheduler heartbeat (per member / per hour) | both | fold `hours[h].scheduler`; live runs for hours past `runsFoldedThrough` | `hourSeries` |
| Executor failed / total, 24 h; in flight | both | fold `hours[h].executor`, `failed`; live runs `status` | `hourSeries`, `ciStatus` |
| CI on main | repo | live runs | `ciStatus` |
| Fold age, members folding | both | fold `generated` | `readUsage` |
| Drift | both | declaration stamp vs `canonRepo` | `mountState` |
| Next wake, 24 h strip | both | declaration anchors, `nextAsk.at` per roster row | `buildRoster`; page bucketing (§3) |
| Merged PRs; nobody in the loop | both | live issues page with merged PRs kept (§3); fold `prs` | `projectPull` (§3) |
| Caught before merge | both | fold `checks.work` (`failures`, `ciFailures`, `runs`, `errors`) | `growthSeries` |
| Releases | both | fold `releases` | day rows |
| Lines, net | both | fold `linesAdded`, `linesRemoved` (§2, lines) | day rows |
| Queue closes by outcome | repo | fold `queue`; today live | `queueSeries` |
| Tokens in / out; sessions recorded | both | fold `tokensIn`, `tokensOut`, `tokenSessions`, `sessions` | day rows |
| ≈ Dollars, unpriced share, top-model share | both | fold `tokensByModel` (§2) × config `rates` (§3) | page pricing |
| Your minutes; your turns | both | fold `humanSeconds` (§2), `userMessages` | day rows |
| Rule tokens per session | both | fold `ruleTokens ÷ ruleTokenSessions` | `growthSeries` |
| Rule tokens, fleet mean | repo | every member's fold (fleet deployment only) | `fleet-growth.mjs` (§3) |
| Heaviest rule source | repo | fold `ruleTokensByPack` (§2) | day rows |
| Issue → merged p50 / p90 | both | live PRs `closesIssue` (§3); fold `prs.issueLeadHours` (§2) | page reduction |
| Session → merged p50 / p90 | both | fold `prs.sessionToMergeHours` (§2) | page reduction |
| PR opened → merged | expand | fold `prs.leadHours` (§2) | page reduction |
| Merged / closes per day; peak; days with none | both | as merged / queue closes | day rows |
| Stuck 3 d+, parked for you / on the machine | both | live issues page, `idleMs`, `troubles` | `work.mjs` |
| Cost per merged PR; tokens per merged PR | both | quotients of the above | page |
| Autonomy; yours : agent minutes | both | quotients; fold `humanSeconds`, `agentSeconds` (§2) | page |
| Would have shipped broken; top rule | both | fold `checks.work.failures`, `checkFindings` | `growthSeries` |
| Per-member expand | fleet | the above, per member | `fleet-growth.mjs` |
| Per-task expand: closed, sessions, tokens, $, exec failed, parked, model | repo | fold `queue`, `taskCost` (§2), `taskExec`, `parks` (§2); declaration `agent_model` | day rows, `parseDeclaration` |
| Pulse | both | fold `sessions` per day | day rows |
| Board: kinds, edges, times, landing, run record | repo | live issues and PRs (labels, body lines, timestamps, comments); declarations; the schedule board | `work.mjs`, `model.mjs` |
| Board: scheduled cells | repo | closed items since the window opened (`outcomeOf`, `closed_at`); the schedule board's verdicts; `nextAnchor` | `work.mjs` |
| Board: cost per run in the task panel | repo | fold `taskCost` | day rows |
| Corpus panel: per-rule table, last fired | repo | fold `checkFindings`, `checks.work.runs` | `growthSeries` |

## 2. New fold fields

Each field follows the file's own rules: a tuple whose order the `fields` header declares
(or a sub-map keyed by a literal name carrying such a tuple), `null` for a slot the row
predates, **no key where the source is absent**, and a week row grown from the first day that
carried the field. Every field below is a day-row field folded into the week row by the sum
of the days that knew, unless it says otherwise. None lives in the hour tier.

The page's reading rule before a field exists is the same everywhere and stated once: a
missing key reads *not recorded — this fold predates `<field>`*, which is a different state
from *unpriced* (a rate missing) and from 0.

### `tokensByModel`

- **Home.** Day and week rows; a counter group (joins `COUNTER_GROUPS`) keyed by the model
  id, vocabulary `fields.tokensByModel = ["input", "cacheRead", "cacheCreate", "output"]`.
- **Shape.** `"tokensByModel": { "claude-opus-4-1": [input, cacheRead, cacheCreate, output] }`.
- **Extraction.** The same loop as `tokensIn` in
  [`fold-usage.mjs`](../../claudinite-tasks/tasks/usage-fold/fold-usage.mjs): for each
  assistant entry carrying `message.usage`, key on `entry.message.model`; an entry with usage
  and no model id keys as `"(unknown)"`. The four usage counters are kept apart here — the
  existing `tokensIn` stays the sum of the first three, so every reader of the totals keeps
  working and the per-model split is the only new thing.
- **Dedup.** Per session per day, exactly as `tokensIn`: a session that captured twice on one
  day is counted once, from its latest capture.
- **Watermark.** None — day rows recompute from the capture files every fold.
- **Absence.** A day whose transcripts carried no usage records has no `tokensByModel` key,
  as it has no `tokensIn`; a week absorbs only the days that knew.
- **Before it exists.** The ≈ $ figure reads *not recorded*; the token figures are unaffected.

### `humanSeconds`, `agentSeconds`

- **Home.** Two scalars appended to the `day` and `week` vocabularies. The per-turn cap is
  stated in the file header as `"caps": { "humanSeconds": 600 }`, beside `fields`, so a reader
  never guesses it; a file without `caps` was written before the field.
- **Extraction.** Per session, over the main stream's entries in timestamp order:
  `humanSeconds += min(600, ts(human turn) − ts(previous entry))` for every entry
  `isUserMessage` accepts (a genuine human turn — never a tool result, a sidechain or a
  compaction summary); `agentSeconds += ts(assistant entry) − ts(previous entry)` for every
  assistant entry. Sidechain (subagent) entries are excluded from both: a subagent runs inside
  a main-stream turn whose span is already counted.
- **The cap.** An overnight gap before a human turn is not the person's time; 10 minutes is
  the bound above which a gap is a break, and the cap is what makes the figure a floor.
- **Dedup.** Per session per day, as tokens.
- **Watermark.** None.
- **Absence.** A transcript shape whose entries carry no `timestamp` yields `null` for the
  session, and a day with no session that knew has no key. Never 0.
- **Before it exists.** *Your minutes* and *yours : agent minutes* read *not recorded*; *your
  turns* (`userMessages`) is unaffected.

### `prs`

- **Home.** Day and week rows; a counter group keyed by PR number, vocabulary
  `fields.prs = ["leadHours", "issueLeadHours", "sessionToMergeHours"]`, filed under the day of
  `merged_at`.
- **Shape.** `"prs": { "1583": [14.2, 38.5, 0.7] }` — hours, one decimal. `merged` is the key
  count; **p50 and p90 are the reader's reduction** over the union of the window's rows. A
  percentile does not fold: a week's p50 is not derivable from its days' p50s, so the fold
  carries the durations and the page computes the quantiles over whatever window it shows.
- **Extraction.** A sibling of the queue read
  ([`read-queue.mjs`](../../claudinite-tasks/tasks/usage-fold/read-queue.mjs)): list closed PRs (`/pulls?state=closed&sort=updated&direction=desc`) and keep those with
  `merged_at` past the watermark. `leadHours = merged_at − created_at`.
  `issueLeadHours = merged_at − issue.created_at` for the issue named by the first
  `Closes|Fixes|Resolves #n` line in the body — one narrow issue read per merged PR that
  names one; `null` where none does. `sessionToMergeHours = merged_at − first timestamp` of
  the capture file whose name carries that issue number (what `merges` already counts);
  `null` where no capture names it.
- **Dedup and watermark.** Append-once past `prsFoldedThrough`, a fourth watermark beside
  the three the file carries, bounded on `merged_at` for the same reason the queue read is
  bounded on `closed_at`: a merge is settled and never moves. The first read looks back the
  day tier's width (`FIRST_READ_LOOKBACK_DAYS`).
- **Absence.** A listing that cannot be read costs this fold's `prs` rows and leaves the
  watermark where it was; a slot is `null` where its end is unknown.
- **Before it exists.** Lead times read *not recorded* beyond the days the live listing
  reaches; merged PRs count from the live listing alone.

### `taskCost`

- **Home.** Day and week rows; a counter group keyed by `pack/task`, vocabulary
  `fields.taskCost = ["sessions", "tokensIn", "tokensOut", "userMessages"]`.
- **Extraction.** In the capture loop that sums tokens per session, key each session by the
  task its `claudinite-task-exec` record names — the same record `taskExec` is counted from,
  so the join is local and free. A session whose file name carries no issue number keys as
  `"(none)"` — a session a person started — and is kept, so the human-driven share is
  visible. A session with an issue number and no exec record keys as `"(unresolved)"`, never
  silently as `"(none)"`.
- **Dedup, watermark, absence.** As tokens: per session per day, recomputed, no key on a
  day with no session that knew.
- **Before it exists.** The per-task expand's cost columns read *not recorded*; the task
  panel's *cost per run* likewise.

### `parks`

- **Home.** Day and week rows; a counter group keyed by `pack/task`, vocabulary
  `fields.parks = PARK_KINDS` — the four `task:status:needs-human-<kind>` kinds,
  imported from the label vocabulary rather than re-spelled, so a counter key cannot
  drift from the label a park actually wears.
- **Extraction.** In the queue read, for each item that closed past `queueFoldedThrough`,
  one `GET /issues/{n}/events` listing; count each `labeled` event whose label is a
  `needs-human-<kind>` **once per item per kind**, filed under the item's `closed_at` day
  beside its `queue` outcome.
- **Dedup and watermark.** Append-once with the queue read, under the same mark: an item is
  read on the one fold that first sees it closed.
- **Absence.** An events listing that fails leaves that item's parks unknown — no key for it
  — and does not cost the item's `queue` row.
- **Before it exists.** The per-task expand's *parked* column reads *not recorded*.

### `ruleTokensByPack`

- **Home.** Day rows only; a sub-map of bare numbers keyed by pack id, like `skillLoads`,
  no vocabulary needed.
- **Extraction.** The session-start summary line
  ([`session-summary.mjs`](../../../engine/pack_loader/session-summary.mjs)) prints one rule-token
  total and **no per-pack split**; the split is a new facet on that line —
  `rule tokens by pack: basics 4200 · claudinite 5200 · …` — printed beside the total, and
  `ruleTokensIn`'s sibling parses it. No thousands separators, unlike the total beside
  it: the facets are joined into one comma-separated line, so a comma has to stay the
  segment's own terminator for the parse to know where the split ends. Counted once per session, on the first match, as the
  total is.
- **Absence.** A session whose line lacks the facet contributes nothing to the map; a day
  with no such session has no key. The total `ruleTokens` is unaffected.
- **Before it exists.** The *heaviest source* sub-line is omitted; the per-session figure
  stands.

### Lines (`commits`, `linesAdded`, `linesRemoved`)

- **Home.** Existing day and week scalars; nothing in the shape changes.
- **Extraction.** `commitSeries` in the worker already reads `git log --numstat` and records
  where a shallow history starts. The change is in the worker's checkout: before reading,
  `git fetch --shallow-since=<window start>` on the default branch, so the history covers
  the day tier's window and every day in it carries a count. `coveredFrom` keeps saying where
  the history actually starts, so a fetch that could not deepen still leaves no key rather
  than a zero.
- **Alternative.** Reading line counts from the commits API costs one read per commit for
  its stats, unbounded on a busy day; the deepen is one git operation on the executor's
  checkout and no REST at all.
- **Before it exists.** *lines, net* reads *not recorded — shallow checkout*.

## 3. Page-side changes

### `projectPull` keeps merged PRs

[`cache.mjs`](../cache.mjs) projects PRs from the issues listing and today keeps only open
ones, with the body dropped. The projection keeps a **closed PR with `merged_at` inside the
page's window** (14 days) and adds two fields: `merged_at` — which the issues endpoint
carries inside each PR's own stub, so the merged set costs no request of its own — and
`closesIssue`, the number named by the first `Closes|Fixes|Resolves #n` line, parsed from
the body **before** it is dropped, by the fold's own rule rather than a second one: that
parse is published as `shared-code/pull-requests.mjs` precisely so the two halves of one
lead-time series cannot disagree about which issue a PR is for. The body still stores
nothing. Merged PRs outside the window are dropped as they
are now, which is what keeps a fleet's history inside the storage quota.

### Heartbeat from the fold

The runs listing is one page of `RUNS_PER_PAGE` runs across every workflow the repo has —
the scheduler, the executor and the repo's own CI. On a busy member that page covers a few
hours; a member whose last scheduler run is older than the page is indistinguishable from one
that never ran, and the "never ran" state is exactly the critical verdict. The fold's hour
tier carries three days of per-hour scheduler counts, appended past `runsFoldedThrough` from
a listing the fold pages properly. So the heartbeat reads `hours[h].scheduler` from the
fold, and the live page tops up the hours past the watermark — the merge `hourSeries` in
[`usage.mjs`](../usage.mjs) already performs. A member with no fold reads its heartbeat from
the live page alone and says so.

### Fleet mean of rule tokens per session

[`fleet-growth.mjs`](../fleet-growth.mjs) already reads every member's fold at head sha for
the fleet's corpus panels; the mean of `ruleTokens ÷ ruleTokenSessions` over folding
members for the same window is one more reduction there, handed to the repo page when the
deployment is a fleet. A repo-mode deployment has no members to average and reads *fleet:
not read*.

### Next anchors bucketed by hour

`buildRoster` in [`model.mjs`](../model.mjs) computes `nextAsk.at` per task for the roster's
next-anchor column. The wake strip collects those (fleet: across members) and buckets them by
UTC hour over the next 24 h; a `held` next ask is a critical tick at *now*.

### The `rates` config

The per-model rate table lives in `.claudinite-settings.json`, under this pack's declaration
`config`, key `rates`:

```jsonc
{ "id": "claudinite-dashboard",
  "config": { "rates": { "claude-opus-4-1": { "in": 15, "cacheRead": 1.5, "out": 75 } } } }
```

USD per million tokens. `build-site.mjs` carries it into `dashboard.config.json` as it does
every other key. Pricing per model:
`input × in + cacheRead × cacheRead + cacheCreate × (cacheWrite ?? in) + output × out` —
cache-creation tokens are priced at the `in` rate unless a `cacheWrite` rate is given. A model
with no entry is *unpriced (N tok)* and never folded into the sum; with no `rates` key at all,
every dollar figure reads *unpriced* and names the key.

## 4. Request budget

**The viewer makes no new read.** Merged PRs and their bodies are in the issues listing the
page already fetches; the fold and the declarations are content at a sha; the fleet mean and
the anchor buckets are reductions over reads in hand.

**The fold gains:**

| Read | Cost | Bounded by |
|---|---|---|
| merged PRs listing | one to a few pages per fold, past the watermark | `prsFoldedThrough` |
| the closing issue of each merged PR | one narrow read per merged PR naming one | the same watermark |
| label events per closed item | one listing per item closed since the last fold | `queueFoldedThrough` |
| the deepened git history | one `git fetch`, no REST | the day tier's window |

All on the executor's own token, all fail-soft per source: a read that fails costs its own
rows this fold and leaves its own watermark where it was.
