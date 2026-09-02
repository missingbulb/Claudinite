# The Work board

The repo page's Work block is a board with a time axis, not a table: it answers **what will
the next few days look like, where is the flow broken, and how much of it lands on a
person**. The three table views — *stuck · pending · all* — remain behind it as tabs. The
committed drawing is [mocks/repo.html](mocks/repo.html); the marks and their colours are in
[visual-identity.md](visual-identity.md).

Everything on the board is read from the issues and PRs themselves — a label, a body line, a
timestamp — or from a task declaration. Nothing is a display heuristic, and a figure the
listing does not carry is drawn as *not read*, never as 0. The board is one SVG that scales
to its container; the page fits 1280 wide with no horizontal scroll.

## The time axis

Twelve day columns: **7 back, today, 4 ahead**. The past is washed in the ledger tint, *now* is
a solid ink vertical with a mono flag (`now · Wed Sep 2 10:30 UTC`), and every day column is
ruled in ledger blue with a small tick at the repo's daily anchor (`taskScheduler.dailyHour`,
UTC) — where every scheduled thing on the board sits. Items before the left edge collapse
into a `◂` gutter note with their count and kinds (*before Aug 26: 9 PRs, 2 failure parks, 4
unpicked verifications*); items past the right edge into a `▸` note naming the date.

Four days ahead is the honest horizon: past it, every prediction is "the same daily ticks
again", and the weekly anchor is the last thing with a date. Seven days back is what gives
the task × day grid a week of record beside its predictions.

## Lanes — one per flow

**The lane is the flow**, never the task and never the kind. A lane per task hides the chain:
an approval park is nothing without the PR it holds. A lane per kind (all PRs, all items, all
issues) puts the two ends of one `Blocked-by` edge in different rows, and the edge is the
whole point. So a row is one connected component of the edge graph — `Blocked-by`,
`Ends-when`, `Closes #n` from a task PR to its item — and a lone item is a component of one.

`Refs #n` is **not read**: the page's PR projection parses the closing issue out of a body
and then drops the body, so a `Refs` edge would cost a request per PR. It is absent rather
than approximated, like every other field this board cannot see.

The gutter names a row by **one fact**: its head item and, for a chain, its length
(`#1583 → 2`; `growth-promote · 9 PRs`). The other ids of the chain are printed once, in the
lane beside their marks. Mid-lane text is spent only on a *finding* — `unmarked`, `no one is
scheduled to close #1317`, `after #1236` — one per row, in the serious tint; every age, count
and policy sentence is in the mark's hover title and the explore panel.

Rows are 36 px, group headers 30 px. Each group header carries its title and count on the
left and the group's **one derived sentence** in the lane, in secondary ink, nothing else.

## The four groups, and their ranking

| Group | Rows are | Ranked within by |
|---|---|---|
| **Now — waiting for you** | every open PR, each a bar from *opened* to *now*, wired to the item it ends or the issue it closes | age of the oldest PR in the row, oldest first; a row whose merge releases an edge sorts above one that releases nothing |
| **Flows — blocked, parked, waiting** | ad-hoc items and the plain issues that block them, placed at their **predicted run time** | broken lanes first (a blocker nothing is scheduled to move), then parks by park age, then sleepers by wake date |
| **Scheduled — the daily anchor** | a **task × day grid**: one row per daily task, then `weekly · N tasks` as one row | declaration order; the weekly row last |
| **Quiet** | one ruled line, not a row: the plain issues on no edge, counted by what matters (rotting, quick-win, needs-decision) | — |

Now's header sentence is the **tomorrow-workload line** (below). Flows' header says how its
rows are placed. Scheduled's header names the anchor.

### Collapse rules

- PRs from one task under one landing policy collapse into a **thick bar** with a count
  (`9 PRs · 14 d → 2 d · policy: nothing`), its left end at the oldest and a `◂` where that
  is past the edge.
- Repeated verification items collapse into **one row of stacked park marks**, with the
  unpicked ones as a `◂` note.
- A ladder of plain issues (a migration plan's phases with `Blocked-by` and no queue mark)
  collapses into one gutter note, since none of it has a time.
- Each group is **capped at its worst four rows**, followed by one `N more rows` line naming
  what it holds; the list drops open on click, as HTML below the board.
- A plain issue reaches the board only where it sits on an edge; the rest are the quiet line.

## Marks — what each is read from

| Thing | Mark and place | Read from |
|---|---|---|
| open PR | a bar from `created_at` to *now* in the machine's blue; its length is its age; `◂` past the left edge | PR listing |
| PR waiting for a person | `▲` in amber above the bar's *now* end | no `Merge:` line on the item, or the task's `automerge` is `nothing`, or no work item names the PR at all; the run's own converge verdict lives in a comment the board does not fetch, so a PR whose item *does* authorize a merge reads as still open rather than as waiting |
| ad-hoc item, blocked on a date | hollow circle at its `Not-before` | body line, absolute form only |
| ad-hoc item, blocked on an issue | hollow circle **after** the blocker's predicted time; a PR blocker puts it at *now* + "when you merge"; a plain-issue blocker nothing is scheduled to close gives it **no time — the lane is drawn broken** | `Blocked-by: #n` and the blocker's own placement |
| ad-hoc item, ready | hollow circle at the next scheduler tick — the daily anchor, or the drain tick (its hour not read here) | `task:status:waiting-for-executor` |
| item on no mark | dashed hollow circle, `unmarked` beside it | a `Blocked-by` chain with no `task:origin:ad-hoc` on the link |
| park | square at *now*, the kind as the glyph inside: `×` action, `–` approval, `?` decision, hatch failure | `task:status:needs-human-<kind>` |
| running | filled circle at *now* | `task:status:running-agent` / `running-executor` |
| plain issue | diamond at the *head* of the edge it blocks: hollow ink = plain; filled good = `quick-win`; dotted outline = rotting (`updated_at` ≥ 14 d ago); ghost in the past wash = a ladder phase with no time | labels, `updated_at`, reverse `Blocked-by` |
| a relative date | flagged (`on a relative date`) in the `▸` note, never guessed | a `Not-before` in a form the parser does not read |

**Broken lane.** An edge whose upstream end is a park, a failure, or a plain issue no task and
no PR names is drawn as a dashed line in the critical hue with a `»` break, and the downstream
text says why in words. A lane is not broken because it waits: a future `Not-before` is the
mechanism working.

## The Scheduled group — a task × day grid

One row per scheduled task, one cell per day column, at the day's anchor. A cell's state is
carried by **form and the semantic set**, so it reads in either theme:

| State | Cell | Read from |
|---|---|---|
| **ran** | filled, good | a closed item of that task with `outcome:done` / `delivered`, by `closed_at` |
| **asked, declined** | hollow, muted | a closed item with `outcome:obsolete`, or the schedule board's `verdict: no` for that ask |
| **parked** | filled, amber | an open item of that task at `needs-human-approval` (it waits for a person) |
| **failure park** | hatched, critical stroke | an open item at `needs-human-failure`, placed on the day it parked; `◂` at the left edge when older than the window |
| **predicted** | hollow, the machine's blue | the next anchor for a task whose last verdict on the board was `go` or `fail-open` |
| **will decline** | **half-height** hollow, muted | the next anchor for a task whose last verdict was `no` |
| **running** | filled circle at *now* | `task:status:running-agent` |

A day with more than one occurrence carries the count *in* the cell in mono (`4`, `7`); the
hover names the tasks and their outcomes. Predicted and declined are told apart by height,
never by dash pattern, which at 3 px is invisible.

**A failure park lands on its own task's row**, followed by whatever the task did after it.
The roster reads such a park as *the lane is held — nothing new is scheduled*; a hatched cell
followed by filled cells is the record disagreeing, read left to right on one line. There is
no separate "held lanes" row, because the contradiction is a row fact.

## Tomorrow's human workload

The Now group's header sentence, derived, never a tile: **the PRs waiting now, plus the
scheduled runs whose declaration cannot land their own PR** — `automerge: 'nothing'` — plus
the runs whose policy covers only local packs and habitually write wider (currently parked on
approval). Each predicted cell of such a task carries `+1` in the lane and the row ends in
`+1 PR / day`; the sentence reads `21 open PRs · every one waits for a person · +1 a day from
growth-promote, 2–4 on Sunday`. It is the declarations' `automerge` field read against the
schedule board's `next window`, not a guess.

## The quiet tail

One ruled line under the board: `50 issues, quiet — plain, on no edge`, then three counts in
mono — **rotting** (`updated_at` ≥ 14 d), **quick-win**, **needs-decision** — and a `show ▾`
that drops the named lists with their ages. A quick-win that unblocks nothing by `Blocked-by`
is said so; a needs-decision label is a decision park by another name and is said so.

## The explore panel — per status

One click on a mark opens its panel under the board, on the same sheet below a double rule.
**One is open at rest** — the worst failure, full width — and a second opens beside it on
click; `close ×` returns to one. The contents differ by status, because the reader's next move
differs. Every panel ends in **do**: one imperative.

| Status | Panel carries | Source |
|---|---|---|
| **pending PR** | *waits for*: the policy expression and the run's own `AUTOMERGE:` sentence; *closes / ends*: the `Closes #n` or `Ends-when` target and what the queue does on merge against close; *unblocks*: reverse `Blocked-by` hits; *size · CI*: **not read** until the PR page and the head sha's checks are fetched; *left by*: the item, its model, session, claim → hand-off → converge timestamps | PR body, item body, item comments (`CLAIM_MARKER`, `HANDOFF_MARKER`, the converge comment) |
| **failed task** | *last run*: claim, nonce, session, what it delivered and the PR it left (merged?); *what broke*: the converge comment's own sentence; *park history*: which janitor rule parked it, when, whether it was re-queued or superseded, and the later runs of the same task with their outcomes; *lane*: what the roster claims against what the record shows; *do*: the `converge-item` command | item comments, closed items of the same task |
| **stuck ad-hoc item** | the chain as a list: each `Blocked-by` target with its state and *who is scheduled to move it* (a task, a PR, nobody); the janitor's stuck-dependency comment and its date; the age of the premise — `created_at` and the latest `main` commit touching the paths it names; its `Automerge:` policy as the landing it will get; *do*: close the blocker, mark it ad-hoc, or re-scope | body lines, blocker issues, janitor comment |
| **plain issue** | age and idle; *blocks*: reverse edges and, transitively, the rows it holds; *who moves it*: no mark, no `Task:` field, no PR `Closes` it; *rot*: idle against the 14 d bar and whether its premise moved (a later issue or merge naming the same subject); *quick-win*: the label, and what closing it unblocks; *do* | labels, reverse edges, PR bodies |
| **scheduled task** | the last N occurrences as a strip with outcome words and the decline reasons from the schedule board; next anchor; `agent_model`, `expected_outcome`, `automerge`; cost per run from the fold's `taskCost`; the PRs it has left open | task declaration, the schedule board, fold, PR listing |
| **park** | approval: as pending PR (it *is* the PR); action and decision: the converge comment's ask, verbatim, and the `Ends-when` / `Retry-every` that would close it without a person | item comments, body lines |

## The three views as tabs

The Work bar's tabs read **board · stuck · pending · all**, with counts in mono. The three
table views keep the rows and columns they have; the board is `workRows`'s classification
drawn in time, so *stuck* is the set of rows the board draws broken or parked, *pending* the
set with a live item, *all* the roster. **board** is the default whenever anything is stuck
or waiting on a person — `defaultView`'s own rule; a repo with nothing live opens on *all*,
since an empty board teaches its reader the page is broken.

Underneath, `workRows` gains the **edge graph** — reverse `Blocked-by` over every open issue,
`Closes` / `Refs` from every open PR, `Ends-when` from parks — so a plain issue and a PR can be
rows at all.

## What the board makes visible

Each of these is a fact the table cannot state, because it needs two things on one row or a
time axis under them.

1. **Why each open PR waits.** A PR with no `Automerge:` line, a task whose `automerge` is
   `nothing`, and a run whose converge verdict was `AUTOMERGE: no` are three different reasons
   drawn as one amber flag; the panel says which, in the run's own words. The workload line
   then says how many more arrive tomorrow, and from which task, read off the declarations.
2. **A held lane that is not held.** A failure park the roster reads as holding its task's
   lane, followed on the same row by that task's later `done` cells — the record disproving
   the claim, and a pointer at the superseded-park rule that should have closed it.
3. **Leverage on plain issues nobody is scheduled to touch.** A quick-win that unblocks
   nothing; a plain issue with no mark, no `Task:` field and no PR closing it, holding an
   ad-hoc item behind a broken lane; a migration ladder whose head's blocker is closed and no
   link carries a queue mark — free, and invisible to the queue.
4. **A lane whose vocabulary moved under its items.** Verification items collapsed to one
   row read as three generations at once — parks on the current kinds, an item with no mark
   that nothing will run, and items on a retired mark, unpicked for days.
5. **A date the machine will treat as absent.** A relative `Not-before` a person meant and
   the parser does not read, flagged rather than guessed.

## Data — where each mark reads from

| Field | Source |
|---|---|
| kind and state | labels: `task:origin:*`, `task:status:*` (`statusOf`, `parkKindOf`, `originOf`), `quick-win`, `needs-decision`, `blocked`, the retired queued mark |
| edges | body lines `Blocked-by: #n`, `Ends-when: #n closed`; PR body `Closes #n` / `Refs #n` |
| time | `Not-before:` (absolute only), `created_at`, `updated_at`, PR `created_at` |
| landing | `Merge:` on the item — the one spelling `parseWorkItemBody` reads, and therefore the one the panel names; `automerge` in the task declaration; the converge comment's `AUTOMERGE:` verdict |
| schedule | the schedule board's `last asked / verdict / next window`; `nextAnchor` from the queue's `anchors.mjs` with the repo's `dailyHour` / `weeklyDay` |
| past outcomes | closed items since the window opened, narrow fields, `outcomeOf` |
| run record | the item's claim / hand-off / converge comments (`CLAIM_MARKER`, `HANDOFF_MARKER`), the janitor's rule comments |
| not read here | PR additions / deletions, CI on the head sha, the drain tick's hour, cost per run (the fold) — each drawn as *not read*, never as 0 |

## Alternatives considered

- **A dependency graph.** Every component is a chain of one to three nodes; a graph layout
  spends its strength on topology the chains do not have and loses the time axis, which is the
  axis the reader reasons in.
- **Swimlanes by kind** (all PRs / all items / all issues). Puts the two ends of one
  `Blocked-by` edge in different rows; the edge is the finding.
- **A calendar grid for everything.** Wrong for flows — a park has no day — and exactly right
  for the Scheduled group, which is where it is used.
- **Two stacked-tick rows for the schedule** (*daily* / *weekly*, with `4✓ 1∅` captions and a
  separate "held lanes" row). A task × day matrix crushed into a timeline: counts under tick
  clusters, and the held-lane contradiction split across two rows the reader must
  cross-reference.
- **The PR backlog as a dot strip** — every open PR as a dot at its opened day, so the
  backlog's *shape* (a tail older than the window, a burst on one day) is visible and the
  wired lanes pull out of it. The thick collapsed bar is what is drawn; the dot strip is an
  open option for the Now group's header lane if the backlog's shape becomes the question.
- **Four mark families instead of eight** — the flag as the bar's own end-cap, running as a
  filled tick, predicted as the same tick dashed. The `▲` stays a separate mark because it is
  the one warm thing on the board and must be findable from across the sheet; predicted and
  declined are told apart by height rather than dash.
- **The explore panel closed to one line at rest.** The open panel is the board's own
  finding written out; a repo with a failure park opens on it because that is the page's
  worst fact. An open option where the board is tall.
- **Three days back.** Leaves the grid no record beside its predictions; seven days back is
  the week the ledger above compares.
