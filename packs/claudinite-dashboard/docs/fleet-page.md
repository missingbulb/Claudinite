# The fleet page — above the members grid

One reader, a dozen repos, agents doing most of the work, opens this page once a day. The
block above the members grid answers three questions in the order they are asked, in
under 600 px at 1280 wide, and then gets out of the way of the grid:

1. **Is anything on fire?** — Start here
2. **Is the machine running?** — The machine
3. **What did I get, what did it cost, how fast is it moving — this week against last?** —
   the ledger

The block is one ruled sheet with a stub column naming its bands (START HERE · THE MACHINE ·
THIS WEEK · PULSE · MEMBERS); the identity is in [visual-identity.md](visual-identity.md), the
committed drawing is [mocks/fleet.html](mocks/fleet.html). Every figure is window against
previous window, derived from a named source, and names its gaps; where each figure comes
from is [data-sources.md](data-sources.md).

## Start here

**Question.** What is the one thing only a person can unblock?

**Figures.** The worst candidate across every member, ranked by
[`next-work.mjs`](../next-work.mjs): its headline, its repo, its minutes
(`PARK_MINUTES` / `approvalMinutes` in [`fleet.mjs`](../fleet.mjs)), and *N more after this
one*. It is printed as a **slip on warm paper** — the one object on the sheet addressed to the
person — in two lines: headline, repo link and minutes on the first; the *more* count on the
second, the named runners-up disclosed on click. The minutes are in the sentence; the chip
beside them names the **park kind** (approval / decision / action), which is the category the
reader scans for. Nothing in the slip clips: it wraps.

**Source.** The live issues page and the member summaries.

**Bad when.** Anything at `critical` / `serious`. Green state is one line: *nothing is waiting
on you*.

A machine fact — a member whose tasks never ran — is not restated here; it is the critical
square in the heartbeat below.

## The machine

**Question.** Is the infrastructure that runs the fleet actually running, right now, on
every member — and when does it next act?

Five cells in one row, each `status square + label` in condensed caps, the figure in mono,
and one line naming the worst member, since a name is what the reader acts on.

| Cell | Figure | Derived | Source | Bad when |
|---|---|---|---|---|
| **Scheduler heartbeat** | one 10 px square per member, ordered as the grid below; colour = hours since its last completed scheduler run against its cadence; sub-line names the off-cadence members | per member, `now − latest hour with hours[h].scheduler > 0` in its fold, topped up from the live runs page for hours past `runsFoldedThrough`; cadence from the stub (hourly) | fold `hours` + live runs | any member > 2× cadence → serious; never ran → critical |
| **Executor failures, 24 h** | failed / total executor runs, fleet-wide, worst member named | `hours[*].failed` summed over 24 h, topped up from the live runs page | fold `hours` + live runs | > 0 failed in 24 h → warning; ≥ 3 → serious |
| **Fold age** | age of the *oldest* member's `usage.generated`; how many fold at all (`9 of 12 fold`) | `now − usage.generated`, max over folding members | fold stamp, read at head sha | oldest > 6 h on a member whose head moved → warning; a member that moved and has no fold → named |
| **Drift** | members behind the canon engine or any pack, worst by how many versions | `mountState` in [`fleet.mjs`](../fleet.mjs) | declaration stamp vs `canonRepo` | ≥ 1 behind → info; engine or ≥ 3 packs behind → warning; no `canonRepo` → *unknown*, never *current* |
| **Next wake** | the next anchor across the fleet — `14:00 · 3 members · 5 tasks` — then a 24 h tick strip, one tick per anchor, hover naming member and task | each member's declared tasks' `nextAsk.at` (`buildRoster` in [`model.mjs`](../model.mjs)), collected fleet-wide and bucketed by hour | task declarations at head sha | no anchor inside 24 h on a member that declares tasks → serious (it is unwired) |

The heartbeat reads the fold's hour tier rather than the live runs listing, because one page
of runs on a busy member covers hours, not days, and a member whose last scheduler run has
scrolled off that page is indistinguishable from one that never ran. The live page tops up
the hours the fold has not reached. The reasoning in full is in
[data-sources.md](data-sources.md#heartbeat-from-the-fold).

The wake strip makes the schedule *visible*: a morning reader sees that nothing fires until
14:00, or that six members wake at 02:00 and contend for the same canon PR lane. Its ticks
carry a count as a number, never as an unexplained height.

**Expand →** a per-member table: last scheduler run, last executor run, fold age, engine and
packs behind, next anchor.

## This week, against last — the ledger

Three columns headed by the three questions — **Got / Cost / Speed** — each a stack of four
figures set on ruled rows with fixed tracks (figure · text · delta · spark), so figures,
deltas and sparks form three vertical columns down the sheet. Each figure carries a signed
delta in mono (`−14 vs 61`) and, where the fold has a daily series, a 14-day sparkline (this
week in the machine's blue, the week before dimmed, blank where not folded). A sub-line is
spent only on a second **actionable** figure; an assumption (*cache reads count as in*,
*gaps > 10 m dropped*) lives in the figure's hover title and in one disclosed *how these are
counted* block under the ledger.

**A delta is set in ink unless the figure's own *bad when* rule fires; then, and only then,
it takes the serious tint.** A good move is not coloured: nothing green needs a person.

### GOT — what the fleet produced

| Figure | Derived | Source | Bad when |
|---|---|---|---|
| **Merged PRs**, sub-line *of those, nobody in the loop* | merged PRs in the window — queue items closed `done` / `delivered` **plus** merged PRs that are not queue items, so a hand-started session's PR counts. Unattended = merged with no `needs-human-*` label ever worn | live issues page with merged PRs kept in `projectPull`; older days from fold `prs` | merged ▼ > 30 % wk/wk with sessions flat → something is stalling; unattended share ▼ → the fleet is asking for a person more |
| **Caught before merge** | work-scope check *failures* — sessions where the Stop hook blocked with a finding the agent then fixed — plus the `ciFailures` a session pulled in | fold `checks.work` | the win counter; bad only when it is **0 while runs are high** (enforcement silently off — `checks.work.errors > 0` is the tell, shown as a red footnote) |
| **Releases** | `releases` in window, the repos named in the sub-line | fold | none in a window where a release pack's tasks closed `done` → the release lane is not landing |
| **Lines, net** | `linesAdded − linesRemoved` | fold day rows | shown as a gap (*not recorded*) wherever the fold's history does not reach, never 0 |

### COST — what it took

| Figure | Derived | Source | Bad when |
|---|---|---|---|
| **Tokens in / out** | `tokensIn`, `tokensOut` summed over folding members, `n of 12 folding` beside it | fold day rows (cache reads and writes count as input, as the fold counts them) | ▲ with merged ▼ — paying more for less; see cost per PR |
| **≈ Dollars** | `Σ_model (input × in + cacheRead × cacheRead + cacheCreate × (cacheWrite ?? in) + output × out)` over `tokensByModel` and the `rates` table | fold `tokensByModel` × the declaration's `rates` config | no bad; it exists to be divided by merged PRs. It carries its assumption inline: *your rate table · N % on the top model · N tok unpriced* |
| **Your minutes**, sub-line *your turns · sessions* | `humanSeconds` (per human turn, the gap since the previous entry, capped at 10 min) and `userMessages` | fold `humanSeconds`, `userMessages` | ▲ while merged flat → the fleet is consuming the person |
| **Rule tokens per session** | `ruleTokens ÷ ruleTokenSessions` | fold | > 1.5× the fleet mean on a member → its local packs are heavy |

Unpriced tokens are never folded into the dollar figure: a model with no rate shows as
*unpriced (N tok)*. With no `rates` key at all, the figure reads *unpriced* and names the key
to set.

### SPEED — how fast the fleet moves, and where it is stuck

| Figure | Derived | Source | Bad when |
|---|---|---|---|
| **Issue → merged** (median; p90 in the sub-line) | `merged_at − closesIssue.created_at`, the link being the `Closes #n` line every PR body carries | live PRs with `closesIssue`; older days from fold `prs` | median ▲ > 50 % wk/wk, or p90 > 3 days |
| **Session → merged** (median; p90 in the sub-line) | `merged_at − first transcript timestamp of the session that names that issue` | fold `prs` | p50 > 4 h → sessions wait on something after they finish (CI, or an approval park) |
| **Merged per day** | merged ÷ days in window; sub-line *peak · days with none* | as GOT | — (context for lead time) |
| **Stuck 3 d+**, sub-line *parked for you · on the machine* | open work items idle ≥ 3 d, split by whether a person or a leash the janitor reclaims clears it | live issues page, `troubles` | any *parked for you* ≥ 3 d → serious — this is what feeds Start here |

Issue → merged is the headline; session → merged sits beneath it.

### The totals row — three quotients under a double rule

`≈ $ per merged PR · tokens per merged PR` · `autonomy % · yours : agent minutes` · `would
have shipped broken · top rule ×N`. Each is a quotient or count of two figures already on the
block, so it introduces no source and inherits both gaps: a numerator or denominator that is
*not recorded* makes the quotient *not recorded*.

- **Cost per merged PR** is the number that turns the token figure into a decision: a fleet
  whose per-PR cost doubles while lead time is flat is spending its sessions on retries, and
  the expand says which member.
- **Autonomy** (`unattended merged ÷ merged`) and **yours : agent minutes**
  (`humanSeconds : agentSeconds`) say how much of the output needed nobody and what the
  person's hour bought. A member at 40 % while the fleet is at 80 % is the one whose tasks keep
  parking — a canon problem the grid's worst-first ranking never surfaces, because parks clear.
- **Would have shipped broken** is `checks.work.failures` restated for what it is, with the
  top rule by blocking count beside it; the per-rule split is the corpus's own report card.

**Expand →** *per member*: merged, nobody in loop, caught, tokens in, ≈ $, yours, issue →
merge, stuck — the grid's rows with the ledger's columns rather than the queue's. Members that
do not fold are listed under it as *no fold · counted in nothing above*.

## Pulse

**Question.** Is the fleet alive, and does this week look like last week?

A 14-day column chart of **sessions per day** across the fleet — the series every other
figure rides on — 28 px tall, full width, as the block's baseline: last week dim, this week in
the machine's blue, today a dashed outline where not yet folded, and a **blank** (never a zero)
for a day no member folded. Bars are capped in width and gapped. Hover names the day and the
members that moved. The note beside it carries two facts: *peak N · the weekend days*.

**Source.** fold `sessions` per day. **Bad when.** Seven flat days on a fleet that declares
tasks while the heartbeat is green: the scheduler runs, nothing produces sessions.

## What is deliberately absent

- **A count of scheduler runs**, as a tile or a chart. Whether every member ran when due is
  the question; the heartbeat answers it per member in 12 squares.
- **A row of member-count tiles.** Each fact survives where it is acted on: *members need
  you* is Start here's *N more*; *items parked* and *minutes of your time* are SPEED's stuck
  row and the slip; *schedulers failing*, *mounts behind*, *runs in flight* are the machine;
  *open work items* is the grid; *members adopted* is the footer census.
- **A stacked chart of checks executed against caught**, above the grid. Thirty days of bars
  is the corpus section's job below the grid; the ledger keeps the one figure and a spark.
- **A *members moved* tile.** It is the pulse's hover and the grid's activity column.
- **Cumulative totals, scores, estimated hours saved.** A number that only grows says nothing
  about today; a guess in a tile is worse than a gap.
- **Colour on a good delta, or on a merely-down week.** See the delta rule above.

## Alternatives considered

- **A member × signal matrix for The machine** (four signal rows × one column per member).
  It answers "every member, every signal" in one fixation, but it is 48 cells to read before
  the panel's first question — *is it running* — is answered, which the heartbeat row answers
  in 12 with the off-cadence members named beside it. The matrix survives as the expand's
  per-member table.
- **A bullet per ledger figure** — this window as a bar against a tick at last window's value,
  on the figure's own scale. Twelve bullets are twelve scales on one sheet; a signed delta in
  mono is one number in one column, and the magnitude question is what the sparkline is for.
- **The previous value only on hover** (`vs 61`). The delta alone makes the reader compute
  the base; keeping the base in the smaller mono step under the delta costs one short token
  per row. An open option should the ledger prove too dense in use.
- **Sparklines only on row hover**, at full row width. Sparks at rest are the one place the
  14-day shape of each figure is visible without a click; they are capped and gapped instead.
- **Promoting the three quotients to the head of each column.** They are the most
  decision-shaped numbers on the block, but each inherits two gaps, and a headline that reads
  *not recorded* whenever either input is absent puts the gap at the top of the column. Totals
  under a double rule is the ledger's own form for a derived figure.
- **Pairing the pulse by weekday** (seven slots, last week's bar ghosted behind this week's)
  makes Saturday-against-Saturday one glance, but loses the continuity of a quiet stretch
  across the week boundary and the dashed *today* column. An open option.
