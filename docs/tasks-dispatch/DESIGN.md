# Task dispatch without slots — the work-item queue

The mechanism lives in [`packs/claudinite-tasks/queue/`](../../packs/claudinite-tasks/queue/),
behind `taskScheduler.dispatch`. A continuation of the owner's sketch (2026-08-12, reproduced in Appendix A), played against twenty timed
scenarios ([SCENARIOS.md](SCENARIOS.md)) and the field's prior art
([RESEARCH.md](RESEARCH.md)), with the owner's eight decisions of 2026-08-13
recorded in §15 and folded into the sections they changed. The phase plan
belongs to a tracking issue, not here. It supersedes
the slot machinery of
[per-project-scheduling DESIGN §3–§5](../per-project-scheduling/DESIGN.md) and
amends several of its §12 decisions (each amendment is named where it happens).
What it does **not** touch: the task folder anatomy (§1), the precondition
contract, code-work and its secrets model
([task-code-work DESIGN](../task-code-work/DESIGN.md)), the outcome ceiling, the
security posture (the issue is data; behavior comes from tracked files), and the
usage-metrics records.

The shape in one paragraph: **work items are issues, available for work; any
number of executors pull from them — and an issue exists only when there is
work.** The generator — one scheduler run on the repo's one cron — asks each
recurring task's precondition when its anchor comes and files its work item
only on a yes (#1115, decision §15.28); a no is a row on the repo's one
**schedule board** issue, and a read the scheduler cannot make fails open into
an item the executor decides. An executor — a GitHub Action by default, but
anything that can read issues — picks up the next ready item, claims it by
label, re-evaluates the precondition (a chained stage re-derives world state):
on a go it runs the work step and hands off to agentic work (a CCR session
invoked by API); on a no-go it **closes** the item with the reason. Follow-ups,
fan-outs, urgency, and one-off forcing are all just *creating or waking work
items*. There is no slot id, no exclusive claim, and no label-event re-arm;
the one watermark is the board's declined rows, and it fails toward asking
again, never toward skipping.

---

## 1. What the slot machinery costs today

The current design is push-shaped: one hourly scheduler run decides, at a single
instant, everything that will happen — which tasks are due, whether they run,
what they may touch — and encodes the decision into dispatch issues that a
label-event-triggered session then executes. Every complication below is a
consequence of that shape.

- **The slot id is state smuggled into a title token.** `d2026-08-12`,
  `h2026-08-12T14Z`, `m2026-08` exist so that a scheduled occurrence has an
  identity — which the exactly-once guard needs (title search per slot), the
  stale backstop needs (the *leading character* of the slot id is parsed back
  into a period, `SLOT_PERIOD_MS`), and forcing needs (the `~f<runId>` marker
  appended so an operator re-run of an already-run slot isn't silently
  swallowed). Three mechanisms each decode a fragment of scheduler state out of
  a string in an issue title.

- **Due-ness lives in a platform side channel.** "Has this slot run?" is
  answered by the Actions run ledger of the scheduler workflow itself
  (`lastSuccessTime`) — a watermark that is not visible beside the work, must
  exclude forced runs to stay correct, and whose unreadability has to fail the
  whole run (an exit-0 abort would advance it past slots it never evaluated).
  The state the system actually cares about — *was this occurrence's work
  created?* — is derivable from the issues themselves, and nothing reads it
  from there. *(A first cut of the go/no-go ruling briefly reintroduced a
  ledger read; the standing-item model (§5) removed it again — the scheduler run is
  now a pure function of the clock and the issue list.)*

- **A decision made at one instant cannot express ordering, only simultaneity.**
  The nightly chain's ordering is faked by anchor-hour staggering, which
  collapses whenever GitHub fires the cron late — hence the `exclusive: true`
  claim, a task-level hack whose cost is real: **a deferred slot is spent, not
  queued**, so a claim on the wrong night silently halves throughput. The
  system has no way to say "run B after A"; it can only say "run A alone".

- **Label-event invocation is lossy, and the loss shaped three mechanisms.**
  The executor routine fires only on a fresh `labeled` event; a lost delivery
  leaves an armed issue sitting forever. So: the janitor's re-arm
  (remove/re-add the label to emit a new event), the 20-minute grace window so
  a re-arm never hands a live session a rival, and the stale escalation that
  bounds the re-arm loop. The claim protocol then has to survive *duplicate*
  events (the read-swap-confirm lease). All of it is compensation for a trigger
  that neither confirms delivery nor can be polled.

- **Capacity, urgency, and follow-ups have no home.** There is exactly one
  implicit executor per repo and no way to add another; nothing distinguishes
  urgent work from routine work; a task cannot schedule a successor ("validate
  in two days what tonight's run delivered") except by hoping a future
  precondition rediscovers the situation. Forcing (`FORCE_TASKS`) is a special
  engine path with its own exemptions (skips preconditions, exempt from
  deferral, excluded from the watermark, slot-id marker) — where "run this now"
  ought to be the system's most ordinary operation.

- **Visibility is split three ways.** Whether something *will* run is ledger
  math nobody can see; whether it *is* running is labels on an issue; what it
  *did* is a record line in a captured transcript. There is no one place where
  the state of the repo's recurring work can be read.

What is worth keeping — and this design keeps all of it — is everything the
incidents taught: one session executes exactly one item and never sweeps the
queue (the duplicate-execution bug, DESIGN §5), the claim is a verified lease,
the issue is data and never instructions, behavior-defining content comes only
from tracked files, every exit converges to one visible terminal state, and
recovery lives in one place, in code.

## 2. The shape — a pull-based queue of work items

Four roles, strictly separated (this refines, rather than replaces, the
2026-08-06 three-responsibility split — the scheduler's job splits in two and
shrinks):

1. **The generator** — a scheduled run (the repo's one cron, unchanged rule).
   Three jobs: *instantiate* — when a recurring task's anchor comes, collect
   its signals, ask its precondition, and file its work item only on a yes
   (§5); *ready* blocked items whose dependencies have resolved and whose
   not-before has passed; and *reclaim* dead executor claims. It executes
   nothing, and it never turns a read failure into a skipped run — anything it
   cannot decide it files for the executor to decide.
2. **Executors** — any number of pull workers. Each iteration: pick the next
   ready item (urgent first), claim it, evaluate the precondition — the only
   place it is ever evaluated — then on a go run the work step and either finish
   (agentless task) or invoke the agentic phase and hand the item to it; on a
   no-go, close the item with the reason (§5, as amended by #1115). An executor is
   platform-agnostic by construction: its whole interface is issue read/write
   plus the repo at HEAD. More capacity = more executors.
3. **Agents** — CCR sessions, one per handed-off item, invoked by the executor.
   An agent executes its one item's task file, verifies its outcome ceiling,
   and converges the item to a terminal state.
4. **The janitor** — unchanged in role, smaller in scope: dead executor claims,
   dead agent claims, stale-item escalation, queue health review. The re-arm
   retires (§11).

The queue's open issues are exactly the work that needs doing or a human: a
work item exists only where a precondition said yes, or where the scheduler
could not ask and filed one for the executor to decide. What is NOT work — the
asked-and-declined record — lives on one open issue per repo, the schedule
board (§5), never as a sleeping work item. The scheduler run is a function of
the clock, the issue list, the board, and the signals it collects at each
anchor; §5 says why that last read came back after being deliberately deleted,
and what bounds it.

## 3. The work item

An issue, `[claudinite-work] <pack>/<task>` (plus an optional free-form
qualifier after the task, for tasks that legitimately have several concurrent
items — a fan-out names its target: `[claudinite-work] sheepdog/fleet-baseline
member-repo-x`). **The issue number is the identity.** No slot id: an
occurrence needs no name beyond the item that embodies it, and everything the
slot id encoded is recovered elsewhere — dedup from the family's creation
timestamps (§5), staleness from the task's own declared frequency read at HEAD
(§11), forcing from the fact that creating an item *is* forcing (§8).

Body, machine-first (same parsing discipline as today's dispatch body — the
first line is the task path, validated in code before anything trusts it):

```
.claudinite/shared/packs/basics/tasks/baselining/task.md

Not-before: 2026-08-14T04:00Z            # optional — see §9
Blocked-by: #812, #813                   # optional — see §9
Ends-when: #133 closed                   # optional — a park's end condition, §11

Execute the Claudinite task above.
The Context section below is binding scope — do not re-decide it.

### Context
- <the creating precondition's binding lines, verbatim — unchanged>

### Delivered by code-work
- <written by the executor at hand-off, unchanged shape>
```

Everything behavior-defining — model, outcome ceiling, worker content, the
work step's command — is still read from the tracked task files at HEAD, never from the
issue. A work item whose task the repo no longer carries is closed as obsolete,
exactly like today's exit-14.

**The origin label is the single authority on where an item came from**
(owner, 2026-08-20, #1119 — reversing 2026-08-19's marker-free rule, which
this section carried until the vocabulary migration): `task:origin:planned` |
`task:origin:ad-hoc` | `task:origin:github`, mutually exclusive, applied when
the item is born and never removed — the closed issue keeps saying where it
came from. The generator writes `planned` at an anchor (and §8's force lever
writes it when minting the standing item, the same act); a person's ask wears
`ad-hoc` (the request mark, §16.1, and every `manual`-task or qualified item);
GitHub-side infrastructure writes `github` (a workflow-failure report, which
is a park — `task:status:needs-human-failure` — and not a parseable work item,
a shape every reader of parks must tolerate). The occurrence guards (§5) key
on `planned`. *Alternative — the structural derivation this reverses (bare
unqualified title of a task with a frequency at HEAD is the standing item): a
marker beside a derivation was two authorities over one fact, which is why the
2026-08-19 decision deleted `origin:schedule`; making the label the one
authority removes the duplication in the other direction, and unlike the
derivation it survives a declaration changing under an open item (a frequency
edit, a pack rename) without re-interpreting history.* The structural read
survives only as the decode fallback for items that predate the scheme and
carry no origin at all; fielded `origin:schedule` labels stay inert stored
data. Scheduled and ad-hoc work still never suppress each other — a pending
follow-up does not silence tomorrow's occurrence, and a fan-out target
(qualified, `ad-hoc`) does not consume it — and deliberate concurrency for one
task still names a qualifier. A task whose precondition should care about open
follow-ups can see them through the `issues` signal, as task-specific logic
where it belongs.

## 4. The state machine

```
                     ┌────────────► closed  task:status:rejected
                     │                    (precondition no longer holds; task gone)
 created ─► task:status:blocked ─► task:status:waiting-for-executor ─► task:status:running-executor ─► task:status:running-agent ─► closed  task:status:done
            (only when       (queue)       (claimed by an     (handed to        open    task:status:
             Blocked-by /                   executor)          a CCR session)           needs-human-*
             Not-before                                                                 (one of four kinds)
             present)
```

Every label the machinery writes is one of three things — the item's single
**status**, its lifelong **origin** (§3), or the **urgency** flag — and all of
them live in the `task:` namespace (owner, 2026-08-20, #1119; the vocabulary
this replaces is the legacy table below).

**Status — `task:status:` + exactly one of:**

| status | means | applied by |
|---|---|---|
| `blocked` | waiting on `Blocked-by` issues and/or `Not-before` | creator |
| `waiting-for-executor` | available for pickup | creator or the scheduler run |
| `running-executor` | an executor holds the claim | executor, on claim |
| `running-agent` | an agent session owns it | executor, at hand-off |
| `needs-human-action` | parked: something outside the code must change first — a secret set, a scope granted, a routine rewired, an input supplied | anyone, incl. janitor |
| `needs-human-decision` | parked: the run stopped mid-flight, so the next step is a choice — re-queue or abandon, does the half-done work stand, was the ceiling violation acceptable | anyone, incl. janitor |
| `needs-human-approval` | parked: it **succeeded**, deliberately leaving an unmerged PR. The one park that is not a fault | executor or agent |
| `needs-human-failure` | parked: the run broke — a bug, a contract-forbidden shape, a malformed or forged item. The default when nothing else fits | anyone, incl. janitor |
| `done` | terminal: succeeded, nothing pending | executor or agent |
| `rejected` | terminal: never ran — the precondition said no, or the task is gone from the repo (closed as not planned) | executor |

Statuses are **mutually exclusive**: a live item wears exactly one, every write
clears the old status as it applies the new, and an open item wearing none is
torn — the janitor's repair case (§11). The machine's park predicate is a
prefix test (`task:status:needs-human-`); the kind a person routes by is the
same label's tail. *Alternative — the base-plus-sub-label pair this replaces
(`needs-human` + `task:needs-human-<kind>`): it let the machine test one
literal label, but every park had to wear both, a half-applied pair was a new
torn state, and which kinds block was decided by the absence of labels rather
than the presence of one.* `rejected` covers every run that never happened,
machine-declined included, not only a human's no.

**Extra data, the whole of it:** `task:urgent` (pick before any non-urgent
item — a modifier, write-gated like every label) and the `task:origin:*`
authority of §3.

**A park whose kind cannot be decoded reads as `needs-human-failure`.** That is
the compatibility direction chosen deliberately: every bare legacy park an
older engine left behind, and every kind word a newer engine invents that this
one does not know, holds the lane rather than silently letting a broken task
keep filing work.

**Legacy spellings — written never, read forever.** Labels are stored data:
closed issues keep theirs, and fielded engines keep writing their own spellings
until they converge. Every decoder maps every spelling ever written straight to
its canonical status, in one pass:

| legacy | canonical |
|---|---|
| `task:blocked`, `task:ready`, `task:executing`, `task:agent` | the four live statuses, in order |
| `needs-human` + `task:needs-human-<kind>` | `task:status:needs-human-<kind>` (the sub-label decides; bare or unknown → `failure`) |
| `task:done`, `outcome:done` | `task:status:done` |
| `task:obsolete`, `outcome:obsolete` | `task:status:rejected` |
| `outcome:delivered` | recognized forever as the historical "delivered" outcome — an unmerged PR parks at `needs-human-approval` now, and nothing writes it |
| `origin:schedule` | inert stored data (§3) |
| the `claude-*` request vocabulary | the one-issue request shapes (§16.1) |

The map never shrinks, and legacy label *definitions* are never deleted from a
repo — deleting a label strips it from closed issues too, which is stored data.
Two things bind the fielded surface: the executor workflow's event trigger
names label strings literally, so it accepts the legacy ready/urgent spellings
for as long as any fielded engine writes them; and the legacy constants stay
exported for the pack workers that import them.

**Only a `failure` park holds the task's lane** (§5). An open unqualified item
of a scheduled task *is* its standing item (§3), so while one exists no further
occurrence is filed — for a break that is the point, since a queue of items that will fail the
same way helps nobody and the silence is the signal. For the other three it is a
bug: a PR waiting on a reviewer, a decision waiting on its owner and a secret
waiting to be set are one person's inbox, not a fault in the task, and #1032
measured what conflating them costs — a permission gap parked `missingbulb/Shepherd`'s
`fleet-digest` for two days while its dashboard read healthy, because no item was
ever filed behind the parked one. So the generator drops non-blocking parks from
both the standing-item test and the duplicate sweep beside it.

This is the sketch's lifecycle with two adjustments, both argued for rather
than assumed:

- **Executor identity is a claim comment, not a label.** The sketch's
  `being-handled-by-executor-1` puts an unbounded set (executor identities) into
  a vocabulary that must stay small and queryable; every new executor would mint
  a label, and a query for "what is executing" would have to know every
  executor's name. One state label (`task:status:running-executor`) answers the query; the
  claim comment — which the lease protocol requires anyway — carries *who*
  (executor id, run URL) and *when*. Same for `task:status:running-agent`: the hand-off
  comment names the CCR session.
- **`succeeded-with-unexpected-result` became `outcome:delivered`, and then
  became a park.** "Unexpected" would blur two things that must not blur: a run
  that legitimately left a pending artifact within its ceiling (open-pr task →
  open PR: *expected*, but the world hasn't finished with it), and a run that
  violated its ceiling (a `none` task that opened a PR). The second is still a
  **failure**, now `task:status:needs-human-decision` — someone must say whether the
  overreach stands — exactly as `verify-outcome` enforces. The first turned out
  not to be a terminal state at all: a PR nobody has merged is waiting on a
  named person, and closing the item hid that from every surface that counts
  open work, so it parks at `task:status:needs-human-approval` and stays open. It does
  not hold the lane, so the reviewer's silence delays only the review.

Terminal-state discipline is unchanged: every item converges exactly once to
exactly one end — one of the two terminal statuses, or a park under one of the
four kinds — with one comment saying what happened.

**Label writes are granular, always** ([RESEARCH](RESEARCH.md) §2): add and
remove named labels (REST POST/DELETE), never write the label *set* (PUT,
GraphQL `updateIssue`) — a set-write replaces from a stale snapshot and
clobbers concurrent transitions, a bug class GitHub's own CLI shipped
([cli/cli#4861](https://github.com/cli/cli/pull/4861)). With multiple
executors and a scheduler run all moving labels, this is a correctness rule, not a
style preference.

**The road back from a park** (SCENARIOS S12/S19, F7): a human who has
resolved the cause re-queues the item by removing the park status and applying
`task:status:waiting-for-executor` — the sanctioned retry lever, write-gated
like every label operation here. The next pickup re-runs the precondition
(§6.4), which is what makes the retry safe even when the failed run half-did
its work. Alternatively the human closes the item (optionally superseding it
with a forced retry, §8); nothing mechanical ever re-queues a parked item.

## 5. The generator — decide at the anchor, file only work

> Rewritten 2026-08-20 (#1115, decision §15.28). The section this replaces was
> built on the standing-item roll: creation was calendar-only, the scheduler run
> evaluated nothing, a no-go rolled the item forward, and the run was "a pure
> function of the clock and the issue list". That purity was itself the
> deliberate deletion of the slot scheduler's watermark machinery, and this
> section un-decides half of it, on purpose — the roll's price arrived as 12 of
> 46 open issues being permanently-asleep machine bookkeeping and an executor
> session dispatched per declined occurrence. §15.28 records the decision and
> the alternatives; §H/§L in SCENARIOS.md replay the model.

**No work, no item.** When a task's anchor comes, the scheduler run collects
that task's declared signals, asks its precondition — through an injectable
`evaluate(task)` seam, so the decision core stays pure and fixture-testable —
and creates the work item only on a **yes**. A **no** creates nothing: it is
recorded as a row on the repo's one **schedule board** issue. Anything the
scheduler cannot decide — a credential it does not hold (the scheduler stub
carries no `FLEET_GITHUB_TOKEN`; the executor workflow does), a signal read
that failed, a precondition that threw — **fails open**: the item is created
exactly as the calendar-only model created it, and the executor decides at
pick. Never fewer runs because a read failed.

The invariant this trades away, and the one it keeps. The scheduler run is no
longer a pure function of the clock and the issue list — it collects signals,
once per task per period, at the anchor. What it keeps, and what actually
mattered about the purity, is that **no durable scheduler state can silently
eat a run**: the board is the only watermark, it gates only occurrences that
were genuinely asked and declined, and every degradation — absent row, deleted
board, mangled body, unreadable listing — resolves to "evaluate again", at the
cost of one redundant evaluation and never a double run (the occurrence guard
below still holds). This is not the slot scheduler's run-ledger returned: that
ledger was a side-channel whose *unreadability had to fail the whole run*,
because reading past it would advance it over slots it never evaluated. The
board fails soft in the exact place the ledger failed hard.

```text
scheduler run(now):
  if dormant: return                            # before any read, as today

  # ---- the one-time migration (#1115, #1215) -----------------------------
  # Sleeping standing items — open, blocked, unqualified, a FUTURE Not-before,
  # no Blocked-by — close with a comment and their window seeded onto the
  # board: a rolled one (a Last-verdict section) carries its own verdict, a
  # born-blocked one carries the window it was waiting for. Idempotent; items
  # waiting on a blocker are untouched.
  #
  # ---- the orphan reap (#1215) -------------------------------------------
  # A blocked, unqualified standing item whose <pack>/<task> is not declared at
  # HEAD closes: job 1's family match is title-exact on the declared id, so a
  # retired or renamed spelling is invisible to it, and job 2 would ready the
  # item at its Not-before onto a task path that is not on disk. Guarded on a
  # non-empty task list, so an unreadable declaration reaps nothing.

  # ---- job 1: instantiate — evaluate at the anchor -----------------------
  for task in discoverTasks():
    if task.frequency == 'manual': continue
    A = mostRecentAnchor(task.frequency, config.taskScheduler, now)
    family = issues(title == "[claudinite-work] <pack>/<task>", state ALL)
                    # title-EXACT; REST issue list, never search (S6/F11)
    live = [i for i in family if not (isParked(i) and not blockingPark(i))]
    if count(i.state == OPEN for i in live) > 1: closeAllButOldest(live)   # F16
    if any(i.state == OPEN for i in live):      continue  # the item exists
    # occurrence guard, BOTH halves (F13): created-at-or-after A, or
    # closed-at-or-after A — an item that ran and closed today consumed today
    if any(i.created_at >= A or i.closed_at >= A for i in family): continue
    # the WATERMARK: a declined row for this anchor means do not re-ask.
    # Scoped to declined rows only (F31): a go row is record, never a gate.
    row = board[task]
    if row.verdict == 'no' and row.lastAsked == A: continue
    if family.isEmpty and not row:              # first sight: no ask (S25)
      board[task] = no, "first window at nextAnchor"; continue
    verdict = evaluate(task)                    # signals + precondition
    if verdict.error:  board[task] = fail-open; create(task:status:waiting-for-executor)  # executor decides
    elif verdict.run:  board[task] = go;        create(task:status:waiting-for-executor)
    else:              board[task] = no         # no work, no item

  # ---- job 2: ready whatever is due (unchanged) ---------------------------
  # ---- job 4: adopt marked issues (§16.3, unchanged) ----------------------
  # ---- job 3: reclaim dead executor claims (§11, unchanged) ---------------
  # ---- the board write, LAST and only when a row changed ------------------
```

And at pick, executor-side (the full flow is §6): the executor **re-evaluates**
— a chained stage re-derives world state rather than trusting a verdict passed
forward, so the board's row is a watermark, never a verdict — and a no-go
**closes** the item, `task:status:rejected`, with the reason in the close comment.
The roll is gone: no `Not-before` stamp, no open-blocked resting state, no
executor session spent on standing down.

**The schedule board.** One open issue per repo, titled with the exact prefix
`[claudinite-schedule]`, body a table with one row per scheduled task: task id,
frequency, last-asked anchor, verdict, a short reason, and the next window
(derived fresh from `anchors.mjs` at every write — display, never data).
Rules, each load-bearing:

- **It is the watermark**: a row whose verdict is `no` and whose last-asked
  equals the current anchor means this occurrence was asked and declined — do
  not re-ask. Only declined rows gate (F31): a `go` row must never suppress a
  re-ask, because the item creation beside it can fail after the row lands,
  and the row would then eat the occurrence — fewer runs because a *write*
  failed, the exact inversion of fail-open.
- **It is a first authority for exactly one fact** — "asked at anchor A,
  declined, because R" — which is written nowhere else once the roll is gone.
  Every other column derives from the declarations and the anchors.
- **Rewrite only when a row actually changes** (the authoritative columns:
  last-asked, verdict, reason — never the derived next-window). A run that
  asked nothing writes nothing; a quiet day is zero writes.
- **Created lazily**, by the first row that needs writing — never ahead of one.
- **Parse/serialize lives in one module**, `queue/schedule-board.mjs`, the way
  `work-item.mjs` owns the item's schema. A malformed or partially-parsable
  board degrades to absent per-row; an unreadable issue *listing* additionally
  forbids the write (never write what you could not read — a blind create
  could mint a second board). The body is budgeted two-tier under the ~64KB
  field cap, trivial at ~25 rows.
- **Invisible to everything else**: it is not a `[claudinite-work]` title, so
  the family match, `listOpenWorkItems` and the janitor never see it; and the
  `issues` signal collector excludes `/^\[claudinite-(task|work|schedule)\]/`,
  so a board rewrite can never read as repo activity and wake tidy-issues on
  the queue's own churn (the F8 class).

**What this buys**, measured against the roll model it replaces: open issues
are only work-in-flight or a human's inbox (the ~12 permanently-sleeping
items go to at most 1 open board); issue-number burn drops below the roll
model's (a decline consumes no number at all); and a declined occurrence
costs one scheduler-side evaluation instead of a whole dispatched executor
session.

**The costs, named:**

- **Signals are collected twice for an occurrence that runs** — scheduler run
  at the anchor, executor at pick. Accepted: it is the re-derive rule, and it
  is paid only on occurrences that do work, against a saving on every one
  that does not.
- **A task whose signals need a credential the scheduler lacks pays the old
  price**: every occurrence fails open into a created-then-declined issue
  (one closed issue per occurrence — today the two `fleet`-signal tasks).
  Accepted as the cost of never skipping on a read failure; it ends if the
  scheduler stub ever holds the credential.
- **The board's next-window column goes stale between writes** — it is
  recomputed only when a row changes. The frequency column beside it is what
  a reader derives a fresh answer from; claudinite-dashboard is the live
  surface.
- **A declined occurrence is no longer an open issue's timeline** — the board
  row keeps only the LAST ask per task. History of declines is not kept
  anywhere, deliberately: nothing read the roll's history either (the item
  was "a status line, not a log").

**Errored and forced items against the guards** (restated for the new shape):

- A **failed run** parks its item open under a `needs-human-*` status exactly as before — a
  real exit; a `failure` park still holds the task's lane (§4), and a
  non-blocking park leaves it open, with the next occurrence ASKED (and filed
  only on a yes) beside it.
- A **forced ad-hoc item** (qualified, or a manual task's — §3) stays
  invisible to both guards in both directions.
- **Force-of-a-scheduled-task MINTS the standing item in the common case**
  (§8): between occurrences there is now no item at all for a quiet task, so
  the wake lever's minting half — built for the gap after a completed run —
  becomes the ordinary path. An open minted item preempts the anchor's ask
  entirely (it IS the standing item, §3), so a decline racing a hand-created
  item resolves structurally: no row, no duplicate (S57).

## 6. The executor — pick up, claim, prepare, hand off

An executor iteration, in code end to end (the reference implementation is a
job in the vendored workflow, triggered by `issues: labeled [task:status:waiting-for-executor]`
events for latency **and** by the scheduler run's cron as the poll that makes lost
events irrelevant; `workflow_dispatch` for a hand-started drain):

1. **Pick**: list open `task:status:waiting-for-executor` items; `task:urgent` first, then
   **random order among the ready** (owner decision, 2026-08-15). Two
   executors listing the same queue then contend on *different* heads
   instead of cascading down one — and nothing leans on oldest-first: the
   stale-ready escalation is period-scale (~2 periods), indifferent to the
   minute-scale reordering a shuffle introduces. Two skip rules, both live
   reads at pick time:
   - **Same-title mutex** (SCENARIOS S15/F6): skip an item whose exact title
     (task + qualifier) has another open item in `task:status:running-executor` or
     `task:status:running-agent` — one task, one execution at a time; a fan-out's distinct
     qualifiers still parallelize. The skipped item is picked once its twin
     converges.
   - **The `schedule_after` yield** (SCENARIOS S24): skip a scheduled item whose task
     declares `schedule_after: [T]` while T's standing item is `task:status:waiting-for-executor`,
     `task:status:running-executor`, or `task:status:running-agent` — yield *while the upstream is live
     this cycle*, nothing more. A declined upstream does not block — it has
     no item at all (#1115: a no files only a board row) — and neither does
     one sitting parked: a broken upstream must not halt its
     dependents indefinitely, the same bound the old exclusive claim drew at
     three days. This is deliberately **not** a `Blocked-by` edge: `schedule_after`
     names the upstream's live states, and a `Blocked-by` on an item that
     may never exist has nothing to point at. (Under the roll model this
     trap was sharper still — a rolling item never closed, starving every
     dependent forever; S24 kept that record until the roll retired.)

   **The filters are advisory at pick time (F15)**: they read possibly-stale
   state, so two executors can pass them simultaneously and claim
   *different* items the filters should have serialized — a twin pair, or an
   upstream and its dependent. The per-item lease cannot see this (it
   protects one item, not one title). So after **winning** a claim, the
   executor re-verifies the filters against live state; if a conflicting
   item now holds an **earlier** claim (comment order — the same arbiter the
   lease trusts), it reverts its own claim to `task:status:waiting-for-executor` and moves on.
   Bounded (one revert per conflict), deterministic (comment order), and
   the earlier claim never notices (S32).

   Take the first survivor. None → exit quietly.
2. **Claim — the verified lease, unchanged in shape** (it earned its keep):
   read labels, abandon if `task:status:waiting-for-executor` is gone or `task:status:running-executor` /
   `task:status:running-agent` / a park present; swap `task:status:waiting-for-executor → task:status:running-executor` and
   post the claim comment (executor id, run URL, UTC time); re-read, earliest
   claim comment wins, loser reverts nothing and moves on — it may pick a
   *different* item and try again (an executor is code iterating a queue, not a
   session sweeping one; the one-session-one-issue rule binds agents, and each
   claimed item still gets exactly one agent). Three precisions the
   simulator's validation review forced (2026-08-13), each an implicit
   assumption made explicit:
   - **"Earliest" means lowest comment *id*, never timestamp** — GitHub
     comment `created_at` has one-second granularity, so simultaneous claims
     tie on time; comment ids are server-assigned and strictly increasing,
     a total order the protocol gets for free. Nothing in the lease may
     compare runner clocks.
   - **The arbiter is episode-scoped (F18)**: earliest claim comment **since
     the item last became ready** — the revert/reclaim/re-queue comment is
     the episode boundary. Over the item's lifetime, dead claims accumulate
     (every reclaim and revert leaves one behind); arbitrating over all of
     them makes a *dead* claim outrank every future live claimant, and the
     item livelocks through reclaim cycles forever. Caught by the simulator
     racing two executors onto a reverted item (S32) — and masked until
     then because a single executor beats its own stale claim by id
     equality.
   - **Letting go of an open item kills your claim (F24)**: the boundary is
     a *rule about every path that ends an episode*, not a property of the
     three that happened to write a comment. An executor that stops owning
     an item without closing it — every park (and, before #1115
     retired it, the roll), and a
     claimant that *lost* the arbitration — **strikes its own claim**,
     appending the episode marker to the claim comment it already wrote. The
     loser matters as much as the winner: its claim is younger than the
     winner's, so it survives the winner's own strike and becomes the
     earliest claim of the *next* episode, moving the livelock one episode
     along rather than removing it. That satisfies the boundary with no new
     timeline entry, which is what let the roll keep its silence while it
     existed; a
     marker *comment* there would put one on every declining hourly task,
     every hour. Only a claim's author strikes it, so a claim can be
     withdrawn but never forged earlier, and comment ids still give the
     total order. A successful hand-off does **not** strike — that episode
     is live, owned by the session — and a *dead* executor strikes nothing,
     which is the case the leash reclaim already covers.
   - **The label swap is two API calls, not a CAS** — GitHub has no atomic
     label swap. That is fine *because* labels are not the arbiter: they are
     visibility and the pick filter; the claim comments arbitrate, so a torn
     swap can never mint a second owner. What it *can* do — executor dies
     between the remove and the add — is leave an open item with **no state
     label at all**, invisible to every rule that filters by state. The
     janitor gains the repair (§11): an open work item wearing neither a
     status is off the state machine entirely →
     `task:status:needs-human-decision`, a human's to look at — which
     state it should have had is a judgement about what actually ran.
3. **Validate in code**: the body's first line is a legal task path, the file
   exists at HEAD, the pack is declared, `task.mjs` parses. Task gone → close,
   `task:status:rejected`, comment. Malformed →    `task:status:needs-human-failure` (possible forgery, a human must see it),
   unchanged from today.
4. **Re-evaluate the precondition — the verdict that becomes a run.** The
   scheduler run already asked once, at the anchor (§5, #1115); the executor
   asks again over freshly collected signals, because a chained stage
   re-derives world state rather than trusting a verdict passed forward — the
   board's row is a watermark, never a verdict. On **go**: proceed, with the
   pick-time verdict's Context written into the body as the agent's binding
   scope. On **no-go**: the item **closes**, `task:status:rejected`, with the reason
   in the close comment (#1115 — standing and ad-hoc alike; a standing
   item's close also points at the schedule board, and the closed-at half of
   the occurrence guard keeps the period consumed). **This keeps §12.3's "the
   precondition is the only decision point" in spirit**: still exactly the
   precondition deciding, at two sites that ask the same question of the
   same code — and the work step and the agent still may not skip; the
   doctrine's target (later phases inventing "new reasons to skip") is
   untouched.

   **This stays clean only while preconditions ask task questions, not
   calendar ones** (owner's condition, 2026-08-13). "Is there work?" is a
   question about the world; "has it been more than a day?" is the scheduler's
   own question leaking into a task, and under this model it is doubly wrong —
   the schedule already lives in the anchors and the board's watermark, so a
   calendar precondition would be a second clock disagreeing with the first.
   Timing belongs to `frequency`, the anchors, and — for follow-ups and
   deferred requests — `Not-before`. The rule is
   **advisory** by owner ruling: no mechanical check (the property is not
   checkable), and the residual exposure is an occurrence declined with a calendar
   reason in its record — visible, and it costs a cycle, not correctness. The one live offender is resolved by
   ruling rather than grandfathered: **baselining's `ageDays > 1` gate is
   dropped outright** (owner, 2026-08-13: "the wrong precondition"). Its
   precondition becomes the work question alone — is the mount behind canon
   head, are migration notes unapplied — with cadence carried by
   `frequency: daily-2h` and nothing else. The corpus enters the new mechanism
   with zero calendar preconditions.
5. **The work step**, Action-side, unchanged contract: subprocess, task dir
   cwd, `required_secrets` as env, timeout, `CLAUDINITE_REQUEST_AGENT`
   conditional hand-off. **This step is the work, not preparation for it**
   (owner correction, 2026-08-15): for most of the fleet it is the whole task —
   long-running, crash-prone, PR-creating — and the agent phase is the
   sometimes-important judgment minority. The contract key is still spelled
   `code_work` (renaming a vendored key is a migration, tracked separately);
   the design calls the phase what it is. Three requirements, the first
   stated explicitly since SCENARIOS S8/F12:
   - **Re-entrant** — a dead executor's claim is reclaimed and the item
     re-picked, so the work can run again over its own half-done output (it
     already must survive this today, where a scheduler run dying mid-work
     leaves the slot due; the contract just never said so).
   - **Heartbeat while it runs** (work-as-work review, 2026-08-15): the
     executor comments on the item every ~15 minutes during the work step.
     The heartbeat is what lets one short global executing leash survive
     arbitrarily long work — the leash measures executor *death* (heartbeats
     stopped), never work *duration* — and it is the item's visibility during
     the hours its timeline would otherwise go dark (§11 has the leash
     arithmetic this replaces).
   - **The terminal comment is the durable record.** Actions logs expire; the
     item is what remains. Whatever ends the item — converge here, or the
     agent later — the closing comment carries the `claudinite-task-exec`
     record and every artifact the work created (PR links above all). For an
     agentless task this comment is the *only* durable trace of the run, which
     is what makes it non-optional.

   Failure → comment + the park status replacing `task:status:running-executor` —
   and **the worker chooses which sub-label**. The executor sees an exit code
   and nothing else, so it cannot tell a token missing a scope (a person's
   five-second fix) from an exception in the worker's own code (an afternoon);
   a worker that knows prints `claudinite-needs-human: <kind> — <detail>` on
   either stream before exiting non-zero and the park routes on it. Read from
   the output rather than a file, because it must survive the SIGKILL at
   `code_work_timeout` — output is echoed live, a file written at exit is never
   written at all. The last marker wins, so a sweep may revise its verdict as
   it works through its targets; no marker parks at `failure`, which is what
   every worker written before the marker existed does in every run.

   Success, agentless task or no agent requested → converge now: `task:status:done`,
   close, done — the quiet-on-success property survives as a *closed* item
   rather than no item, which is the better trade: the run is now visible.
   **Unless the payload names an unmerged PR**, which is not a finished run but
   a waiting reviewer: that parks at `task:status:needs-human-approval`, open, and does
   not hold the lane.
6. **Hand off**: write `### Delivered by code-work` / `### Why the agent is
   here` into the body (unchanged shapes), swap `task:status:running-executor → task:status:running-agent`,
   post the hand-off comment carrying a fresh **invocation nonce**, then
   **fire the invocation endpoint exactly once** with a payload naming this
   issue and that nonce.

   **Once per item, ever — and that one decision removes a whole protocol**
   (owner, 2026-08-15). An earlier draft retried a timed-out call and, because
   a client-side timeout may still have started a session, accepted
   at-least-once invocation and paid for it with an agent-side claim lease
   (§7) to collapse the duplicates. But a retry is only safe when you know the
   first call did nothing, and the timeout is exactly the case where you
   cannot know. Declining to retry keeps invocation **at-most-once**, so two
   sessions can never arrive at one item and the lease has nothing to collapse.
   The nonce survives, earning its keep differently: it proves a fire names
   *this* hand-off rather than a stale or replayed one.

   Three outcomes, and the third is the whole point:
   - **fired** — a session exists; the item is the agent's.
   - **refused** (a status came back) — no session, and the cause is a token,
     a URL or a routine, which no retry fixes: converge to 
     `task:status:needs-human-action` naming it.
   - **unanswered** (a timeout, a dropped connection) — the session may or may
     not exist, and nothing may guess. The item **stays** `task:status:running-agent` with a
     comment saying the outcome is unknown; whichever way it went is settled by
     a rule that already exists — a session that started converges the item, and
     one that never did leaves it silent until the janitor's agent leash (§11)
     brings it to triage. No new mechanism, no re-queue that could duplicate.

   Either way a lost hand-off is a *synchronous, visible* event at the
   executor, not a silently missing label event (this is what retires the
   re-arm — §11, and the credential it costs is §12).

**An executor run drains the queue** (§15.30, the owner reversing
2026-08-15's one-item run: Actions bills per job with minutes rounded up, so
the run count is the cost): claim an item, see it through to its settle
(close, hand-off, or failure), then pick the next in the same run, ending
only when nothing is pickable. Items still settle **one at a time** — the
serial occupancy of §10 is unchanged — and a platform kill still loses at
most the *current* item's progress: the already-settled items stand, and the
failure continuation (§10) drains the remainder on a fresh runner. Each
item's claim is independently leased, so executor concurrency
is safe at any width. The old
bound tying the run to its leash — `timeout-minutes` ≤ the executing leash, so
the platform killed a hung runner before its claim was reaped — **retires with
the heartbeat** (2026-08-15): it capped every run at under an hour, which the
work-as-work model cannot accept. The stalled-worker lesson
([RESEARCH](RESEARCH.md) §2) is now held by three smaller pieces instead: a
*dead* runner stops heartbeating and is reclaimed within ~the leash; a *wedged
work subprocess* is killed by the work's own declared timeout (the contract's
existing bound), after which the executor converges the failure; and a
*reclaimed-but-alive* runner abandons at its next transition, because the
executor re-verifies its own lease at every state change (§11). The run's
`timeout-minutes` is then sized to the work it may legally do — a drain's
worth of work bounds, not one — and never to the leash; a drain the platform
kills at that bound hands its remainder to the failure continuation like any
other dead run.

**Idempotency, honestly (owner concern, 2026-08-13: "I'm not sure we can
guarantee all tasks to be idempotent").** Agreed — and the design does not
require it. The queue literature's blanket "make handlers idempotent" applies
to systems where duplicate *invocations* reach the handler; here the executor
claim collapses duplicate pickups **before work starts** (§6.2) and at-most-once
invocation means no duplicate ever reaches the agent hop (§6.6), so what tasks
must actually tolerate is much narrower:

- **The work step must be re-entrant** — a *sequential* re-run after a
  crash-and-reclaim (§6.5). That is convergence ("check what exists, continue
  from there"), not idempotency, and it is already required of the work today.
  Concurrent overlap with a zombie run is excluded by the lease re-verify and
  the work's own timeout (above), not asked of the task.
- **Re-executed agent work passes through the precondition again** (§6.4),
  and the half-run's artifacts are on the item (Delivered section, the
  PR-number comments the agent posts as it works — the item is the run's own
  inbox/outbox). A re-pick therefore *sees* what already happened and
  converges `task:status:rejected` instead of redoing it — check-before-act,
  carried by the mechanism, not by task-author discipline.
- The residual overlap cases are bounded by the **write ceiling**: the worst
  historical duplicate produced twin PRs — visible, closeable, never
  destructive.

And for a task that can promise none of this — a genuinely one-shot side
effect (a store submission, an external notification, a payment-shaped
action): the contract gains **`on_interrupt: 'requeue' | 'needs-human'`**
(default `'requeue'`). Declaring `'needs-human'` makes every recovery path
that would re-execute — leash reclaim (§11), the human re-queue lever (§4) —
converge to triage instead (`task:status:needs-human-decision`: whether the
interrupted run left anything behind is exactly the choice being handed over):
**at-most-once plus a human**. This is the ack-early/ack-late dial every queue exposes, and
Celery ships ack-early as its *default* precisely so non-idempotent tasks
are never silently re-run ([RESEARCH](RESEARCH.md) §1); here the safe-side
default stays `'requeue'` because most of this fleet's tasks are
sweep-shaped, and the one-shot minority declares itself. Running
more executors — a second workflow instance, a laptop, a k8s job — requires
only an issues-scope token; nothing about the queue knows how many exist.

## 7. The agent

> Amended 2026-08-18 (§16.6): a session that picks up a request item validates the
> issue it names as well as the item, runs at the item's `Model:`, and writes the
> result back onto that issue when it parks for approval.

Today's `executor.md` collapses: the trigger-identification dance
(`resolve-dispatch`'s not-mine / scope-mismatch / no-trigger / needs-issue
verdicts, the two transports, the no-fallback rule)
existed because the session had to *discover* which label event started it. An
invoked session is told its item in its prompt — one issue number — and the
prompt is written by executor code, not by a human. What survives, verbatim in
role: validate the item in code before acting (never trust the prompt more
than a label event — re-resolve the task path at HEAD), honor the Context as
binding scope, run `task.md` at the declared model with the declared timeout
stated plainly, verify the outcome ceiling in code (`verify-outcome`), converge
the item (`task:status:done`, or a park under one of the four sub-labels + comment),
print the `claudinite-task-exec` record, capture the session. One session, one
item, no queue awareness — unchanged, and now structural: the session never
receives a queue, only an item.

**The agent does NOT claim** (owner, 2026-08-15 — reversing an earlier draft of
this section). A claim lease here would answer "two sessions arrived at one
item", and under at-most-once invocation (§6.6) that cannot happen: the endpoint
is called once per item and never retried, so there is no second session to
arbitrate against. Adding the lease anyway would be machinery maintaining a
property the caller already guarantees — and machinery that reads as a licence to
retry, which is what would break the guarantee.

What the session does instead is **check, not claim**: before touching anything,
confirm in code that the item carries `task:status:running-agent` and that its newest hand-off
comment carries the nonce this fire was given. A mismatch means the fire names a
hand-off that is not the current one — a replay, or an episode that has since been
reclaimed — and the session stops without touching the item. One comparison, no
protocol, and it costs nothing when it passes.

The session's instructions are themselves a tracked file
([`packs/claudinite-tasks/queue/instructions.md`](../../packs/claudinite-tasks/queue/instructions.md))
that the routine's stored prompt does nothing but point at, so the issue-is-data
posture holds at this hop too: the payload names an item, and every instruction
comes from a file under review.

## 8. Urgency and forcing — creating or waking an item is the whole mechanism

- **Urgent** work is an item with `task:urgent`: picked first, and the
  `labeled` event gives it executor latency of one spin-up. Nothing else is
  special about it.
- **Forcing a scheduled task is waking its standing item** (owner model,
  2026-08-13). The item exists (§5), so force = strip `task:status:blocked` **and
  add `task:status:waiting-for-executor`**, clear `Not-before`, optionally add `task:urgent` — the
  same lever as the human re-queue (§4), which is no accident: "run this
  now" and "retry this now" are the same operation on the same object.
  `task:status:waiting-for-executor` is not bookkeeping: `pickOrder` (§6.1) admits on that label
  alone, so an item merely stripped of `task:status:blocked` wears no state any
  executor selects on, and the run reports `nothing ready to pick up` —
  indistinguishable from a healthy idle run. **When the standing item does
  not exist, forcing MINTS it — and under #1115 that is the ordinary case**:
  a decline files nothing and a completed task closes its item, so for most
  of a quiet task's day there is nothing to wake, and refusing there would
  make a fleet-wide converge lever fail on most members most of the time. The minted item is an
  ordinary standing item: it consumes the current
  occurrence (so the scheduler run does not create a second one beside it) and leaves
  the next anchor's alone. Cross-repo, the enforcer does not perform any of
  this itself; it dispatches the member's scheduler with a `wake` input and
  the member's own scheduler run applies the recipe (§14). The executor evaluates the
  precondition at pick like always; a no-go closes the item with the
  reason on record, so a force that finds no work *says so* where the
  operator will read it. Truly unconditional force: say so in a Context line
  the task's precondition honors — but the default stands that even forced
  work is admitted by code. *(Deliberate divergence from #515's "forcing
  never consults the task"; its motivating case — the slot gate running
  before preconditions made mid-day forcing unreachable — does not exist
  here: nothing runs before the pick.)*
- **Forcing ad-hoc work is creating an item**: parameterized runs, `manual`
  tasks, fan-out targets. The CLI/composite (`create-work-item <pack>/<task>
  [--urgent] [--context …] [--supersedes #N]`) writes the generic "forced by
  hand — no precondition asserts there is work" Context; `--supersedes`
  additionally closes a named errored item as superseded by this retry. The
  CLI warns when an open same-title item exists — the pick-time mutex (§6.1)
  means the new item queues behind it, and the operator should know they are
  queueing, not jumping (SCENARIOS S15/F6). `FORCE_TASKS`, the
  forced-verdict path, the `~f` marker and the watermark exclusion all
  reduce to these two levers.
- **Cancelling one executor run means "move on", and the mechanism already
  reads it that way** (owner, 2026-08-16). A single cancellation is
  indistinguishable from a crash: the failure continuation (§10) keeps the
  train moving, and the cancelled run's item is freed by the leash. What a
  single cancellation can *never* mean is "stop the system" — the scheduler run and
  events keep spawning runs — so that intent gets its own lever:
- **Suspending the whole queue is `CLAUDINITE_TASKS_SUSPEND_ALL`** (owner,
  2026-08-16): a repo Actions **variable** (`vars.*`, stamped into each
  workflow's env by the wiring — settable in the UI or over the API, **no
  commit**), which every Claudinite workflow — scheduler run and executor alike —
  checks as its *first act* and, when true, exits cleanly having fired
  nothing. The train parks at most one item after suspension: a fresh start
  sees the variable and exits, and a live drain re-reads it between items
  (an API read — the env copy lands at run start only, §15.30) and stops
  picking. That live read is the one part of the hold whose *reach* depends on
  a grant we have not confirmed: reading a repository variable is scoped to
  the token's variables access, which the workflow `permissions:` block has no
  key for. Where the token cannot make that read, the drain says so on every
  boundary and falls back to the value its run started with — the hold then
  parks *starts* exactly as it did before the drain batched, which is why
  nothing here is load-bearing on the grant. Cancelling the run remains the
  unconditional lever, and the hold is what stops its continuation resuming. Suspension never interrupts *running* work: the current item and
  agent sessions finish on their own — cancel those by hand if the
  hold is urgent — and items freeze exactly where they are, no labels
  touched, which is what makes the hold stateless. This is not dormancy:
  `dormant` is a *declared standing state* in tracked config, a commit,
  read by the same gates; the suspend variable is the instant, out-of-band
  operational hold. (S37.)
- **Resuming is clearing the variable — recovery needs no lever of its own.**
  The next cron scheduler run performs the entire self-heal unaided: its reclaim job
  frees the claims of runs killed during the hold (their heartbeats long
  silent), its readiness job wakes whatever came due, and its drain picks the
  queue back up. An operator who won't wait the ≤1h dispatches the
  **scheduler** workflow by hand — the scheduler run-plus-drain pair, *not* the bare
  executor, whose run would drain ready items but skip the reclaim/ready
  half that makes resume complete. (S38.)
- **`manual` tasks** are simply tasks the scheduler run never instantiates: their items
  are only ever created by hand or by other tasks. The frequency token
  survives; the special-case slot resolution for it dies.
- **Fan-out across repos** is the enforcer creating one item per member repo
  (urgent when the pass is urgent) instead of firing member schedulers with
  `FORCE_TASKS` — same write-gated surface, and the fan-in below gives the
  enforcer something it never had: a status. Nothing about it is a "fleet
  mechanism": it is a task creating items, and if its work needs wider reach
  than the repo's ordinary sessions have, it names a wider invocation endpoint
  (§12).

## 9. Follow-ups, ordering, fan-in — the dependency fields

`Blocked-by: #N[, #M…]` and `Not-before: <ISO instant>` on an item, evaluated
by the scheduler run (§5). Three patterns fall out, all from the sketch:

- **Follow-up validation.** A task whose run delivered something long-running
  (a store submission, an armed auto-merge, a real-world change that settles
  over days) closes `task:status:done` and creates its own follow-up item:
  `Blocked-by: #<this item>` (satisfied the moment this item closes) +
  `Not-before: <now + settle time>`. The scheduler run readies it when the time passes;
  an executor then re-runs its precondition — which checks whether the world
  actually settled — and the item either runs, or closes obsolete because
  everything landed on its own. The "will anyone check tomorrow?" gap closes
  with machinery that is just two body fields.
- **Ordering, declared — the exclusive claim retires.** A task may declare
  `schedule_after: ['basics/baselining']` in `task.mjs`, and it compiles to the
  **pick-time yield** (§6.1), *not* to a `Blocked-by` edge: the executor
  skips the dependent while the upstream's standing item is live
  (ready/executing/agent) this cycle, and picks it the moment the upstream
  converges. The distinction is load-bearing: `Blocked-by` requires the
  blocker *closed*, and a quiet upstream may have no item at all (#1115 — a
  declined anchor files only a board row), so there is nothing for an edge
  to name. (Under the retired roll model the trap was a rolling item that
  never closed, starving every dependent forever — S24's record.) As a
  yield: on the late-fire night all chain items are created together,
  baselining runs first, extract and promote follow *the same night* in
  order; on the routine night where baselining's precondition declines at
  its anchor, no baselining item exists and extract is pickable a minute
  after its own yes. Nothing is spent, no task claims a run, and the engine
  still never knows what baselining is — `schedule_after` names a task id, and the
  pick filter reads item states, generically. §12's exclusive-claim
  machinery (and its stated throughput cost) deletes. `Blocked-by` remains
  the right edge for what it is: dependencies on items that *terminate*
  (follow-ups, fan-ins).
- **Fan-out with a fan-in.** Fanning out is creating N items (§8). The fan-in
  is one more item — the status/aggregation task — created `Blocked-by` all N.
  It readies only when every child converged, and its precondition/work step read
  the children's outcome labels to report or escalate. "Getting the status of
  a fan-out" stops being a bespoke sweep and becomes an ordinary task whose
  edges the scheduler run already evaluates.

**Readiness has one site: the scheduler run's own job 2** (F1, reopened by the
owner 2026-08-15, then re-declined and reversed 2026-08-26 — §15.19 amended by
§15.31 / #1373). A close writes only to the item it holds; deciding whether a
dependent's block still holds is the scheduler run's job, because that is the
thing that re-derives the world, and a task execution converging its own item
has no business relabelling a sibling work item to answer it. So the close-time
variant tried under F1 — the executor or agent doing the closing evaluating
every open `task:status:blocked` item naming it, and flipping it the moment its
last `Blocked-by` closed and its `Not-before` passed — is gone: it read as a
latency optimisation on top of a mechanism already correct without it, and
removing it costs a chain link at most one scheduler run of latency, never
correctness (SCENARIOS S33, S18).

Native GitHub issue dependencies (blocked-by/blocking — GA since Aug 2025,
API- and webhook-supported) and sub-issues *mirror* these fields: the scheduler run
writes the native edge alongside the body field, buying the dependency UI for
free ([RESEARCH](RESEARCH.md) §2). The body fields remain the truth the scheduler run
parses — they are portable to any tracker with issues, labels, and comments,
which is the platform-agnosticism the sketch asks for. One vendored module owns
parse/serialize of the two fields; nothing else touches them.

Cycles: the scheduler run readies nothing in a `Blocked-by` cycle, forever, and the
stale escalation (§11) surfaces it as `task:status:needs-human-action` after ~2 periods — the
same convergence-not-prevention posture as the rest of the system. The scheduler run
does not attempt cycle detection; the janitor's health review may.

## 10. Capacity and platform-agnosticism

The default deployment stays one vendored cron workflow — the repo's only
cron, rule unchanged — containing the scheduler-run job and a drain (the scheduler run goes
first; the drain then starts an executor for what it created, which keeps the
common case's latency at zero even without events). **The drain dispatches
rather than executes**, which is how it leaves the scheduler run's concurrency group
below: this job's success means the drain was started, never that it
finished. **And it dispatches only when the scheduler run's parting look at
the queue found something pickable** (§15.30): every workflow run is a billed
invocation whatever it finds, so an idle hour costs the cron's one run — the
guaranteed delivery is unweakened, because anything an event failed to
deliver is exactly what that parting look sees.
Event triggers (`task:status:waiting-for-executor` labeled)
give urgent and hand-created items sub-minute pickup — with one platform fact
worth knowing: a label written by a workflow's own `GITHUB_TOKEN` emits no
triggering event (GitHub's recursion guard), so events only ever come from
*foreign* tokens — a human, a CLI on a PAT, an agent session. The drain being
in-run is what makes that harmless; it is the structural delivery, events the
sugar.

**The capacity model, honestly** (work-as-work review, 2026-08-15; the run
boundary re-drawn by §15.30): the work step is the work, so throughput is run
*occupancy* — items settle **serially**, and one run **drains until nothing
is pickable** (§15.30, reversing the one-item run of §15.22: Actions bills
each job's minutes rounded up, so a chain of one-item runs paid a whole
invocation — checkout, setup, rounding — per item). The CCR sessions runs
hand off parallelize for free; the executor-side work does not. So executor
width is the primary capacity parameter, not a garnish: scale with a matrix
width for parallel executor jobs, or with executors outside Actions entirely
— the contract is "issue read/write plus the repo checkout at HEAD", so a
runner anywhere with a token qualifies. Between items the run re-reads the
operator hold via the API (§8 — the env copy is start-only), so suspension
parks a drain at most one item later.
One fairness note, accepted at today's scale: the randomized pick (§6.1)
removes any *systematic* head domination, but a heavy item still occupies its
run for the full work bound while light tasks wait out the chain — a sentence
here rather than machinery, until it is measured.

**What starts an executor run is an enumerable list, and each cause is on the
record** (2026-08-15, one entry retired by §15.30; the sim asserts it — S34):
(1) **the scheduler run's own drain job** — the guaranteed delivery, started by the
cron workflow's job graph (`needs: scheduler run`) whenever the scheduler run
left anything pickable, no event involved; (2) **a `task:status:waiting-for-executor`/`task:urgent`
label event** — foreign tokens only, the latency sugar; (3) **the close-time
drain** — an agent session that converges an item triggers a drain when
anything is pickable after its readiness re-check (§9); the executor needs no
such dispatch for its own closes, because its run simply picks the next item;
(4) **the failure continuation** — a run that dies (crash, timeout,
cancellation, runner loss) leaves its remainder undrained, so the executor
workflow carries a second job, `needs: execute` with `if: failure() ||
cancelled()`, which the platform runs on a fresh runner and whose one step
re-dispatches — a dead run stalls the train by ~a minute, not until the next
cron fire (S36). (Self-re-dispatch, the old cause between these two, retired
with the one-item run: the drain-until-empty loop lives inside the run now,
§15.30.) The continuation carries **a depth, capped at three**
(engine-side, 2026-08-20, not from the review): a run that dies at *startup*
— a broken engine, a revoked token — dies identically every time, so an
unguarded continuation dispatches itself for as long as that lasts. At the
cap the chain stops and escalates to the repo's workflow-failure issue rather
than going quiet, because a queue that has stopped draining is the one
failure where every individual run looks like an ordinary death. Causes 3–4 ride `workflow_dispatch`, which the default
`GITHUB_TOKEN` *is* permitted to fire — the explicit exemption in the same
recursion guard that suppresses its label events — so no wider credential is
involved.

**The scheduler run must never wait on a drain** (work-as-work review, 2026-08-15).
The heartbeat retires the sub-hour cap on executor runs (§6), and a long
drain sharing the scheduler run's serializing `concurrency` group would then hold the
next cron fire — instantiation, readiness and the leash reclaim all stalling
behind the very work they schedule. So the serialization the double-scheduler run
guard needs (S6) scopes to the **scheduler run alone**, and executor work runs outside
it: the drain leaves the cron workflow's concurrency group (its own group, or
the separate executor workflow via dispatch). A deployment where the drain
can still block the scheduler run is mis-wired even while nothing visibly fails. The
engine took the dispatch option, which has a second effect worth naming: the
drain job runs no task code, so it holds **no secrets at all** — the executor
workflow is the only place they live, with nothing left beside it to leak
into.

Executor identity is self-declared in claim comments; the system never
enumerates executors, which is why adding one requires telling no one.

## 11. Recovery — what the janitor keeps, what dies

| failure | today | proposed |
|---|---|---|
| scheduler/scheduler run miss or late fire | run-ledger catch-up math | same property from the occurrence guard (§5) — the next scheduler run instantiates the most recent occurrence only |
| double scheduler run | concurrency group + slot-title search | concurrency group + occurrence-guard search (same window, same answer) |
| lost label event | janitor re-arm (remove/re-add), 20-min grace, bounded by stale escalation | **retired** — executors poll on the scheduler run's cron; events are latency sugar, never the only delivery |
| duplicate events / racing executors | claim lease on one implicit executor | same lease, N executors — the loser picks a different item |
| executor died mid-claim | — (executor was a session; janitor reclaimed via `agent-running`) | **the scheduler run** (owner, 2026-08-13): `task:status:running-executor` with no activity past ~1h → strip to `task:status:waiting-for-executor` with a comment, so a dead executor's item is back in the queue within ~2h rather than ~25h. An executor iteration is minutes, not hours, and a lease checked once a day is not a short lease |
| executor run died with items still queued | n/a (one implicit executor; the next slot was a day away) | **the failure-continuation job** (owner, 2026-08-15): `needs: execute`, `if: failure() \|\| cancelled()` re-dispatches on a fresh runner, so the *queue* resumes in ~a minute while the dead run's own item waits for the leash; the scheduler run drain is the backstop when the whole workflow run is lost (§10, S36) |
| agent session died mid-run | janitor: stale `agent-running` → `needs-human` after ~3h | same, on `task:status:running-agent` (a hand-off comment names the session, so the janitor can say *which* session died) — the park is a `needs-human-*` status |
| CCR invocation lost | undetectable (label event fired into the void); surfaced only by re-arm/stale | **synchronous**: a refused call parks with the error at once; an unanswered call leaves the item with the agent and the agent leash settles it — one call per item, never retried (§6.6) |
| item never picked up | stale dispatch escalation, period parsed from the slot id's leading char | same escalation, period read from the task's declared `frequency` at HEAD (or a default for ad-hoc items) — no title parsing; the stale item converges `task:status:needs-human-action` — the lane is not being drained and the fix is outside the item — and leaves the queue |
| a park's question is answered outside the queue | n/a (an approval park held an open PR forever, and rule E excludes `approval` because a later clean run does not answer it) | **`Ends-when: #<n> closed`**, stamped by the converge on any park given a `--pr`. The janitor reads the target's resolution: merged → the work landed, so the item closes `task:status:done`; closed unmerged → `task:status:rejected`. A condition it cannot evaluate reads as absent, never as met |
| dependency never resolves | n/a | **the stale-ready rule cannot see it** — a blocked item is never ready (F14, caught by the simulator against S18's claim). The janitor gains a third rule: a blocked item whose blockers have not resolved for ~2 days gets an escalation *comment* — labels untouched, so the item still proceeds by itself the moment its blockers resolve; a human who decides it is dead closes it by hand |

The janitor remains an ordinary daily task and shrinks twice over: re-arm and
its grace window delete, and the **executing-leash reclaim moves to the scheduler run**
— a deterministic label rule, serialized and hourly, which is exactly the
scheduler run's kind of work. This amends the 2026-08-06 "all recovery lives in the
janitor" split, deliberately: the split's purpose was that recovery happen
*once, in one place, in code* rather than in every triggered session, and a
rule that runs once per scheduler run satisfies that as fully as one that runs once per
day. What stays with the janitor is everything needing judgment or a longer
horizon — four rules and a review: the dead *agent* claim (`task:status:running-agent`
silent past ~3h → `task:status:needs-human-decision` (what the dead
session left behind decides whether this re-queues), the hand-off comment naming which session
died), the stale-ready escalation (unpicked past ~2 periods →
a park), the stuck-dependency sweep (F14 above — comment-only), the
stateless-item repair (an open work item wearing neither a `task:*` state
nor a park — a torn label swap's leavings, §6.2 →
`task:status:needs-human-decision`),
and the health review, which gains the queue (ready-item age, blocked-item
depth, outcome mix) as its subject and can now compute all of it from
issues.

Two leash constraints, made explicit by the validation review (2026-08-13) and
the first **reframed by the work-as-work review (2026-08-15)**:

- **The executing leash measures executor death, never work duration — the
  heartbeat is what buys that (F17, reframed).** As first written, F17 made
  the leash exceed every task's work bound, which under the work-as-work model
  inflates it to the heaviest task in the fleet: one legitimate three-hour
  task and a dead executor on a two-minute task also waits three hours to
  reclaim. Instead the executor **comments a heartbeat on the item every ~15
  minutes during the work step** (§6.5): a live run is never reclaimed however
  long it works (S31c), a dead one stops heartbeating and is reclaimed within
  ~the leash of its last heartbeat regardless of the work's bound (S31d), and
  the wiring-time conformance check shrinks to the one relation the heartbeat
  itself needs — **heartbeat interval well inside the leash** (S31). The
  livelock the original constraint prevented — every tenure reclaimed alive
  before it can finish, the work re-executing forever, nothing converging —
  is still demonstrable by switching the heartbeat off (S31b), which is why
  the heartbeat is contract, not courtesy. The paired runtime rule is
  unchanged: an executor **re-verifies its own lease at every state
  transition** (is my claim still this episode's earliest?) and abandons
  silently when it is not — which is what keeps a reclaimed-but-alive runner
  from handing off work it no longer owns.
- **The agent leash (~3h) assumes agent sessions finish or touch their item
  within it** — parity with today's stale `agent-running` sweep, stated as
  an assumption rather than discovered as an incident: a legitimately
  longer-running agent must comment on its item to reset the activity
  clock, or it will be declared dead. (The same move as the executor's
  heartbeat, at the other hop.)

Both recovery sites keep the same discipline: **recovery is code, run in one
place per rule, never a sweep inside a session that is executing something.**

## 12. Invocation is an API call — and the endpoint is a task's to choose

**Decided (owner, 2026-08-13): the executor invokes the agent over the CCR
API.** This reverses per-project-scheduling §12.6, which declined URL-invoked
routines because the label was trigger *and* write-gated authorization, the
re-arm was built on it, and an endpoint "would add a callable credential to
every repo's Action for no reduction in moving parts". All three premises
changed: the authorization surface is unchanged (creating and labeling items
is write-gated exactly as labeling was), the re-arm no longer exists to
preserve, and the moving parts genuinely reduce — re-arm, grace window,
transport-dance exits and the no-fallback doctrine all delete.

The cost is accepted, not waved through: **a CCR session-creation credential
as an Actions secret in every repo**, readable by anything that can run a
workflow with secrets access, blast radius "start agent sessions as the
owner". Mitigations, all standard machinery here: a dedicated key scoped to
session creation alone, provisioned like any `required_secrets` entry, rotated
centrally.

**And this is what kills the fleet concept** (owner, 2026-08-13: *"the notion
of 'fleet' should be eliminated — a CCR with wider access is just a different
API invocation; let specific tasks override the URL and you're done"*). The
whole self/fleet apparatus — a second ready label, a second executor routine,
`session_scope`, "which dispatches may a repo's executor take" — existed only
to keep a broad grant off ordinary sessions while the trigger was a label.
Once invocation is a call, reach is a property of *which endpoint you call*,
so a task that needs wider access declares a different invocation target and
nothing else in the system needs a concept of scope. The canon's curation
tasks become ordinary tasks that name a wider endpoint.

The declaration shape (owner-confirmed, 2026-08-13): a task declares an
endpoint **name**; the repo's config maps that name to the invocation URL and
to **the name of the repo Actions secret holding its token**. A raw URL in a
`task.mjs` would put deployment detail — and something adjacent to a
credential — into a vendored pack file every consuming repo receives verbatim,
which is the one thing pack files must never carry; the name keeps the
secret-shaped half in the repo's config where `required_secrets` already
lives.

**The endpoint is a ROUTINE's API trigger, and that moves where the agent's
instructions live** (verified against the routines documentation at
implementation, not assumed): firing a routine runs *its* saved prompt, and the
`text` we send arrives wrapped in a block explicitly labelled untrusted, which a
routine acts on only because its stored prompt says to. So the payload names the
item and the nonce and instructs nothing, and the prompt is a tracked artifact —
— [`packs/claudinite-tasks/queue/instructions.md`](../../packs/claudinite-tasks/queue/instructions.md),
which the routine's stored prompt does nothing but point at, one line long. The issue-is-data posture arrives intact at one more
hop: behavior comes from files under review, never from what an API caller sent.
A routine's repository scope is then the whole meaning of an endpoint, which is
what makes "reach is which endpoint you name" true in the deployment and not only
in the design.

**The token must be usable from the GitHub Action, and the plumbing is the
`required_secrets` plumbing, reused exactly**: the executor job — the *only* place
invocation happens — reads the endpoint's named secret out of the same bag every
task's secrets come from.
This works because Actions secrets are reachable Action-side and nowhere else
in a task's life, and Action-side is precisely where the executor runs; the
agent session it invokes still carries no secrets, unchanged. Baselining asks
the owner (the standing-issue posture) for any endpoint secret the repo
declares but has not configured; until then the tasks naming that endpoint
converge `task:status:needs-human-action` at hand-off with the missing secret named — the same
"nothing fails, the task just doesn't work yet" posture `required_secrets`
has.

## 13. What retires, what survives

Retires: `slots.mjs` (both exports and the slot-id grammar), `lastSuccessTime`
and the ledger-read failure mode, `FORCE_TASKS` and `FORCED_VERDICT` and the
`~f` marker, the exclusive claim and `deferredByClaim`, the re-arm
(`rearmDispatchIssues`) and its grace window, `resolve-dispatch`'s
trigger-discovery exits (11/12/13) and the two-transport dance, both
`ready-for-agent` labels, `SLOT_PERIOD_MS` title parsing — and, per §12, **the
fleet/self distinction entire**: `READY_FLEET_LABEL`, the second executor
routine, the deprecated `session_scope` field, and the scope word every
executor had to be told and check. Reach is which endpoint a task names.

Survives unchanged: the task folder and contract (plus the new optional
`schedule_after` and `on_interrupt`), preconditions as the only decision point (evaluated at admission and
at pickup, §6.4), the work step (contract key `code_work`) and `required_secrets`, outcome ceilings and
`verify-outcome`, the claim lease, one-agent-one-item, terminal convergence,
`claudinite-task-exec` records and the usage fold (plus the terminal labels as
a second, queryable census), the janitor as sole recovery site, dormancy (the
scheduler run's first gate, before any read), the issue-is-data security posture, the
one-cron rule.

## 14. Arrival, updates, secrets — the mechanism's own lifecycle

Three flows the design must own beyond steady state: how the mechanism
**arrives** in a repo, what happens when the mechanism itself **changes**, and
how a task **executes with secrets**. (Owner question, 2026-08-13 — the first
two had only S25's fragment until this section; the scenarios named here are
executable like the rest.)

### Bootstrap — when the mechanism is added

The mechanism reaches a repo the way every engine facility does — bootstrap
for a fresh repo, baselining's wiring converge for an established one — and
its wiring is exactly four things, all idempotent, all from the vendored
engine at HEAD:

1. **Labels**, create-if-missing: `task:status:waiting-for-executor/blocked/executing/agent/urgent`,
   `needs-human` and its four sub-labels (until #1050 retires the bare label),
   and the terminal pair `task:status:done`/`task:status:rejected`. Nothing ensures
   `outcome:delivered` — nothing applies it; decoders still read it and every
   other legacy spelling.
2. **Two vendored workflows**: the scheduler run (cron at the repo's stable hashed
   minute, plus `workflow_dispatch` so an operator or a migration never waits
   for the cron), and the executor (invoked as the scheduler run's drain job and by
   `labeled` events on `task:status:waiting-for-executor`/`task:urgent`; carries the stamped
   secrets env — below).
3. **Config**: `taskScheduler.dispatch: "queue"`, the endpoint map (§12), the
   anchor schedule.
4. **Nothing else** — no seed items, no ledger to initialize. The first scheduler run
   after wiring books every task's first window as a board row and files nothing
   (§5's first-sight rule, S25), so adoption never fires weekly or monthly work
   off-anchor on the least-proven repo. The adoption smoke test is the force
   lever: create one item by hand and watch it converge.

Pre-existing issues from the slot mechanism (`[claudinite-task]` titles) are
invisible to the scheduler run — the family list is title-filtered — so bootstrap into
a repo with old-vocabulary issues neither reads nor touches them (S29); they
are the old mechanism's to drain or a human's to close.

### Updates — when the mechanism changes

The mechanism's only durable state is the items, and an item is deliberately
schema-thin: a title naming a task, labels naming a state, two body fields,
comments as record. Everything else — anchors, guards, yields, leashes,
verdicts — is **computed fresh at every scheduler run and pick from the engine and the
declarations at HEAD**. That one property decides every update question:

- **A task declaration change** (frequency, `schedule_after`, precondition, secrets)
  applies at the very next scheduler run, with no migration and no
  relabeling: a declined task holds no item at all, and the board's row is a
  watermark, not a wake, so nothing durable carries a schedule to migrate
  (S28, re-pinned under #1115). A frequency change may cost one extra ask on
  the day it lands — the new calendar's current occurrence is not covered by
  the old anchor's row — and never a double run, because the occurrence
  guard's closed-at half covers a same-period item that already ran. An item
  already in flight finishes under the declaration it was picked with.
- **An engine change** lands through the ordinary update flow (engine release
  → members' baselining converges the vendored workflows). In-flight items
  survive by construction: a run that claimed an item finishes it on the code
  it checked out; every later touch — next scheduler run, next pick, the janitor — is
  new code reading labels. The label-and-field vocabulary is the
  compatibility surface, nothing else is.
- **Which makes grammar changes the one hard case**: renaming a label or body
  field strands every open item. Such a change ships with a migration note
  (the `migrations/` discipline) that relabels open items, and it is
  rehearsed in the simulator first — change `sim.mjs`, and the red tests name
  the scenarios the grammar change breaks before any repo runs it. Additive
  changes (a new label, a new optional field) need none of this and are the
  strongly preferred shape.
- **Version skew** inside one run cannot happen (an Actions run checks out
  one ref); skew across runs is the in-flight bullet above, and is why every
  rule reads state from the item rather than remembering it.

### Executing a task with secrets — the whole path

GitHub Actions secrets are the only secret store in the system, and the
executor workflow is the only consumer. End to end:

1. **Declaration** — `task.mjs` lists `required_secrets: ['CHROME_STORE_TOKEN']`:
   names only. The declaration is vendored to every consuming repo verbatim,
   which is exactly why it must never hold more than a name.
2. **Storage** — values live as repo Actions secrets, set once by the owner
   in repo settings. Nothing else in the system stores, copies, or logs them.
3. **Wiring** — the executor workflow names each secret, and the wiring converge
   regenerates that list at the `# claudinite:secrets` marker from every declared
   task's `required_secrets` plus the configured endpoint tokens. So the file IS a
   function of the task set, and a NEW secret needs a human-merged PR in every
   member, because `.github/workflows/` is the one path a converge cannot write.
   That coupling is what wedged a member in #1296, and #1301 removed it by carrying
   one `toJSON(secrets)` line instead — **reversed in #1336** (owner, 2026-08-24):
   serialising the whole secrets context is the shape GitHub's malicious-workflow
   detection flags, and a flagged workflow parks every run with zero jobs until a
   person clicks Approve. An unattended queue can neither absorb that nor see it.
   The trade taken is deliberate: a rare human-merged PR beats a permanent human
   click on every run. The scheduler run and the janitor workflows get no secrets —
   they never execute task code.
4. **Execution** — after claim and a go verdict, the executor runs the work step as
   a subprocess (task dir cwd, timeout) whose env carries exactly the declared
   names, selected out of the bag by `secrets-bag.mjs`. **The work step is the only
   task code that ever sees values.** A member still running a workflow that stamps
   names directly resolves them from the plain environment instead, until its own
   executor workflow lands by human-merged PR.
5. **The agent hop carries nothing** — the hand-off writes body sections and
   calls the invocation endpoint with a prompt naming the issue and nonce;
   the session works under its own identity. A task whose agent phase needs
   a privileged effect routes it through the work step's delivered artifact or a
   wider invocation endpoint — never a secret in the session.
6. **Endpoint tokens ride the same rail** (§12): config maps endpoint name →
   URL + the *name* of the Actions secret; the executor reads that name out of the
   bag at the moment of the API call and nowhere else. The CCR session-creation
   token is simply the default endpoint's entry.
7. **Missing secret** — absent from the bag: baselining asks the
   owner on its standing issue (the adoption-interview posture), and until
   set, execution parks the affected item `task:status:needs-human-action` naming the missing secret — at the work step for `required_secrets`, at hand-off for an
   endpoint token. Nothing fails silently; the task just doesn't work yet.
8. **Rotation** — rotate the value in repo settings; nothing else changes,
   because names are the interface everywhere above.

The cost of passing the whole context, recorded rather than rediscovered: every
repo secret reaches the executor **job**, though no task subprocess sees more than
it declared; and masking is registered per exact literal, so a secret containing a
quote, a backslash or a newline appears JSON-escaped in the bag and would not be
masked if anything printed it.

Steps 2–3 and 6–8's storage half are Actions-platform behavior the simulator
deliberately does not model (prose rows in the coverage map); the
needs-human convergence postures are ordinary sim territory.

### Migration

Deliberately thin here — **the phase plan lives in the tracking issue,
[#801](https://github.com/missingbulb/Claudinite/issues/801)** (two PRs, two
approval points, one same-day validation burst) — with this record keeping
only the property that makes it tractable: the two
mechanisms coexist per-repo behind `taskScheduler.dispatch:
"slots" | "queue"`, sharing the task contract, with disjoint issue families
(`[claudinite-task]` vs `[claudinite-work]`) — so the flip is a config edit
and the rollback is the same edit backwards, with each mechanism's open
items untouched by the other. Every retired slot mechanism deletes in the
same PR that lands its replacement's fleet flip. One known migration detail
(SCENARIOS F8): the signal collectors' self-trigger exclusions must learn
the new vocabulary before the first queue-mode repo flips, or the queue's
own items read as repo activity to the preconditions watching it.

## 15. Decisions on record (owner, 2026-08-13, and the work-as-work review of 2026-08-15)

The eight questions this design opened, as answered, followed by the standing
entries and the 2026-08-15 review's decisions (14–21). Where an answer changed
the design rather than confirming it, the section it changed is named.

1. **Invocation is a CCR API call** (§12). Reverses per-project-scheduling
   §12.6; the session-creation credential in every repo is an accepted cost.
2. **The precondition re-runs at pickup, and forcing loses its exemption**
   (§6.4) — conditioned on preconditions asking task questions, not calendar
   ones. #515's rationale does not survive the pull model.
3. **Timing in a precondition is advisory, not forbidden** (§6.4): permitted
   where the verdict cannot flip between creation and pickup for scheduling
   reasons alone. No check — the property is not mechanically checkable, and
   the residual failure is a visible `task:status:rejected`, not a wrong result.
4. **A precondition is go/no-go, never maybe-later** (§5) — *changed the
   design twice*. First cut: one verdict per occurrence at the first scheduler run
   after the anchor, which required a `lastSchedulerRun` read from the Actions ledger
   — a partial rebuild of the very watermark §1 complains about, called out
   as such when the owner asked for a state assessment. Resolved by the
   owner's **standing-item model** (decision 13 below): the verdict stays
   once-per-period, and the memory moves onto the item itself (`Not-before`
   roll), deleting the ledger read entirely. Mid-window firing stays out; a
   task wanting finer latency declares a finer `frequency`. *(The memory's
   home moved again with decision 28: the roll retired, and "asked, declined"
   became a schedule-board row. Go/no-go, once per period, stands.)*
5. **The fleet concept is eliminated** (§12, §13) — *changed the design*.
   Wider reach is a different invocation endpoint, declared by the task that
   needs it. `ready-for-agent-fleet`, the second executor routine, and
   `session_scope` all delete. (One elaboration flagged in §12: the task names
   an endpoint *key*, with the URL and credential in repo config, so no
   vendored pack file carries deployment detail.)
6. **The executing-leash reclaim rides the scheduler run** (§11) — *changed the
   design*. ~2h to recover a dead executor's item instead of ~25h; the janitor
   keeps the judgment sweeps. Amends the 2026-08-06 single-recovery-site split
   in siting, not in principle.
7. **Namespaced labels, executor identity in claim comments** (§4). As
   drafted; the sketch's literals and a label-per-executor are both declined —
   the first for queryability, the second because executor identities are an
   unbounded set.
8. **Dependency readiness is the scheduler run's alone** (§9). No re-check at close: one
   site evaluates `Blocked-by`/`Not-before`, and ~1h per chain link is within
   what nightly work tolerates. *(Amended by decision 19, 2026-08-15: a second
   site at close, with the scheduler run as backstop — the ~1h/link stacked on drain
   occupancy once the work step was priced honestly. Decision 19 reversed by
   decision 31, 2026-08-26 / #1373: this decision stands again, unamended — one
   site, the scheduler run, and nothing else.)*

Standing entries — no decision needed now:

9. **Known limitation (S18):** a fan-in blocked on a stuck child waits for a
   human; no quorum or deadline semantics at this scale. The janitor's stale
   escalation is the visibility. Revisit only on evidence.
10. **Ref-creation CAS claims** — `refs/claudinite/claim/<n>` is the
    platform's one true first-writer-wins primitive and would replace the
    comment lease outright. Recommendation stands: keep comment leases
    (visible on the item, sufficient at this concurrency) unless a real
    lost-race incident occurs. Recorded so it is not re-derived.
11. **Invocation idempotency key** — **answered at implementation: there is
    none.** The endpoint is a routine's API trigger (`POST
    /v1/claude_code/routines/<id>/fire`), whose body accepts one freeform `text`
    field and no idempotency key. The conclusion drawn from that was initially the
    wrong one — build a lease to clean up the duplicates — and the owner corrected
    it (2026-08-15): **don't create the duplicates.** One call per item, no retry,
    the unanswered case left to the agent leash (§6.6), and §7's claim protocol
    deleted rather than written.
12. **The no-go record alternative** — every occurrence creating an item born
    closed on a no-go was recorded here as the only ledger-free way to keep
    every occurrence on record, priced at ~2,500 closed issues a year.
    **Superseded by decision 13**, which achieves both properties (no ledger,
    every ask on record) with one *rolling* item per task instead of one
    closed item per occurrence.
13. **The standing work item** (owner, 2026-08-13) — *the generation model,
    settled*. The scheduler run creates each task's item unconditionally at its anchor
    and evaluates nothing; the precondition runs exactly once per period, at
    pick, on the executor; a no-go **rolls** the item to the task's next
    anchor instead of closing it, so the item carries "asked, declined, wakes
    at T" and the scheduler run is a pure function of the clock and the issue list.
    Forcing a scheduled task becomes waking its standing item. One
    elaboration of the owner's literal proposal, flagged in §9: `schedule_after`
    compiles to a pick-time yield, not a `Blocked-by` edge — a rolling item
    never closes, so blocked-by would starve dependents of a quiet upstream
    forever (S24). Titles carry no timestamp; the issue number is the
    identity, as ever. *(Superseded in part by decision 28, 2026-08-20: the
    unconditional creation and the roll retired — the scheduler run now asks
    at the anchor and a decline is a board row, not an open item. What
    stands: no slot id, no exclusive claim, the pick-time yield, forcing as
    waking/minting, and the occurrence guard.)*

The work-as-work review (owner, 2026-08-15). The correcting premise, in the
owner's words: *"The pre work is not pre work. It's work. Sometimes there's
also agentic work. The work can take time. The work can crash. The work
creates PRs. The work is a lot."* Every sizing assumption in the design was
re-derived under it — the mechanics survived; the arithmetic and the
deployment coupling did not:

14. **The work step is the work** (§6.5) — the executor-side subprocess is the
    whole task for most of the fleet; the agent phase is the judgment
    minority. The design names the phase **the work step**; the vendored
    contract key stays spelled `code_work` until its own rename migration
    (tracked in the follow-up issue), because renaming a key every member's
    files carry is a fleet migration, not a doc edit.
15. **Heartbeat comments during the work step** (§6.5, §11) — *changed the
    design*: F17 reframed (heartbeat interval < leash replaces leash >
    every work bound), the `timeout-minutes ≤ leash` run cap retired (§6),
    and the item's timeline stays live through long work. One mechanism
    serves recovery and visibility.
16. **The scheduler run never waits on a drain** (§10) — *changed the design*: the
    double-scheduler run serialization scopes to the scheduler run alone; executor work runs
    outside that concurrency group, or the heartbeat's legal long runs would
    starve the hourly scheduler run behind the platform's queueing.
17. **The occupancy capacity model** (§10): a drain's throughput is its
    serial work-step occupancy, so `maxItems` and executor width are the
    primary capacity parameters; self-re-dispatch (`workflow_dispatch`, one
    of the two events a `GITHUB_TOKEN` can fire) is the drain-until-empty
    shape; the oldest-first fairness exposure is named and accepted at
    today's scale. *(The drain-until-empty shape moved inside one run by
    decision 30; the occupancy arithmetic itself is unchanged.)*
18. **The terminal comment is the durable record** (§6.5): the
    `claudinite-task-exec` record and every artifact the work created land on
    the item at close — Actions logs expire, and for agentless runs (the
    majority, under this review's premise) the item is the only durable trace.
19. **F1 reopened — readiness re-checks at close** (§9), amending decision 8
    in siting, not principle: whoever closes an item readies its dependents in
    code and a drain follows; the scheduler run stays the backstop. (S33, S4.)
    ***Reversed by decision 31***
20. **Randomized pick order, adopted outright** (§6.1) — *amended 2026-08-15,
    same day*: first recorded as "ship with width", then adopted
    unconditionally on the owner's rebuttal of the one argument against —
    the stale-ready escalation is period-scale, so nothing in the system
    leans on minute-scale oldest-first ordering. Urgent first, then random
    among the ready.
21. **"The tick" keeps its name for now** — the owner's naming rule (spell names
    out; no single nouns that need contextual reading) applies to everything
    new here ("the work step", "the readiness re-check at close", "heartbeat
    comments"), and renaming the tick itself is deferred to
    [#877](https://github.com/missingbulb/Claudinite/issues/877) so it lands
    after the old slot scheduler's vocabulary retires and the
    "scheduler"-name collision is moot. *Resolved by decision 27.*
22. **One executor run performs one item — structurally** (§6, §10) —
    *amended 2026-08-15, same day*: first recorded as "`maxItems` defaults to
    one", then the knob deleted on the owner's correction ("An executor
    performs a task. It's not a current value. It's the essence of it.").
    A run claims one item, sees it to its settle, and ends; a run ending
    with items still pickable re-dispatches a fresh run, so the queue drains
    run by run and a run's timeout sizes to a single work bound. The sim
    models runs as first-class objects with a recorded trigger on every run
    — asserted by S34. (Engine: the `maxItems` surface deletes and the
    dispatch plumbing lands via #883.) ***Reversed by decision 30***
    *(owner, 2026-08-22, #1212): per-job rounded-up billing prices each run
    at a full invocation, so a run drains until nothing is pickable — still
    serially, still trigger-recorded, no `maxItems` knob returning.*
23. **A dead executor run must not stall the re-dispatch train** (§10, §11):
    the executor workflow carries a failure-continuation job — `needs:
    execute`, `if: failure() || cancelled()`, which the platform runs on a
    fresh runner even after a timeout or runner loss — whose one step
    re-dispatches the workflow. The remaining queue resumes in ~a minute;
    the dead item itself still waits for the leash reclaim; the scheduler run drain
    stays the backstop behind everything. (S36; wiring rides #883.)
24. **The operator hold: `CLAUDINITE_TASKS_SUSPEND_ALL`** (§8, owner,
    2026-08-16) — cancelling one run means "move on" (intent already served
    by the continuation + leash); stopping the *system* is a repo Actions
    variable every workflow checks as its first act, exiting having fired
    nothing. Items freeze untouched; resume is clearing the variable — the
    next cron scheduler run self-heals everything, or a hand-dispatched **scheduler**
    run (not the bare executor) does it immediately. (S37/S38; wiring rides
    #883.) *Amended by decision 30: a batched drain also re-reads the
    variable between items — an API read, since the env copy lands at run
    start only — so the hold still parks the train at most one item later.*
25. **`task:done` / `task:obsolete`** (owner, 2026-08-19) — the `outcome:`
    namespace dissolves into `task:`: one vocabulary carries the state
    machine's live and terminal states alike (§4). `outcome:delivered` stays a
    read-only legacy spelling — nothing writes it. The fielded engine keeps
    the old spellings until the vocabulary migration; decoders map every
    legacy spelling straight to today's, per the stored-data rename rule.
26. **The origin marker is deleted** (owner, 2026-08-19) — *changed the
    design*: standing vs ad-hoc derives from structure (§3) — an unqualified
    item of a task with a frequency at HEAD *is* the standing item; a manual
    task's item, or any qualified item, is ad-hoc; a request item is known by
    its `Request:` field. `origin:request` dies unbuilt; fielded
    `origin:schedule` labels become inert stored data the decoders ignore, and
    the vocabulary migration may strip them from open items. The one semantic
    shift, accepted: an unqualified ad-hoc twin of a scheduled task ceases to
    exist as a concept — creating one is minting/waking the standing item
    (§8's lever), and deliberate concurrency names a qualifier.

27. **The tick is the scheduler run** (owner, 2026-08-20), closing decision 21
    and [#877](https://github.com/missingbulb/Claudinite/issues/877). The slot
    scheduler was deleted in #993, so "scheduler" no longer names two things and
    the collision that deferred this is gone; what the word denotes now is
    exactly the repo's one cron workflow, `claudinite-scheduler.yml`, which is
    what runs it. `generatorRun` was the alternative and was declined: §2 and §5
    already call the *role* the generator, and a run of it is better named for
    the thing an operator looks at in the Actions tab than for the role.

    The module moved to `queue/scheduler-run.mjs` and `planTick` became
    `planSchedulerRun`. **`queue/tick.mjs` survives as an entry-point shim**, and
    must: a member's `.github/workflows/claudinite-scheduler.yml` names the
    module it runs as a literal path, and that file is the one path a converge
    cannot push (§14) — so every member spends a window running the refreshed
    mount from the old workflow, and a missing entry point there is a queue that
    stops with no run left to fix it. `scheduler-workflow-shape` accepts either
    spelling for the same reason. Both retire when no member's workflow still
    names `tick.mjs` — read the members' files, do not guess a date.

28. **No work, no item — the scheduler run decides at the anchor, and the
    watermark is the schedule board** (owner, 2026-08-20,
    [#1115](https://github.com/missingbulb/Claudinite/issues/1115)) — *changed
    the design*: §5 is rewritten around it, and it supersedes decision 13's
    unconditional creation and roll. The scheduler run evaluates each task's
    precondition when its anchor comes (the injectable `evaluate` seam; the
    executor still re-evaluates at pick) and files a work item only on a yes;
    a no is a row on the one open `[claudinite-schedule]` issue per repo;
    anything the scheduler cannot read fails open into an item the executor
    decides. The alternatives, and why each lost:

    - *No watermark at all — re-ask every hour.* Affordable on the per-repo
      token (~4% of the 1000/hr budget), but the two `fleet`-signal tasks
      enumerate every owned repo per evaluation (~100–130 reads, 1–2 minutes),
      so hourly re-asking is ~24× today's cost for a verdict that moves at
      most daily — and the "win" is a bug: a task whose signal turns true at
      15:00 would fire off-anchor, quietly redefining what `daily-1h` /
      `daily-2h` mean for the nightly chain, which is ordered against a
      converged mount, not clock latency.
    - *A repo variable / the Actions cache / a Project.* Each needs something
      the vendored scheduler stub does not have: `variables: write`, a 7-day
      eviction window, or a credential `GITHUB_TOKEN` never gets. The board
      needs only `issues: write`, already in the stub, so it ships through
      the nightly converge with no per-member action.
    - *An orphan ref.* Feasible (`contents: write` is there), but it adds
      push machinery to a run that is pure issue mechanics, and shows a
      human nothing.
    - *A closed board.* Identical mechanics, zero visible machine issues;
      rejected because the record would then be readable only through
      claudinite-dashboard — an opt-in pack most members do not declare and
      that `engine/` cannot depend on.

    Why the board is not the slot scheduler's deleted run-ledger returned: the
    ledger was a platform side channel whose unreadability had to fail the
    whole run; the board is beside the work, first authority for exactly one
    fact ("asked at A, declined"), and every failure of it degrades to one
    redundant evaluation — it fails toward evaluating, never toward skipping
    (F31 pins the one place that could have inverted: a go row never gates).
29. **The unified vocabulary, the origin authority, and one-issue requests**
    (owner, 2026-08-20, #1119) — *changed the design, three ways at once.*
    Every queue label becomes a single mutually-exclusive `task:status:*` (the
    `needs-human` pair collapses — the collapse decision 25 anticipated and
    #1050 held for the fleet's convergence — and `task:obsolete` becomes
    `rejected`), plus `task:urgent` and the `task:origin:*` set as the only
    extra data (§4). The origin label is the **single authority** on standing
    vs ad-hoc, reversing decision 26; the structural derivation survives only
    as the decode fallback for pre-scheme items (§3). A marked issue IS its
    work item — the `claude-*` vocabulary retires into origin + status on the
    one issue, the model and merge authorization move into author-gated body
    fields, and the two request retry levers collapse into clearing the status
    (§16). `workflow-failure` folds into `task:origin:github` +
    `task:status:needs-human-failure`. Out of scope, deliberately: the fleet
    sweep's `fleet-adoption`/`fleet-drift` labels (one task's private
    convergence keys for human-inbox issues, not queue state) and every other
    task-domain label. Every legacy spelling is decoded forever (§4's table);
    the executor stub triggers on old and new ready/urgent spellings until no
    fielded engine writes the old ones. The migration is tracked in #1119.
30. **Invocations are the cost unit — the batched drain** (owner, 2026-08-22,
    #1212) — *changed the design, reversing decision 22.* Actions bills each
    job's runtime rounded **up** to the next minute, so a day's cost is the
    workflow-run count, and one-item runs paid a whole invocation — checkout,
    setup, rounding — per item, with the hourly drain dispatched even into an
    empty queue. Three changes: an executor run **drains until nothing is
    pickable**, settling items serially in the same run (the occupancy model
    of decision 17 is unchanged — only the run boundary moved — and
    self-re-dispatch retires with it; the failure-continuation job, decision
    23, keeps covering a run that dies with items still queued); the
    scheduler's **drain job dispatches only when the scheduler run's parting
    look at the queue found something pickable**, so an idle hour costs the
    cron's one run; and the **operator hold is re-read between items** (an
    API read — the env copy is delivered at run start only), so suspension
    still parks the train at most one item later. The sim carries an
    Action-executions accounting (`actionExecutions()`), and S65/S66 pin a
    working day at the cron floor plus one drain per hour that had work,
    and a quiet day at the cron floor alone. (S34, S36, S65, S66; the engine
    and workflow wiring land via #1214.)
    **The two halves reach the fleet on different schedules**, and the split
    is deliberate: the batched drain and the between-items hold are vendored
    engine, so they arrive with the nightly converge — the larger saving,
    fleet-wide, needing nothing of a member. The gate is a *workflow* change,
    and `.github/workflows/` is the one path a converge cannot push, so it
    reaches a member only when that copy is refreshed. It is therefore written
    to be inert without its consumer: the engine writes a `pickable` output an
    older copy maps nowhere, and an unmapped output is the empty string, which
    is not `'true'` — so a member on the old copy keeps dispatching hourly,
    which is exactly today's behavior. The `ungated-drain` rehearsal fixture
    is that claim, converged rather than asserted.
31. **Convergence must not write to other work items — reversing decision 19**
    (owner, 2026-08-26, #1373). A task execution converging its own item is
    responsible for that item alone; releasing a dependent it may have freed
    crosses into relabelling a sibling work item, which is not its business —
    deciding whether a block still holds is the scheduler run's job, because
    that is the thing that re-derives the world. The close-time re-check F1
    reopened was a latency optimisation layered on a mechanism already correct
    without it (the scheduler run's job 2, decision 9): removing it costs a
    chain link at most one scheduler run of latency, never a stalled chain.
    `readyDependents`/`releasedBy` (`readiness.mjs`) retire with no caller
    left; `isReleasable` and the scheduler run's job 2 are untouched and stay
    the sole releaser. (S33 rewritten to the new bound; S18 already covered a
    HAND close on this same backstop.)

---

## 16. Ad-hoc requests — an issue somebody marked (owner, 2026-08-18)

> *"I need a way to mark an issue as 'let claude do this task', and the next
> executor run would pick it up and run it in a CCR (with appropriate model,
> possibly of my choice). I want minimal security here … evaluated as a
> precondition."*

Everything the queue runs today is **recurring**: a task whose anchor comes round
and whose precondition finds work. A one-off ask — *implement this issue* — has no
anchor and no task of its own, so until now it had to be started by a person in a
session. This section makes it a **first-class origin of work items**, and
deliberately not a feature beside the queue: a request is dispatched by the same
scheduler run, claimed under the same lease, evaluated by a precondition at the same single
evaluation site, handed off by the same at-most-once API call, bounded by the same
ceiling, and parked in the same triage lanes. Nothing about it is a second
mechanism. *(A first cut built this as an opt-in pack; the owner's correction —
"these are all changes to the regular task scheduler and not a pack" — is what
this section is.)*

### 16.1 The mark is the origin label — and the marked issue IS the work item

> Rewritten 2026-08-20 (#1119, decision §15.29). The `claude-*` vocabulary and
> the shadow work item this replaces are decoded forever (§4's legacy table).

One label: a person applies **`task:origin:ad-hoc`** to an ordinary issue, and
that issue *becomes* the work item — no shadow `[claudinite-work]` issue is
filed for it, and the whole lifecycle (§4's statuses) plays out where the
person is already looking. The request state IS the queue state:

| shape | means |
|---|---|
| `task:origin:ad-hoc`, no status | marked, awaiting adoption — the exactly-once guard (§16.3) |
| + `task:status:waiting-for-executor` (or `blocked`) | adopted; a run is queued |
| + `task:status:running-executor` / `running-agent` | the run owns it |
| + `task:status:needs-human-approval` | a pull request is open, waiting on a person — the in-review state, with no separate label to mirror it |
| + `task:status:rejected` | refused and **disarmed** — standing on the still-open issue, because the run's verdict is not the issue's validity (§16.5) |
| + `task:status:done` | the work is finished and the issue is **closed** with it — the one terminal with nothing left to act on (§16.5) |

The mark is a label rather than a body syntax or a command comment for one
reason: it must be appliable from the issue page on a phone, and anything
richer is a form nobody fills in twice. It is also **write-gated by the
platform** — applying a label needs triage or write access — which is the
first half of the security story and the reason the rest can stay this small.
For an ad-hoc item a **park** stands on an **open** issue, and so does the
rejected terminal: the run's verdict is about the run, not the issue's validity,
so clearing it is the asker's lever. `task:status:done` is the exception, and
closes the issue it stands on like any other item's — *amended 2026-08-31
(#1489), reversing "a marked issue is never closed by its own run": `done` means
nothing is left for anyone to act on, and an issue left open under it asks its
author to come and agree with what the run already settled.*

*Alternative — the shadow-item model this replaces (the marked issue holds the
conversation, a separate work item holds the state): two issues then tell one
story, every state change must be mirrored into request-facing labels or the
asker cannot see it, and the pair can disagree. The cost of the one-issue
shape is the mirror image — machine fields share a body the human authors
(hence the delimited machine block and the author gate, §16.3/§16.7) and the
state machine's label churn lands on the asker's issue — and it buys the
collapse of the two retry levers into one (§16.3).*

### 16.2 A built-in task, so a request is an ordinary run

The engine ships **one** task, `engine/implement-request`, wherever the queue runs
— `frequency: 'manual'` (the scheduler run never puts it on a calendar; an item exists only
because an issue was marked), `expected_outcome: 'merged-pr'` (a ceiling, not an
instruction: it opens a pull request for review, and lands one only in the single
authorized case §16.11 defines), no `schedule_after`, and **no code-work phase at all**.

Shipping it as a task rather than as a special item shape is what keeps this from
being a second mechanism: the item's first body line is a task path validated in
code exactly like every other, the same-title mutex serializes twin requests, the
janitor's leashes cover it, `verify-outcome` polices its ceiling, and `record-exec`
counts it. The two things that follow from it being engine-owned rather than
pack-owned: task discovery gains a built-in root beside the pack scan, and the
validated task-path shape gains that root's form. Both are named in §16.10 as the
parts of this that touch code every member runs.

### 16.3 The scheduler run's fourth job — adopt

Beside instantiate, ready and reclaim: **adopt**. For every open issue wearing
`task:origin:ad-hoc` with **no status** — that combination is the whole of the
exactly-once guard — the scheduler run appends the machine block to the
issue's own body and applies the first status:

```
<engine>/scheduler/queue/tasks/implement-request/task.md

Request: #123                            # this issue — the run implements it
Model: sonnet                            # from the body's Model: field, author-gated (§16.7)
```

The mark never comes off (origins are for life, §3); what advances is the
status, and any status — live, parked or terminal — blocks re-adoption until a
person clears it. That collapses the old model's **two** sanctioned retries
into **one lever**: clearing the status. A cleared park, a cleared rejection
and a cleared approval all re-enter the queue as the *same* record at the next
scheduler run; there is no predecessor to supersede, because there is only one
issue. And an impatient re-ask mid-run is structurally nothing: the mark
already stands, the status says a run owns it, and there is no second label to
apply — the one-issue mirror of "the mark waits, unconsumed."

The parameters ride the body (`Model:`, and §16.11's merge authorization),
re-read and re-gated at every adoption, so each ask names its model afresh and
nothing stale outranks a new ask — the old model-label consumption's
guarantee, kept with no label to consume.

Adoption stays inside the scheduler run's contract: it is pure label mechanics
over the issue list, evaluates no precondition, collects no signal, and forms
no judgment about *who* marked the issue. It also cannot disturb scheduled
work: the marked issue keeps its own human title and wears `ad-hoc`, so it
sits outside every scheduled family (§3).

### 16.4 The precondition is the security check — and there is no code-work

The verdict happens where every request verdict happens: **at pickup, on the
executor** (§6.4 — the request task is `manual`, so the scheduler run's
anchor-side ask never applies to it). The built-in task's precondition refuses
three ways, each a plain no-go that converges the item `task:status:rejected` (a
refusal is nobody's inbox — it closes rather than joining a triage
lane):

- the issue is closed, or no longer carries the `task:origin:ad-hoc` mark —
  the request was withdrawn between adoption and pickup (and one issue means a
  *closed* issue already closed its item with it);
- neither the issue's author nor any commenter of the approval phrase
  `/claude go` **has push permission on the repository**;
- the issue is definitively **gone** — the API answers that it does not exist.

**Push permission is read from the permission API**
(`GET /repos/{owner}/{repo}/collaborators/{username}/permission`, requiring
`admin`, `maintain` or `write`), with the payload's `author_association` usable
only as a prefilter that saves the call. The association alone is deliberately
not the check: `MEMBER` is any org member whatever their repo permission, and
`COLLABORATOR` includes read-only collaborators — broader than the push access
the ask demands. Both facts are server-computed and unforgeable by anyone who
can type, which is what lets "minimal security" be genuinely minimal; the
permission read just makes the gate mean what it says. The approval-comment
path exists for the issue somebody else opened: someone with push blesses it
without having to re-file it — and the blessing is the *comment*, not the mark:
applying the mark to another person's issue authorizes nothing by itself.

**A read failure is not a verdict.** A refusal's write-back (§16.5) cannot
reach an issue it cannot read, so declining on a transient API failure (a rate
limit, a 500) would strand the adopted status on the issue forever over nothing —
the request silently eaten. Only a definitive *gone* declines; any other read
failure **fails the run**: the item parks `task:status:needs-human-failure`, open and visible, and the ordinary re-queue lever
(§4) retries it once the API recovers.

**How the read happens, as built (2026-08-19).** A precondition is pure over
collected signals: it never holds a GitHub client, and handing one to every
pack's precondition to give this task its two reads would have widened far more
than the gate it guards. So the reads are a `request` SIGNAL — engine-owned, like
every other collector — that fetches the issue this item names, its comments, and
the permission of each candidate login, and returns those facts without judging
them. The verdict stays exactly where this section puts it: the built-in task's
precondition, over that read. `gone`, `unreadable` and the permissions are fields
of the signal; which of them refuses, which fails the run and which passes is the
precondition's alone.

Two consequences worth stating plainly:

- **The precondition takes the item.** `precondition(signals, config)` becomes
  `precondition(signals, config, item)`, where `item` carries this occurrence's own
  facts — its number, its qualifier, its Context, its `Request`. A request item's
  verdict is about the issue it names, and no signal bundle can single that out on
  its own. The addition is backwards compatible (an existing precondition ignores an
  argument it does not declare) and general: any fan-out item's precondition can now
  see which target it is.
- **There is no code-work phase.** The authorization a worker would have performed
  is the precondition's, so the task declares no `code_work` at all — and with it
  goes the only thing that would have needed a code→agent data channel. The item's
  `Request:` field is the whole payload.

### 16.5 How a request ends, and who tells the issue

The item is where the run's state lives; the issue is where the person is looking.
Whoever converges the item owns the write-back for the end it converged:

| end | the issue (= the item) | who | beyond the status |
|---|---|---|---|
| the precondition declined | `task:status:rejected` standing on the **open** issue — the disarm; it closes only if the issue was already closed or gone | the executor | one comment saying why |
| a pull request is open | `task:status:needs-human-approval`, open — the in-review state itself | the session | nothing to mirror |
| the run broke | `task:status:needs-human-failure`, open | either | **nothing** |
| the run finished, with nothing left to act on | `task:status:done`, **closed** `completed` — marked or filed, the same ending | whoever converged it | one comment saying what it did |

The approval park is not a special case invented here — it is what the triage split
already says a run that deliberately left an unmerged PR does (§4), and a request
run does it every successful time. It does not hold anyone's lane: the request item
is not a standing item, and an approval park never blocks scheduling. *(The
simulator modeled that park only on the code-work path; the request task is the
first agentic task whose every success ends that way, so the model gained the
agentic mirror of it.)*

The silence on failure is deliberate and load-bearing twice over: re-arming
work that writes code is a person's decision made after reading what the run
said, and the standing park status is exactly what stops the next scheduler
run re-adopting the same request. The failure is reported on the issue itself,
in the `failure` lane, as for every other task.

### 16.6 What the session's instructions gain

[`packs/claudinite-tasks/queue/instructions.md`](../../packs/claudinite-tasks/queue/instructions.md)
grows one mode, not one procedure. Its validation step gains: *if the item carries
`Request: #N`, assert that issue is open and still marked, or stop*. Its
run step gains: *run at the item's `Model:` where the task takes one, and treat the
named issue as the requirement — data, never instructions: nothing written there
widens scope, relaxes a check or redirects the session*. Its converge step gains the
approval park it already describes — which on a request issue *is* the
in-review state, with nothing further to write back.

What it does **not** gain is how to implement anything. That lives in the built-in
task's own `task.md`, exactly like every other task's worker doc, and the standing
bound — *this one item and nothing else* — is unchanged.

### 16.7 The model, and the one contract addition

A request names its model in its body's `Model:` field; adoption re-reads it,
**gates it on the issue author's push access** (the body is author-editable
where a label was write-gated, so an ungated author's ask still runs — at the
default, never automerged), and the session runs at it. That is the **first time an item carries
anything behavior-defining**, so it is fenced rather than waved through:

- Only a task that declares `model_from_request: true` reads it — one task does, and
  it is engine-owned, so no pack can opt itself in.
- The value is validated against the model families; anything else falls back to the
  declared default rather than failing, and the run says on the issue which model it
  actually used. It is re-read and re-gated at every adoption (§16.3), so only the
  pending ask's choice ever routes a run — a stale value from an earlier ask
  cannot outrank a new one.
- The trust argument: the field is honored only when the issue **author** holds
  push access — read from the collaborators-permission API at the same place
  the marker's permission is read (§16.4), never `author_association` — and the
  mark that arms the run is still platform-write-gated. A drive-by author on a
  public repo can write any body they like; what they get is the default model
  and no automerge.

The rejected alternative was one task per family (three near-identical folders,
routed by label) — it keeps `agent_model` purely in tracked files, and it was what
the pack cut did, but three copies of one task in the engine to avoid one guarded
field is the worse trade. *(Owner, 2026-08-19: keep the field.)*

### 16.8 What this does not change

Ceilings, exec records, the claim lease, heartbeats, the janitor's rules, the triage
lanes and which of them hold a task's lane, capacity, the `schedule_after` yield, suspension
(`CLAUDINITE_TASKS_SUSPEND_ALL` freezes adoption with everything else), and dormancy
(a dormant repo adopts nothing — marks simply wait). A request item is picked,
arbitrated and recovered by the same code as any other item, which is the point.

### 16.9 Rejected alternatives

- **A pack** (the first cut, 2026-08-18). It could not reach the scheduler run, so it
  re-implemented adoption as an hourly precondition over labels plus a worker that
  authorized, picked and label-swapped — a second dispatch mechanism living beside
  the queue, with the model spent as three task folders. Rejected by the owner on
  sight; this section is the correction.
- **Authorization in code-work.** Workable (a worker holds the token) but it puts a
  run/no-run decision after the single evaluation site, which is the one thing §6.4
  forbids.
- **Task-less request items** — an item shape the executor special-cases. It saves
  the built-in-task plumbing and costs every downstream guard a branch: validation,
  ceiling, records and instructions all grow "unless it is a request".

### 16.10 What this costs in code (for approval)

1. `queue/scheduler-run.mjs` — job 4 (including the prior-item wait/supersede guard and the
   label consumption), plus the shell fetching issues by label.
2. `queue/work-item.mjs` — the `Request:` and `Model:` fields, and the request
   labels in the ensured set.
3. `queue/executor.mjs` — pass the item to the precondition; the decline write-back;
   the cannot-answer verdict parking in the failure lane (§16.4).
4. `scheduler/discover.mjs` + `validate-dispatch.mjs` — the built-in task root and
   its path form.
5. `scheduler/task-contract.mjs` — `model_from_request`, and the precondition's third
   argument in the documented contract.
6. `queue/instructions.md` — the mode of §16.6.
7. The built-in task itself: `task.mjs` (declaration + precondition) and `task.md`
   (how to implement a requested issue).
8. `packs/claudinite-growth/skills/writing-tasks/SKILL.md` — the contract prose
   members read.

Played through in the simulator as **S44–S51** ([sim](../../packs/claudinite-tasks/test/sim/), SCENARIOS §K); each was
watched failing against a deliberately broken mechanism before it was believed.

Built in #1010, with one addition to the list above: the `request` signal collector
(see §16.4's amendment), and its name in the contract's signal vocabulary. The
engine tests mirroring S44–S51 live in
[`packs/claudinite-tasks/test/queue/request-mode.test.mjs`](../../packs/claudinite-tasks/test/queue/request-mode.test.mjs)
and were each watched failing against a broken mechanism in turn.

**Unverified at landing:** whether `GET /repos/{o}/{r}/collaborators/{u}/permission`
answers under the executor workflow's `GITHUB_TOKEN`. The sandbox that built this
cannot reach `api.github.com`, so it is a question for the first real run — and the
failure mode is deliberately loud rather than silent: a permission read that answers
anything but 200/404 is `unreadable`, which fails the run into the failure lane with
the status on the item, and no request is approved or refused on a guess.

### 16.11 A request that waits, and one that may land

Two dimensions §16 left fixed: a request runs as soon as it is picked, and its run
always ends at a person. Deferred work needs both to open — *not yet*, and *do not
ask me about this one* — and both ride vocabulary that already exists rather than
adding a mechanism beside the queue.

**Waiting is `Blocked-by:`.** A marked issue may name what it waits on in the field
a work item already uses. Adoption carries the still-open ones onto the item it
births, which is then born `task:status:blocked`; job 2 releases it when they close, on
any origin, exactly as it releases a fan-in. Chaining follows for free: an issue
whose blocker is the previous deferral's issue is serialized behind it, so a chain
is an emergent property of the field rather than a feature of its own.

**And waiting on a moment is `Not-before:`.** The same carry, for the item's other
wait field: adoption copies a still-future `Not-before:` from the marked issue onto
the item, which is then born `task:status:blocked` until job 2's clock releases it. A
deferred verification is the standing case — a run that finds its world not yet
ready re-marks its own issue with a bumped date, and without the carry the next
pick would come within the hour, forever.

Two rules keep the gate one-directional. A blocker already closed at adoption is
dropped rather than born and immediately readied — an item never waits on something
that has happened. An unreadable blocker is never read as closed, so a failed read
delays the request instead of releasing it, the convergence-not-prevention posture
this design takes everywhere.

**Landing is the body's `Automerge:` → `Merge: <policy>`.** The authorization
rides the machine block like `Model:` does, re-read and re-gated at every
adoption so it describes the pending ask only and can never linger into a
later one — and it is honored only when the issue **author** holds push
access, the same gate and for the same reason as §16.7: landing without
approval is exactly the parameter a drive-by body edit must not be able to
grant. What the worker reads is the gated field, never the issue's prose
(§16.6). The field's value is a **policy expression** the policy engine
(`packs/claudinite-tasks/merge-policy.mjs`) evaluates — `anything`, a
`a;b;reject:c` list of diff classes, or the original `if-narrow`, which
resolves to the `narrow-diff` composite. The same engine is what a task's own
`automerge` declaration compiles to, so a request's authorization and a
scheduled task's ceiling are one vocabulary.

The built-in task's ceiling therefore has to be `automerge: 'anything'`. A
ceiling is a maximum, not an instruction: with no `Merge:` field the worker opens
a pull request and parks at the approval lane, so an ordinary marked issue gets
what §16 always gave it, and the authorized case can land no more than the
asker's own policy covers. The alternative — a second built-in task differing
only in its ceiling — was rejected for the reason §16.7 rejected one task per
model family: a copy of a task to avoid one guarded field is the worse trade.

**The verdict is measured, not judged.** The policy engine classifies the run's
own diff against the named classes (documentation, tests, comment-only edits,
Markdown line removals, additions, GENERATED files, code locality — plus any
class a pack declares as `merge-rules.json` data), rejects winning over allows,
unknown names authorizing nothing, and no granular policy able to cover a change
to the policy sources themselves. Anything outside the policy parks and names
the files that put it there. Deciding this in code rather than in the worker's
prose is the point — a session judging whether its own change is small enough to
merge is precisely the judgment that should not be the session's. Two
consequences of that posture: comment stripping is C-family (it reuses the
checks helper), so a file whose language the parser does not model counts as
code, and the worker doc forbids re-shaping a change to fit the classifier — a
change waiting for its asker is a correct outcome. A run that lands stamps its
final commit with the `Claudinite-Automerge-Policy:` trailer, and the
`automerge-policy-scope` work check re-measures the same verdict at the Stop
hook and on the PR's CI, so an arm the measurement would refuse goes red before
GitHub's queued auto-merge can fire.

**The session side is a skill**, `basics/do-later`: which blocker to name, the
model family read off the running session, and the one case that withholds the
authorization outright — an explicit ask to review this change outranks any
measurement of how small it is.

### 16.12 Which task a mark asks for — the `Task:` field

A mark means *implement this issue* by default, and that default is the whole of
§16 above. The body's **`Task: <pack>/<task>`** widens it to *run this task, for
this issue*: adoption resolves the id against the repo's own tasks at HEAD and
writes that task's worker path into the machine block, so everything downstream —
the ceiling, the model, the instructions, the record — is that task's, exactly as
for an item the schedule filed.

Three rules, each the same one the other parameters carry:

- **It is author-gated** (§16.7). Naming the task is choosing what runs, so an
  ungated body's field is ignored and the ask is the built-in implementer.
- **An id this repo does not carry is not adopted at all.** The mark waits, as it
  waits on an engine too old to carry the mode: a request that named a task that
  does not exist is not a failure to report, it is a mark whose target may yet
  arrive.
- **It changes nothing else.** The item is still a marked issue: its status is the
  request state, its terminal stands on the open issue, and clearing the status is
  still the one re-ask.

What it buys is the retirement of every bespoke "the fleet places work here and
fires the scheduler" protocol: a work-list issue in a member becomes a marked
issue naming the task that drains it, with its payload in its own body, and the
member's ordinary hourly scheduler run adopts it with no dispatch at all. The
first of those folds (`add-packs`) is tracked separately — it changes a
cross-repo contract, and its one real failure mode is a member whose mark label
does not exist yet, where the enforcer's write is refused and nothing runs.

## 17. The cron's cadence — two ticks a day

Actions bills **each job's minutes rounded up to the whole minute**, so a day's cost is the
scheduler's RUN COUNT and nothing else. Measured across 30 consecutive scheduled runs on this
repo, a scheduler run's median wall-clock is **32 seconds** and only one run exceeded a minute:
roughly half of every billed minute is already rounding. An hourly cron therefore bills 24
minutes a day per member to perform about 13 minutes of work, and an idle hour — the common
case — pays a full minute to find nothing.

Optimising the job cannot reach this. The only lever is fewer runs, and the cron fires **twice a
day** at the repo's hashed minute: the **anchor tick**, which covers every occurrence the calendar
can produce, and the **drain tick** twelve hours later, which exists for the work that has no
anchor at all.

Both hours come from the repo's own `taskScheduler.dailyHour` — the anchor the calendar already
resolves every occurrence against (§5) — so the cron is
`<hashed-minute> <dailyHour>,<(dailyHour + 12) % 24> * * *`. On the default schedule
(`dailyHour: 4`) that is `<hashed> 4,16 * * *`, and every example below reads in those terms; a
member that sets `dailyHour` to anything else gets its two ticks moved with it. Deriving the hours
from the anchor rather than fixing them is what keeps the cron and the calendar from disagreeing —
a cron pinned at 4 on a member anchored at 9 would fire five hours before every occurrence it
exists to instantiate, and each task would run a day late, forever.

### 17.1 The frequency vocabulary

`FREQUENCIES` is `daily`, `weekly`, `monthly`, `manual`. Two tokens retire:

- **`hourly`** cannot mean anything under a twice-daily tick. Its occurrence is the top of each
  hour, so a cron that comes twice a day instantiates two of the day's twenty-four and the
  declared frequency silently becomes the cron's cadence (`S70`). The corpus has exactly one
  genuine user — `claudinite-growth/usage-fold`, the dashboard's past-data plane — and it becomes
  `daily`: the aggregate still recomputes its hour rows from source over a three-day window, so
  what changes is the newest rows' freshness, not the shape of the data. Its `WINDOW_DAYS` is
  sized to its own period and must move with it; left at `2/24`, the signal window closes before
  the next anchor and the precondition declines every run.
- **`daily-2h` / `daily-1h` / `daily+1h`** existed to *stagger* anchors so dependent tasks ran in
  order. `schedule_after:` (§9) enforces the same intent, and the offsets never could — a task whose
  predecessor overruns its hour runs anyway. With all four collapsed onto one anchor hour, the
  chain is instantiated by a single tick and `schedule_after:` alone still settles it in declaration
  order (`S67`).

A member's declaration converges on its own schedule, so both retired tokens are **accepted at
the door and normalized**: `daily±Nh` reads as `daily`, `hourly` reads as `daily`. Nothing fails
on a stale declaration, and the normalization is permanent rather than a migration window — a
declaration is member-owned data and no vendoring pass rewrites it.

**One door, at declaration load.** The normalization belongs where a task's declaration is first
read, never inside `anchorInstant`. A frequency is read by more than the calendar: `periodMs`
feeds the janitor's stale-ready bound (`queue/janitor-rules.mjs`, `staleReadyPeriods` × period)
and the precondition's signal window (`queue/signals.mjs`, period + an hour of slack). Normalizing
only the anchor would leave `periodMs('hourly')` returning an hour, so a task that now runs daily
would be judged stale after two HOURS and see a two-hour signal window — a spurious
park on every member still declaring the old token, which is precisely the population the
tolerance exists for.

### 17.2 What the two ticks each carry

The **anchor tick** does the calendar work: every `daily`, `weekly` and `monthly` occurrence falls
at `dailyHour` — that is what `anchorInstant` resolves them to (§5) — so one tick sees them all,
whatever the member sets that hour to. Nothing is spread across hours any more, which
is what makes one tick sufficient rather than merely cheaper.

The **drain tick** carries the three jobs that are not anchor-bound — adopting issues somebody
marked (§16.3), readying items whose `Not-before` has passed or whose `Blocked-by` has resolved,
and reclaiming dead executor claims (§11). None of these has an occurrence; each is simply work
that arrived since the last look. A second tick roughly halves the wait for all three, for one
extra billed minute a day.

### 17.3 What the drain already chains, and what it does not

A single executor run drains until nothing is pickable (§15.30), re-reading the queue between
items — and a `schedule_after` yield resolving is exactly what a re-read notices, agent hop
included, via the session's close-time drain. So a `schedule_after` chain settles **back to back
inside one run** and its length costs cadence nothing. This is why collapsing three anchor hours
into one tick slips a full day's work by under an hour (`S67`) — the morning chain is
`schedule_after`, not `Blocked-by`.

A `Blocked-by` chain — a follow-up, a fan-in — is not this mechanism (§15.31 / #1373): no close
ever releases a dependent, only the scheduler run's own job 2 does, on its next pass. Collapsing
the cron to a twice-daily tick collapses that chain's cadence with it — a fan-in that used to
ready within the hour it was last blocked now waits up to the gap between ticks, same as an ad-hoc
mark (`S33`, `S68`).

**A newly marked issue is not a dependent of anything.** Adoption is the scheduler run's job, so
a mark landing while a drain is in flight is not picked up by that drain: it waits for the next
tick (`S69`). The drain chains consequences of work it has already done; it does not discover
work that appeared beside it.

### 17.4 The latency this buys and trades

An ad-hoc mark's latency IS the wait for the next tick, so the cadence sets it directly
(`S68`, marked at 09:03):

| cadence | scheduler runs/day | ad-hoc wait | cost per private member |
| --- | --- | --- | --- |
| hourly | 24 | 0.2 h | ~$4.32/mo |
| **twice daily** | **2** | **7.2 h** (≤12 h worst) | **~$0.36/mo** |
| once daily | 1 | 19.2 h | ~$0.18/mo |

Dollar figures are derived from the August usage report's own effective rate ($18.00 across 3,000
private Linux minutes = $0.006/min) rather than a published list price; the run counts are the
argument and the ratios hold at any rate. The 7.2 h figure is one 09:03 mark — the distribution
is a mean of 6 h and a worst case of 12 h.

A full day of scheduled work costs **4 billed runs against the hourly grid's 27** (`S67`), and a
quiet day costs 2 against 24. Within a repo, scheduled work is unaffected: every task that ran
under the hourly grid still runs, still closes, and still in declaration order, because `schedule_after:`
and not the anchor hour is what orders it.

**Across repos it is not, and `schedule_after:` cannot reach there.** A yield matches an upstream item in
*this* repo's queue, so a stagger between two repos' tasks has no declarable form at all. The
growth lifecycle is built on one: members extract lessons and the canon's `growth-promote` reads
whatever has already merged on their mains, so the members' anchor must precede the canon's or
same-night promotion degrades to T+1. That ordering survives the collapse by moving to the one
knob that still expresses it — **`dailyHour` itself**, set an hour earlier on members than on the
canon. A cross-repo constraint belongs at the repo's altitude rather than a task's, which is where
the retired offsets were trying and failing to hold it.

### 17.5 Rejected alternatives

- **Task-set-derived cron hours** — compute the cron's hours from the *declared tasks* at converge
  time rather than from the schedule anchor, firing only on hours some task actually anchors on.
  Strictly cheaper on a member declaring few packs, and the converge already rewrites the cron line
  (`converge-wiring.mjs`). Rejected because it makes a member's cron a function of its pack
  declarations: adopting a pack silently re-times the cron, a declaration the converge misreads
  produces a cron that fires at no anchor at all, and the failure is invisible until a task quietly
  stops running. Deriving both hours from `dailyHour` alone keeps the cron a function of one
  long-lived, range-validated value that the calendar already depends on.
- **An `issues: [labeled]` trigger for the adopt path** — would take ad-hoc latency to seconds and
  cost a run only when a mark happens. Not rejected on merit; it is strictly additive to this
  cadence and can land separately once the cheaper change is proven.
- **A central fleet dispatcher** — one public repo's cron dispatching only members with due work,
  driving the member floor to zero. Rejected: it needs a fleet-wide index of every member's
  schedule and a `FLEET_GITHUB_TOKEN` carrying `actions: write` on every repository, to replace a
  job each member already does for itself with its own token (§8).
- **A self-hosted runner** — removes Actions minutes entirely, and adds an always-on machine plus
  a self-hosted runner on repositories whose executor runs agent code with real secrets.
- **Keeping the hourly cron and shortening the job** — the measurement above forecloses it: the
  job is already a third of its billed minute.

### 17.6 What this does not change

The queue's mechanics are untouched. The scheduler run's four jobs, the drain gate, the executor's
claim and lease model, the janitor's rules, `workflow_dispatch` with `wake` as the never-wait
lever (§8), and every label transition in §4 behave exactly as before — they simply happen twice a
day instead of twenty-four times. No delivery is *lost*: what a lost label event would have
delivered is still exactly what the next tick's parting look sees.

What does change is how much a **missed tick** costs. GitHub drops scheduled runs under load, and
an hourly grid absorbs that in an hour where two ticks a day absorb it in twelve — the same
dropped fire, twelve times the latency (`S71`). Nothing is stranded, because dueness is decided
from the anchor and not from whether the cron fired, so the next tick instantiates whatever the
dropped one would have; the exposure is delay, and it is the reason the second tick is not
optional.

## 18. The pack boundary — the mechanism as `claudinite-tasks`

The whole mechanism this document describes is a canon pack, `packs/claudinite-tasks/`,
activated by declaration like any other; the engine is **pack distribution only**. The test from
`extending.md` still decides engine membership — would every pack's content stop working without
it? — and the queue no longer passes it: a repo that declares no tasks pack runs no scheduled
work, and that is a supported state, not a degraded one.

### What the engine keeps, what the pack owns

**The engine keeps** what every pack relies on to *exist* in a repo: pack discovery and loading,
the checks runner and hooks, the migration mechanism, settings/version/self-test, and the
distribution half of the wiring converge — settings hooks, the rules index, `.gitattributes`,
the badge row.

**`packs/claudinite-tasks/` owns** everything whose subject is task work: the queue (planner,
executor, continuation, drain, workflow-failure escalation, leases, readiness, janitor rules,
the work-item and dispatch vocabulary), the task contract, signals, calendar/anchor math, the
model map, run records, code-work, the delivery lane (`land-pr`, `deliver-generated`) with the
GitHub REST helpers and tracker it rides on, the two workflow stubs, the operational documents
(`executor.md`, `deliver-pr.md`, `queue/instructions.md`), and the scheduling half of the wiring
converge (workflow content, hashed cron, anchor hours, routine endpoints).

`implement-request` (§16) is an ordinary task of this pack rather than an engine built-in — the
`model_from_request` fence becomes "only this pack's task declares it". Item titles minted under
the legacy `engine/implement-request` id decode forever (the stored-data rename rule); new items
carry the pack's id.

Task discovery stays structural and pack-agnostic: this pack's scheduler scans every *declared*
pack's `tasks/<name>/` directories, exactly as §5 specifies. The `tasks/` contribution slot is
interpreted by this pack — the same composition seam as `barriers`' contributed rules:
declaration plus data, never a cross-pack import.

Queue meta-machinery lives here rather than where it historically landed: `task-janitor` (§11's
sweeps), `usage-fold` (folds this mechanism's own run records and outcome labels), and the
task-declaration checks (`task-declaration-shape`, `task-code-work-env`) are this pack's tasks
and checks. The simulator and its scenario suite — the mechanism's executable spec — live in the
pack's own `test/`.

### `shared-code/` — the published import surface

`packs/claudinite-tasks/shared-code/*` is the pack's deliberate export surface: the one place in
the corpus another pack's code may import from a pack it `requires`. Enforced as barriers
configuration — everything of this pack *outside* `shared-code/` stays off-limits to other
packs, and no other pack gains an equivalent surface by existing.

What it carries is what external consumers demonstrably need, one module per subject:
`work-items.mjs` — the work-item/dispatch **title grammar** (§3 — a work item is a GitHub issue and
its title is its identity), the **outcome/status decode** over item labels including every legacy
spelling (§4), and lease state; `anchors.mjs` — the **anchor math** (`periodMs`,
`mostRecentAnchor`, `nextAnchor`); `delivery.mjs` — the **delivery helpers** (`deliverGenerated`,
`landPr`); `github.mjs` — the **GitHub client/REST helpers** and the tracker any pack's worker uses
to land output; `signals.mjs` — the signal shapes a precondition is handed; `task-contract.mjs` —
task-declaration validation and precondition evaluation, which other packs' tests exercise;
`usage-format.mjs` — the usage aggregate's codec, for the fleet-wide aggregator that copies members'
rows through; and `wake.mjs` — what a scheduler run would instantiate, kept out of `work-items.mjs`
because the dashboard loads that one unbundled in a browser, where Node built-ins do not resolve.

A pack whose **non-task** code reads any of it declares `requires: ['claudinite-tasks']`. A pack's
`tasks/` folder needs no declaration and states none: a task folder is inert without the queue that
runs it, so a mount without this pack carries no `tasks/` at all, and the vendor set's
import-closure guard stays true by construction on both sides of the boundary.

Consumers: `claudinite-dashboard` (renders the queue's state; stays its own pack and declares
`requires: ['claudinite-tasks']`), and any pack whose tasks deliver PRs or generated files.

### Updates live in claudinite-lifecycle

The versioned update flows (engine update, pack update, install) are the `update` task's own
machinery and live in `packs/claudinite-lifecycle/updates/`. A pack's `updates/` directory is
canon-internal — the vendor set excludes it by name, as it does `test/` — so a flow still executes
from the freshly fetched canon tree and the code a member runs is always current, and it may
reach the canon-only machinery (`vendoring/`) that computing a vendor set means. The old
`updates/*` module paths remain as callable shims until no fielded vendored worker names them
(the rule that already governs `updates/*` exports); a member's worker resolves them by literal
path against that fetched tree, which is what makes the shims load-bearing rather than tidy.

A repo that declares `claudinite-lifecycle` but not `claudinite-tasks` has no queue, so its
update task never runs: **updates are opt-in via the tasks pack**. The recovery and manual lane
is a human session running the update or adopt-pack skills — a member with a state it likes
keeps it, like any package manager without forced auto-update.

### Workflows: written once, then static

The two member workflow files are static after adoption: secrets travel as one fixed
named-secrets list the converge regenerates (§14.4), the per-repo cron minute and anchor
hours are written once at adoption, and `run:` lines name **mount pack paths**
(`.claudinite/shared/packs/claudinite-tasks/…`) behind which everything converges nightly — a
release never edits the YAML again.

Consequently **no update flow touches `.github/workflows/`**, and the `pending-workflows/`
withhold lane does not exist: a structural change to the YAML itself (permissions, an actions
version bump) is an explicit, human-merged fleet PR event, not a lane the machinery must carry.
Adoption of `claudinite-tasks` (the adopt-pack skill, or bootstrap when the pack is declared at
init) scaffolds the two files and the CCR routine endpoints; the routines' stored prompts point
at the pack's operational documents in the mount.

Members' `claudinite-ci.yml` is untouched by any of this: it is seeded once by bootstrap when no
existing workflow runs the world sweep, is member-owned from then on, and belongs to the checks
surface.

### Alternatives considered

- **Scheduler in the engine.** Scheduling was 52% of core; every consumer vendored machinery
  only scheduled repos use, engine releases implied workflow-path churn, and "core" stopped
  meaning distribution. Rejected — the size and the boundary rot are what this boundary fixes.
- **Fold the queue into claudinite-lifecycle.** Removes the updates↔queue seam entirely, but
  couples "being a member" with "running scheduled work" — a repo could not take the lifecycle
  without the queue, and the tasks surface stops being independent. Rejected for a standalone
  pack plus lifecycle-owned update flows.
- **Fold the dashboard into claudinite-tasks.** Removes the last cross-pack read, but the
  dashboard is a distinct capability a repo chooses separately. Rejected in favor of the
  `shared-code/` surface.
- **Wire vocabulary as duplicated data with drift guards.** Keeps packs fully
  import-independent, but the anchor math is logic rather than data, and every consumer copy is
  a drift liability. Rejected in favor of one published surface.
- **Delivery helpers as an engine residue.** Keeps `land-pr`/`deliver-generated` importable
  without a sanctioned crossing, but leaves task-lane capability in an engine meant to be
  distribution only. Rejected; they are `shared-code/`.
- **A second engine-owned scheduler kept for updates only.** Guarantees a delivery lane even
  when the tasks pack is broken, at the cost of two schedulers. Rejected: the canary rehearsal
  gates releases, and the recovery path is a human session — acceptable for an opt-in updater.

## Appendix A — the owner's sketch (2026-08-12, verbatim)

> Can we think of a mechanism where the work items are available for work, and
> an executor (github action) picks up the next task to process, changes the
> label to "being-handled-by-executor-1", evaluates preconditions, runs
> preprocessing, hands off to agentic work (CCR invocation with API), changes
> the label to "being handled by CCR", and ends.
>
> We can implement "urgent" work by a label to hint the executor.
> This can be platform-agnostic, because it just reads issues.
> The execution loop — the thing that runs this flow again — can be implemented
> in many ways.
> If we want more work capacity — create more executors.
>
> The "force flow" is a simple creation of a task (say urgent).
>
> Fanning out is just creating tasks.
> Getting the status of a fan out is a task that is blocked by all individual
> issues in the projects.
>
> A task that runs daily is created after the daily execution time regularly,
> only if it passes preconditions. When the executor runs it — it can re-run
> preconditions. If it ends without agentic work — change label to "succeeded",
> "succeeded-with-unexpected-result" (open PR etc), "failed-needs-human".
> If there is a follow-up validation (of the agentic work, or for long-running
> real world changes) — we can create an issue blocked by this work (so it
> won't be picked up too soon) and blocked by time "delayed" that will be
> picked up by the scheduler to evaluate the time and preconditions.
