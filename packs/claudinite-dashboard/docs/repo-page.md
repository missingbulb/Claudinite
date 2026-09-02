# The repo page — the top block

The fleet page answers *where do I need to look*; this page answers *what is this scheduler
doing*. Same reader, one click deeper, so the top block speaks the fleet block's language —
Start here → The machine → Got / Cost / Speed → Pulse — scoped to **one member**, and then
hands the page to the Work board ([work-board.md](work-board.md)), which is the page's core and
must begin above the fold: **the top block is ≤ 450 px at 1280 × 900**. A gap costs height —
a *not recorded* sentence is a wrapped line where a figure is one — so a repo whose fold
predates a field runs a little over the budget until it carries one, which is the right way
round: the budget bends before the gap goes unstated. The committed drawing
is [mocks/repo.html](mocks/repo.html); the sources of every figure are in
[data-sources.md](data-sources.md).

Where the fleet ledger has four figures per column, the repo ledger has **three and no tile
row**: every tile's fact moved into a cell that acts on it, and the height bought is what
lands the board above the fold.

## The top bar

Wordmark, breadcrumb, and a **census pill** in mono — `4 PRs · 12 issues · ★ 4 · 17 tasks` —
because open PRs, open issues and stars are how a reader recognises the repo, not findings
about it. Then the rate pill and the reload / clear-cache buttons.

## Start here

**Question.** What is the one thing in this repo only a person can unblock?

**Figures.** The worst row of the Work board (`repoCandidates` in
[`next-work.mjs`](../next-work.mjs)): its issue, its park kind and minutes (`parkMinutes`),
*N more*. The same slip as the fleet's, on warm paper, two lines. **Bad when** anything is at
serious / critical — the same verdict as the first row of the *stuck* view, by construction.
Green state is one line: *nothing is waiting on you*.

## The machine

**Question.** Is *this* scheduler running, on cadence, right now — and when does it next act?

Six cells. Where the fleet's heartbeat is one square per member, the repo's is **one square
per hour**, 6 × 10 px, because the question one level down is *did it run when it should
have*, hour by hour.

| Cell | Figure | Derived | Source | Bad when |
|---|---|---|---|---|
| **Scheduler** | 24 squares, one per hour, filled where a scheduler run completed in it; headline `last 12 m ago`, sub `22 of 24 h · 2 h gap at 04:00` | `hours[h].scheduler > 0` for folded hours, topped up from the live runs page for hours past `runsFoldedThrough` (`hourSeries` in [`usage.mjs`](../usage.mjs)); an hour neither source reached is drawn hollow, not red | fold `hours` + live runs | a gap > 2 h → warning; > 6 h → serious; no run in 24 h on a repo declaring tasks → critical |
| **Executor** | failed / total in 24 h, and what is in flight now | `hours[*].failed` summed over 24 h; in flight from `runs.status ∈ {queued, in_progress}` | fold `hours` + live runs | ≥ 1 failed → warning; the failed run's task named from the hour's `tasks` list where the fold has it |
| **CI on main** | one word plus age | `ciStatus(runs, default_branch)` in [`fleet.mjs`](../fleet.mjs) | live runs | failing → critical (nothing the queue lands is safe) |
| **Fold age** | `now − usage.generated` | the stamp | fold | > 6 h on a repo whose head moved → warning; no fold → *no fold*, and every fold-derived figure below reads *not recorded* |
| **Drift** | `engine −1 · 2 packs`, the versions named | `mountState` | declaration stamp vs `canonRepo` | behind on the engine → serious; no canon configured → *unknown*, never *current* |
| **Next wake** | `05:00 · 7 tasks · in 19 h`, then a 24 h tick strip, one tick per task anchor, hover naming the task | the roster's own `nextAsk.at` per row (`buildRoster` in [`model.mjs`](../model.mjs)) bucketed by hour | task declarations at head sha | a declaring repo with no anchor inside 24 h → serious (unwired); a task whose next ask is `held` is a critical tick at *now* |

**Expand →** the 48-hour table: hour, scheduler, executor, sessions, failed, tasks executed
(from `hours[h].taskExec`).

## This week, against last — the ledger

Three columns × three figures, each with a signed delta and, where the fold has a daily
series, a 14-day sparkline. The same delta rule as the fleet's: **ink unless the figure's own
*bad when* fires**.

### GOT — what this repo produced

| Figure | Derived | Source | Bad when |
|---|---|---|---|
| **Merged PRs**, sub-line *of those, nobody in the loop* | merged PRs in the window from the live listing (merged PRs kept in `projectPull`); unattended = no `needs-human-*` label ever worn; older days from fold `prs` | live issues page + fold `prs` | merged ▼ > 30 % with sessions flat |
| **Queue closes**, sub-line `44 done · 15 obsolete · 6 no outcome` | `Σ queue[task]` over the window, split by outcome word; the per-task split is in the per-task expand | fold `queue` (per task, per day) + today from the live page | **obsolete share ▲**; `none > 0` means items closed without converging (`converge-item` was bypassed) |
| **Caught before merge**, sub-line *of N Stop-hook runs · M from CI* | `checks.work.failures + ciFailures` | fold `checks.work` | 0 while `checks.work.runs` is high → enforcement off; `errors > 0` shown as a red footnote |

Releases and net lines are one muted tail line under the column — *0 releases (vs 0) · lines,
net: not recorded — shallow checkout* — so the gap is stated without spending a row on it.

### COST — what it took here

| Figure | Derived | Source | Bad when |
|---|---|---|---|
| **Tokens in / out**, sub-line *N of M sessions recorded* | `tokensIn`, `tokensOut`; the denominator `tokenSessions ÷ sessions`, so a transcript shape that records nothing is named | fold day rows | ▲ while merged ▼ — see cost per PR in the totals |
| **≈ Dollars** | `tokensByModel` × the `rates` config, assumption inline (*your rate table · N % on the top model · N tok unpriced*) | fold `tokensByModel` + the declaration's `rates` | no bad; it exists to be divided by merged PRs |
| **Rule tokens per session**, sub-line *fleet mean N · heaviest: `<pack>` N* | `ruleTokens ÷ ruleTokenSessions`; beside it the **fleet mean** for the same window, and the heaviest source from `ruleTokensByPack` | fold `ruleTokens`, `ruleTokenSessions`, `ruleTokensByPack`; the fleet mean from the sweep's usage reads ([`fleet-growth.mjs`](../fleet-growth.mjs)) | > 1.5× the fleet mean → this repo's local packs are heavy (a `growth-dedup` candidate) |

On a fleet deployment the page already holds every member's fold at head sha, so the mean is
one reduction over folding members; on a repo-mode deployment the comparison reads *fleet:
not read*. On the canon the figure is expected to be high — it mounts everything; on a
member it is the direct measure of how much local-pack weight every session pays before its
first turn.

*Your turns / your minutes* is not a headline figure here: one repo's human minutes are only
interesting against what the agent spent, so it lives in the totals row's *yours : agent
minutes* ratio, and the turn count in the column's tail line.

### SPEED — how fast this repo moves, where it sticks

| Figure | Derived | Source | Bad when |
|---|---|---|---|
| **Issue → merged** (median; p90 in the sub-line) | `merged_at − closesIssue.created_at` | live PRs with `closesIssue` + fold `prs` | median ▲ > 50 % wk/wk |
| **Closes per day**, sub-line *peak · days with none* | queue closes ÷ 7, from the per-day series | fold `queue` | — (context) |
| **Stuck 3 d+**, sub-line *parked for you · #n · on the machine* | open items idle ≥ 3 d, split by who clears them, from the same `troubles` the stuck view shows | live issues page | any *parked for you* → serious; it is what Start here names |

*Session → merged* is the column's tail line (`p50 38 m · p90 4.1 h — CI, then you`), not a
headline: on one repo it is nearly always the CI duration, which the machine's CI cell
already carries.

### The totals row — three quotients, and the per-task expand

`≈ $ per merged PR · tokens per merged PR` · `autonomy % · yours : agent minutes` · `would
have shipped broken · top rule ×N`, all inherited exactly as on the fleet page — plus the
**per task ▾** expand, the one expansion only a repo page can offer.

**Expand → per task.** One row per declared task with a queue history or a session in the
window, sorted by tokens: *closed* (done / obsolete / none) · *sessions* · *tokens in* · *≈ $*
· *$ per close* · *exec failed* (`taskExec`) · *parked* (`parks`) · *model* (`agent_model`
from the declaration). Three rows exist beside the tasks: `(no task) — sessions you started`,
so the human-driven share is visible; an agentless task shows `none · code-work` in the model
column and dashes where it spent nothing; and tasks closed by the janitor with no session are
collapsed into one row saying so.

This is where the queue's outcome words go per task, where the *all* view's outcome bar
gains a cost column, and where three things only this page can state become rows:

- **Obsolete share, per task.** An ad-hoc lane whose closes are mostly `obsolete` and `none`
  while every scheduled task closes `done` reads as *requests are being filed that the queue
  then retires*, or *the janitor is reclaiming leashes*, and the item links say which. On the
  fleet page this is one number inside a total; here it is a row.
- **Cost per task, against what it closed.** The agentless task that closes most costs
  nothing; the task that costs most may close least. A task's `$ per close` is the only figure
  that turns *tokens ▼ 48 %* into *which task to move to a cheaper model* — and the model
  column is right beside it.
- **Parks per task.** Which task keeps parking, and on what kind — the row that says a task's
  policy is wrong before its next park says it again.

## Pulse

As the fleet's: a 14-day column chart of **sessions per day for this repo**, today dashed
where not yet folded, blank where not folded at all. **Bad when** flat for seven days on a
repo that declares tasks while the scheduler squares are filled: it runs, nothing produces
sessions.

## Below the board

Two regions follow the Work board and its explore panel.

**Corpus** — what Claudinite costs and catches here, over 30 days, as two small multiples on
their own scales (rule tokens per session per day; checks run and caught per day) beside a
**per-rule table for this repo**: `checkFindings` this week against last, blocking / advisory,
and *last fired*. A blocking rule mounted here that caught nothing in 30 days is a demotion
candidate, and this is the only page with the per-repo denominator (`checks.work.runs`).
The two series never share an axis.

**What the packs report** — last, unchanged, the one region whose contents differ from repo
to repo ([pack-contributions.md](pack-contributions.md)).

## What is deliberately absent

- **A tile row.** Minutes waiting and items parked are Start here and SPEED's stuck row; PRs,
  issues and stars are the census pill; CI, runs in flight and drift are the machine.
- **A per-day stacked chart of queue closes.** The outcome *words* matter (obsolete against
  done), but the day was the wrong axis: nobody asks which day obsolete happened, they ask
  which task. Total and spark on the headline; the split per task in the expand.
- **An hourly stacked chart of what ran.** Its real use was the hover naming which tasks
  ran; the machine's expand keeps that as text.
- **A dual-axis corpus chart.** Two scales on one plot violate the one-scale rule; the two
  series are small multiples.
- **A side card of month totals** (tokens / lines / releases). Tokens are COST; releases
  and lines are GOT's tail line.

## Alternatives considered

- **The machine as a 48 h → now → +24 h time strip**, the fold's hour rows to the left of
  *now*, the unfolded stretch drawn as a named gap, the next anchors to the right. It puts the
  scheduler's past and future on one axis in the board's own grammar, and would make the
  fold-age warning visible as an empty stretch. Its drawback is height: a three-row strip
  plus axis at the top of a block budgeted at 450 px, for a question — *did it run this
  hour* — the 24 squares answer in one row. An open option if the block gains room.
- **Session → merged as a headline** beside issue → merged. On one repo the two lead-time
  rows would share a column while differing by an order of magnitude, and the shorter one is
  the CI cell's fact; it stays in the tail line with p50 and p90.
- **Dropping the tail lines** entirely into hovers. Each carries one fact that is not
  elsewhere on the block (releases and lines; turn count; session → merged), and a muted line
  under a column is the ledger's form for a stated gap.
