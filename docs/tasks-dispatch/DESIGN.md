# Task dispatch without slots — the work-item queue

Status: **agreed in shape; not yet built.** A continuation of the owner's
sketch (2026-08-12, reproduced in Appendix A), played against twenty timed
scenarios ([SCENARIOS.md](SCENARIOS.md)) and the field's prior art
([RESEARCH.md](RESEARCH.md)), with the owner's eight decisions of 2026-08-13
recorded in §15 and folded into the sections they changed. The phase plan
belongs to a tracking issue, not here. It supersedes
the slot machinery of
[per-project-scheduling DESIGN §3–§5](../per-project-scheduling/DESIGN.md) and
amends several of its §12 decisions (each amendment is named where it happens).
What it does **not** touch: the task folder anatomy (§1), the precondition
contract, prework and its secrets model
([task-prework DESIGN](../task-prework/DESIGN.md)), the outcome ceiling, the
security posture (the issue is data; behavior comes from tracked files), and the
usage-metrics records.

The shape in one paragraph: **work items are issues, available for work; any
number of executors pull from them.** A thin generator tick gives every
recurring task a standing work item at its anchor and flips blocked items
ready — pure label mechanics, no preconditions, no signals. An executor — a
GitHub Action by default, but anything that can read issues — picks up the
next ready item, claims it by label, evaluates the precondition (the only
place it ever runs): on a go it runs prework and hands off to agentic work (a
CCR session invoked by API); on a no-go the item **rolls** — stamped
not-before the task's next anchor, blocked, reason recorded — so the item
itself carries "asked, declined, wakes at T". Follow-ups, fan-outs, urgency,
and one-off forcing are all just *creating or waking work items*. There is no
slot id, no run-ledger watermark, no exclusive claim, and no label-event
re-arm.

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
  ledger read; the standing-item model (§5) removed it again — the tick is
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

1. **The generator** — a thin scheduled tick (the repo's one cron, unchanged
   rule). Three jobs, all deterministic label mechanics over the issue list:
   *instantiate* each recurring task's standing item when its time comes,
   *ready* blocked items whose dependencies have resolved and whose not-before
   has passed, and *reclaim* dead executor claims. It evaluates no
   preconditions and collects no signals (§5); it executes nothing.
2. **Executors** — any number of pull workers. Each iteration: pick the next
   ready item (urgent first), claim it, evaluate the precondition — the only
   place it is ever evaluated — then on a go run prework and either finish
   (agentless task) or invoke the agentic phase and hand the item to it; on a
   no-go, roll a scheduled item to its next anchor (§5). An executor is
   platform-agnostic by construction: its whole interface is issue read/write
   plus the repo at HEAD. More capacity = more executors.
3. **Agents** — CCR sessions, one per handed-off item, invoked by the executor.
   An agent executes its one item's task file, verifies its outcome ceiling,
   and converges the item to a terminal state.
4. **The janitor** — unchanged in role, smaller in scope: dead executor claims,
   dead agent claims, stale-item escalation, queue health review. The re-arm
   retires (§11).

The queue itself is the repo's issues, and under the standing-item model that
sentence is complete: everything the system knows — including "this task was
asked, declined, and wakes again at T" — is on a work item. No plan file, no
watermark, no ledger read. The tick is a pure function of the clock and the
issue list; which is what the sketch means by *visibility into state*.

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

Execute the Claudinite task above.
The Context section below is binding scope — do not re-decide it.

### Context
- <the creating precondition's binding lines, verbatim — unchanged>

### Delivered by prework
- <written by the executor at hand-off, unchanged shape>
```

Everything behavior-defining — model, outcome ceiling, worker content, prework
command — is still read from the tracked task files at HEAD, never from the
issue. A work item whose task the repo no longer carries is closed as obsolete,
exactly like today's exit-14.

**Origin marker.** Items the generator creates carry `origin:schedule`; items
created by hand, by a task, or by a fan-out do not. The generator's dedup
guards (§5) count only `origin:schedule` items, so scheduled work and ad-hoc
work never suppress each other — a pending follow-up does not silence tomorrow's
occurrence, and an urgent hand-created item does not consume it either. A task
whose precondition should care about open follow-ups can see them through the
`issues` signal, as task-specific logic where it belongs.

## 4. The state machine

```
                     ┌────────────► closed  outcome:obsolete
                     │                    (precondition no longer holds; task gone)
 created ─► task:blocked ─► task:ready ─► task:executing ─► task:agent ─► closed  outcome:done
            (only when       (queue)       (claimed by an     (handed to        closed  outcome:delivered
             Blocked-by /                   executor)          a CCR session)   open    needs-human
             Not-before
             present)
```

Labels, the full vocabulary:

| label | means | applied by |
|---|---|---|
| `task:blocked` | waiting on `Blocked-by` issues and/or `Not-before` | creator |
| `task:ready` | available for pickup | creator or the tick |
| `task:urgent` | modifier: pick before any non-urgent item | creator (write-gated, like every label) |
| `task:executing` | an executor holds the claim | executor, on claim |
| `task:agent` | an agent session owns it | executor, at hand-off |
| `outcome:done` | succeeded; nothing pending (closed) | executor or agent |
| `outcome:delivered` | succeeded **and left a live artifact the world still has to act on** — an open PR awaiting review, an armed auto-merge, a store submission (closed; usually paired with a validation follow-up, §9) | executor or agent |
| `outcome:obsolete` | never ran: the pickup-time precondition said no, or the task is gone from the repo (closed as not planned) | executor |
| `needs-human` | failed, or anomalous — the one triage state (open) | anyone, incl. janitor |

This is the sketch's lifecycle with two adjustments, both argued for rather
than assumed:

- **Executor identity is a claim comment, not a label.** The sketch's
  `being-handled-by-executor-1` puts an unbounded set (executor identities) into
  a vocabulary that must stay small and queryable; every new executor would mint
  a label, and a query for "what is executing" would have to know every
  executor's name. One state label (`task:executing`) answers the query; the
  claim comment — which the lease protocol requires anyway — carries *who*
  (executor id, run URL) and *when*. Same for `task:agent`: the hand-off
  comment names the CCR session.
- **`succeeded-with-unexpected-result` becomes `outcome:delivered`, and it is
  narrower.** "Unexpected" would blur two things that must not blur: a run that
  legitimately left a pending artifact within its ceiling (open-pr task → open
  PR: *expected*, but the world hasn't finished with it), and a run that
  violated its ceiling (a `none` task that opened a PR) — the latter stays a
  **failure** converging to `needs-human`, exactly as today's `verify-outcome`
  enforces. `delivered` marks the first case only, and is the natural anchor
  for a validation follow-up.

Terminal-state discipline is unchanged: every item converges exactly once to
exactly one of the four ends, with one comment saying what happened.

**Label writes are granular, always** ([RESEARCH](RESEARCH.md) §2): add and
remove named labels (REST POST/DELETE), never write the label *set* (PUT,
GraphQL `updateIssue`) — a set-write replaces from a stale snapshot and
clobbers concurrent transitions, a bug class GitHub's own CLI shipped
([cli/cli#4861](https://github.com/cli/cli/pull/4861)). With multiple
executors and a tick all moving labels, this is a correctness rule, not a
style preference.

**The road back from `needs-human`** (SCENARIOS S12/S19, F7): a human who has
resolved the cause re-queues the item by removing `needs-human` and applying
`task:ready` — the sanctioned retry lever, write-gated like every label
operation here. The next pickup re-runs the precondition (§6.4), which is what
makes the retry safe even when the failed run half-did its work. Alternatively
the human closes the item (optionally superseding it with a forced retry,
§8); nothing mechanical ever re-queues a `needs-human` item.

## 5. The generator — the standing work item

**The tick never evaluates a precondition and never collects a signal**
(owner model, 2026-08-13). Creation is calendar-only: at a task's anchor, the
tick creates its work item *unconditionally* — the precondition speaks later,
at pickup, on the executor (§6.4), which is where the original sketch had it
all along. What happens on a no-go is the model's whole trick: the item is
**not closed** — the executor stamps it `Not-before: <the task's next anchor>`,
swaps it back to `task:blocked`, records the reason, and the item **rolls
forward**. The next anchor readies it again; the next pick re-asks. One ask
per period, exactly — go/no-go preserved — and the memory of "evaluated,
declined, ask again at T" is carried **on the item itself**, in the one place
this design keeps state.

```text
tick(now):
  if dormant: return                            # before any read, as today

  # ---- job 1: instantiate (calendar-only; no preconditions, no signals) ----
  for task in discoverTasks():                  # NO ordering requirement — the
    if task.frequency == 'manual': continue     # `after` yield is pick-time (§6.1)
    A = mostRecentAnchor(task.frequency, config.taskScheduler, now)
    family = issues(title == "[claudinite-work] <pack>/<task>",
                    label "origin:schedule", state ALL)
                    # REST issue list, never the search index (S6/F11)
    # F16 self-heal first: nothing documents that a REST list from another
    # node sees a creation seconds old, so a stale list can let a duplicate
    # standing item through. Assume it will happen rather than that it won't:
    # close every open family item but the OLDEST, outcome:obsolete, with a
    # dedupe comment. Serialized by the tick's concurrency group.
    if count(i.state == OPEN for i in family) > 1: closeAllButOldest(family)
    if any(i.state == OPEN for i in family):    continue  # the standing item
                                                          # already exists
    # the occurrence guard has TWO halves (F13, caught by the simulator): an
    # item CREATED at-or-after A covers this occurrence — and so does an item
    # CLOSED at-or-after A, because a rolled item created in an earlier
    # period that ran and closed today consumed today's occurrence. With the
    # created_at half alone, the very next tick after such a close creates a
    # second item for the same occurrence: a double execution.
    if any(i.created_at >= A or i.closed_at >= A for i in family): continue
    createIssue(title:  "[claudinite-work] <pack>/<task>",
                body:   taskPath,
                labels: ["origin:schedule",
                         family.isEmpty ? "task:blocked" : "task:ready"])
                # a brand-new task's FIRST item is born blocked with
                # Not-before = its next anchor — adoption must not fire
                # weekly/monthly tasks off-anchor (the old first-run concern)

  # ---- job 2: ready whatever is due --------------------------------------
  for item in issues(label "task:blocked", state OPEN):   # any origin
    {blockedBy, notBefore} = parseBody(item)
    if all(issues(blockedBy).state == CLOSED) and now >= notBefore:
      swapLabel(item, "task:blocked" -> "task:ready")

  # ---- job 3: reclaim dead executor claims (§11) --------------------------
  for item in issues(label "task:executing", state OPEN):
    if noActivitySince(item, EXECUTING_LEASH): stripToReady(item, comment)
```

And the roll, executor-side (the full pick flow is §6):

```text
on pick, verdict = precondition(signals, config):
  go     -> proceed (prework, hand-off, converge, CLOSE with an outcome)
  no-go  -> item carries origin:schedule?
              yes: Not-before = nextAnchor(task.frequency); ready -> blocked;
                   record the reason            # the item ROLLS — not an exit
              no:  close outcome:obsolete       # an ad-hoc item has no next
                                                # anchor to roll to (S17)
```

**What this dissolves, all at once:**

- **The evaluate-once ledger.** No `lastTick`, no Actions-ledger read, no
  grace fallback: "was this occurrence evaluated" is answered by the standing
  item's own `Not-before`. §1's side-channel complaint is fully satisfied
  again — the tick is a pure function of the clock and the issue list.
- **The 24-attempts cost (F10).** The tick evaluates nothing; the precondition
  runs once per wake, i.e. once per period per task. Signals are collected by
  the executor for the one picked task — the tick performs no GitHub reads
  beyond the issue list.
- **Declined occurrences were invisible in every earlier model** — no-go
  meant no item (or a ledger entry nobody sees). Now a quiet task's item shows
  its last ask, its reason, and its next wake, on its timeline. This closes
  the last gap in the sketch's *visibility into state*.
- **Forcing needs no item creation in the common case** (§8): the standing
  item exists, so force = wake it — strip `task:blocked`, clear `Not-before`,
  optionally add `task:urgent`. The same lever as the human re-queue (§4),
  which is no accident.
- **F9 (topological creation order) retires unbuilt**: `after` no longer
  wires `Blocked-by` at creation — see §6.1/§9 — so the tick's iteration
  order stops mattering.

**Titles carry no timestamp, and never will** (owner question, answered
plainly): every item of a task shares the bare title `[claudinite-work]
<pack>/<task>`; successive items are told apart by issue number, which is the
identity (§3). The optional qualifier exists only for deliberately concurrent
items (fan-out targets). Nothing ever parses a date out of a title — that was
the slot grammar, and it stays dead.

**The costs, named:**

- **The issue list's baseline changes meaning.** A quiet repo used to show
  zero open scheduler issues; now it shows one open (blocked) item per
  scheduled task, each stating its next wake. That is ~a dozen standing open
  issues here — read it as the dashboard it is: the issue list *is* the
  scheduler's state, which is what the sketch asked for. Filtering them out
  of "real issues" views is one label query (`-label:origin:schedule`).
- **Hourly tasks churn their item.** An hourly task that stays no-go rolls
  ~24 times a day: two label flips and a body edit per roll, on one issue.
  Cheap against API quotas, noisy on that item's timeline; the roll writes no
  comment (the `Not-before` bump is the record) so the noise is timeline
  events, not comment spam. Named and accepted — one issue absorbs it.
- **A long-quiet task's item lives for months.** That is the feature wearing
  its cost: the item is the task's standing status line, and its age is
  information ("quiet since June"), not staleness — the janitor's stale rule
  keys on `task:ready` age, which a properly rolling item never accumulates.

**Errored and forced items against the guards** (unchanged in substance from
the earlier draft, restated for the new shape):

- A **failed run** converges its item open + `needs-human` (a real exit — the
  roll is only for no-go verdicts, never for failures). The open item *is*
  the backlog guard: no new item until a human closes or re-queues it — one
  broken task, one triage item, however long it takes.
- A **forced ad-hoc item** (no `origin:schedule`) is invisible to both
  guards in both directions, whatever state it ends in — it neither
  suppresses nor consumes an occurrence (#749's property, kept).
- **Force-of-a-scheduled-task** is now the wake lever, not an item (§8), so
  the S15 same-title collision cannot arise from the common force at all; the
  pick mutex (§6.1) still covers a deliberately created concurrent item.

## 6. The executor — pick up, claim, prepare, hand off

An executor iteration, in code end to end (the reference implementation is a
job in the vendored workflow, triggered by `issues: labeled [task:ready]`
events for latency **and** by the tick's cron as the poll that makes lost
events irrelevant; `workflow_dispatch` for a hand-started drain):

1. **Pick**: list open `task:ready` items; order `task:urgent` first, then
   oldest-created. Two skip rules, both live reads at pick time:
   - **Same-title mutex** (SCENARIOS S15/F6): skip an item whose exact title
     (task + qualifier) has another open item in `task:executing` or
     `task:agent` — one task, one execution at a time; a fan-out's distinct
     qualifiers still parallelize. The skipped item is picked once its twin
     converges.
   - **The `after` yield** (SCENARIOS S24): skip a scheduled item whose task
     declares `after: [T]` while T's standing item is `task:ready`,
     `task:executing`, or `task:agent` — yield *while the upstream is live
     this cycle*, nothing more. A rolled upstream (blocked until its next
     anchor: it declined this cycle) does not block, and neither does one
     sitting `needs-human` — a broken upstream must not halt its dependents
     indefinitely, the same bound the old exclusive claim drew at three days.
     This is deliberately **not** a `Blocked-by` edge: a standing item that
     rolls never closes, so wiring `after` as blocked-by-the-item would
     starve every dependent of a quiet upstream forever — the one real trap
     in the standing-item model, caught in replay (S24).

   **The filters are advisory at pick time (F15)**: they read possibly-stale
   state, so two executors can pass them simultaneously and claim
   *different* items the filters should have serialized — a twin pair, or an
   upstream and its dependent. The per-item lease cannot see this (it
   protects one item, not one title). So after **winning** a claim, the
   executor re-verifies the filters against live state; if a conflicting
   item now holds an **earlier** claim (comment order — the same arbiter the
   lease trusts), it reverts its own claim to `task:ready` and moves on.
   Bounded (one revert per conflict), deterministic (comment order), and
   the earlier claim never notices (S32).

   Take the first survivor. None → exit quietly.
2. **Claim — the verified lease, unchanged in shape** (it earned its keep):
   read labels, abandon if `task:ready` is gone or `task:executing` /
   `task:agent` / `needs-human` present; swap `task:ready → task:executing` and
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
   - **The label swap is two API calls, not a CAS** — GitHub has no atomic
     label swap. That is fine *because* labels are not the arbiter: they are
     visibility and the pick filter; the claim comments arbitrate, so a torn
     swap can never mint a second owner. What it *can* do — executor dies
     between the remove and the add — is leave an open item with **no state
     label at all**, invisible to every rule that filters by state. The
     janitor gains the repair (§11): an open work item wearing neither a
     `task:*` state nor `needs-human` is off the state machine entirely →
     `needs-human`, a human's to look at (same posture as a malformed
     item).
3. **Validate in code**: the body's first line is a legal task path, the file
   exists at HEAD, the pack is declared, `task.mjs` parses. Task gone → close,
   `outcome:obsolete`, comment. Malformed → `needs-human` (possible forgery, a
   human must see it), unchanged from today.
4. **Evaluate the precondition — the only place it ever runs** (the sketch's
   "evaluates preconditions", now literally once). Creation was calendar-only
   (§5), so this is not a re-check of anything — it is *the* verdict, over
   signals the executor collects for this one task. On **go**: proceed, with
   the verdict's Context written into the body as the agent's binding scope.
   On **no-go**: a scheduled item **rolls** — `Not-before` stamped with the
   task's next anchor, `task:ready → task:blocked`, the reason recorded — and
   an ad-hoc item (no `origin:schedule`, so no anchor to roll to) closes
   `outcome:obsolete` with the reason commented (a follow-up whose world
   settled on its own, S17). **This amends §12.3's "the precondition is the
   only decision point" by re-siting, not weakening it**: still exactly the
   precondition deciding, still one decision point — moved from the scheduler
   run to the pick — and prework and the agent still may not skip; the
   doctrine's target (later phases inventing "new reasons to skip") is
   untouched.

   **This stays clean only while preconditions ask task questions, not
   calendar ones** (owner's condition, 2026-08-13). "Is there work?" is a
   question about the world; "has it been more than a day?" is the scheduler's
   own question leaking into a task, and under this model it is doubly wrong —
   the item already *carries* its schedule in `Not-before`, so a calendar
   precondition would be a second clock disagreeing with the first. Timing
   belongs to `frequency`, the anchors, and `Not-before`. The rule is
   **advisory** by owner ruling: no mechanical check (the property is not
   checkable), and the residual exposure is an item rolled with a calendar
   reason in its record — visible, and it costs a cycle, not correctness. The one live offender is resolved by
   ruling rather than grandfathered: **baselining's `ageDays > 1` gate is
   dropped outright** (owner, 2026-08-13: "the wrong precondition"). Its
   precondition becomes the work question alone — is the mount behind canon
   head, are migration notes unapplied — with cadence carried by
   `frequency: daily-2h` and nothing else. The corpus enters the new mechanism
   with zero calendar preconditions.
5. **Prework**, Action-side, unchanged contract: subprocess, task dir cwd,
   `required_secrets` as env, timeout, `CLAUDINITE_REQUEST_AGENT` conditional
   hand-off. One requirement now stated explicitly (SCENARIOS S8/F12): prework
   must be **re-entrant** — a dead executor's claim is reclaimed and the item
   re-picked, so prework can run again over its own half-done work (it already
   must survive this today, where a scheduler run dying mid-prework leaves the
   slot due; the contract just never said so). Failure → comment +
   `needs-human`, `task:executing` removed. Success,
   agentless task or no agent requested → converge now: `outcome:done` (or
   `outcome:delivered` when prework's payload names a live artifact), close,
   done — the quiet-on-success property survives as a *closed* item rather
   than no item, which is the better trade: the run is now visible.
6. **Hand off**: write `### Delivered by prework` / `### Why the agent is
   here` into the body (unchanged shapes), swap `task:executing → task:agent`,
   post the hand-off comment carrying a fresh **invocation nonce**, then
   **invoke the agent session via the CCR API** with a prompt naming exactly
   this issue and that nonce. The nonce exists because API invocation is
   **at-least-once under timeout retry** — a call that times out client-side
   may still have created a session, and the retry then creates a second
   (SCENARIOS S10/F5). The executor cannot distinguish "failed" from
   "unconfirmed"; the *agent-side lease* (§7) is what collapses the duplicates.
   Invocation failure after in-run retries → **revert** `task:agent →
   task:ready` with an attempt-counter comment (`handoff-attempts: N`); each
   later pickup retries, the tick cadence its natural backoff, and only at a
   bounded attempt count (~5) does the item converge `needs-human` with the
   API error quoted — so a transient platform outage costs nothing but delay,
   instead of converging every in-flight item to triage (SCENARIOS S9/F3).
   Either way a lost hand-off is a *synchronous, visible* event at the
   executor, not a silently missing label event (this is what retires the
   re-arm — §11, and the credential it costs is §12).

An executor run may iterate (claim → … → hand off, next pick) up to a
configured `maxItems`; the default is a small number, and each item's claim is
independently leased, so executor concurrency is safe at any width. One bound
ties the executor to its leash ([RESEARCH](RESEARCH.md) §2 — the
stalled-worker lesson): the executor job's `timeout-minutes` must be **≤ the
executing leash**, so a hung runner is killed by the platform before its
claim is reaped and re-picked — otherwise a zombie's prework runs beside its
replacement's.

**Idempotency, honestly (owner concern, 2026-08-13: "I'm not sure we can
guarantee all tasks to be idempotent").** Agreed — and the design does not
require it. The queue literature's blanket "make handlers idempotent" applies
to systems where duplicate *invocations* reach the handler; here every
duplicate-invocation path collapses at a lease **before work starts** (the
executor claim, §6.2; the agent claim, §7), so what tasks must actually
tolerate is much narrower:

- **Prework must be re-entrant** — a *sequential* re-run after a
  crash-and-reclaim (§6.5). That is convergence ("check what exists, continue
  from there"), not idempotency, and it is already required of prework today.
  Concurrent overlap with a zombie run is excluded by construction
  (`timeout-minutes` ≤ leash, above), not asked of the task.
- **Re-executed agent work passes through the precondition again** (§6.4),
  and the half-run's artifacts are on the item (Delivered section, the
  PR-number comments the agent posts as it works — the item is the run's own
  inbox/outbox). A re-pick therefore *sees* what already happened and
  converges `outcome:obsolete` instead of redoing it — check-before-act,
  carried by the mechanism, not by task-author discipline.
- The residual overlap cases are bounded by the **write ceiling**: the worst
  historical duplicate produced twin PRs — visible, closeable, never
  destructive.

And for a task that can promise none of this — a genuinely one-shot side
effect (a store submission, an external notification, a payment-shaped
action): the contract gains **`on_interrupt: 'requeue' | 'needs-human'`**
(default `'requeue'`). Declaring `'needs-human'` makes every recovery path
that would re-execute — leash reclaim (§11), hand-off retry (§6.6), the
human re-queue lever (§4) — converge to triage instead: **at-most-once plus
a human**. This is the ack-early/ack-late dial every queue exposes, and
Celery ships ack-early as its *default* precisely so non-idempotent tasks
are never silently re-run ([RESEARCH](RESEARCH.md) §1); here the safe-side
default stays `'requeue'` because most of this fleet's tasks are
sweep-shaped, and the one-shot minority declares itself. Running
more executors — a second workflow instance, a laptop, a k8s job — requires
only an issues-scope token; nothing about the queue knows how many exist.

## 7. The agent

Today's `executor.md` collapses: the trigger-identification dance
(`resolve-dispatch`'s exits 11/12/13, the two transports, the no-fallback rule)
existed because the session had to *discover* which label event started it. An
invoked session is told its item in its prompt — one issue number — and the
prompt is written by executor code, not by a human. What survives, verbatim in
role: validate the item in code before acting (never trust the prompt more
than a label event — re-resolve the task path at HEAD), honor the Context as
binding scope, run `task.md` at the declared model with the declared timeout
stated plainly, verify the outcome ceiling in code (`verify-outcome`), converge
the item (`outcome:done` / `outcome:delivered` / `needs-human` + comment),
print the `claudinite-task-exec` record, capture the session. One session, one
item, no queue awareness — unchanged, and now structural: the session never
receives a queue, only an item.

One thing is **added**, not carried over: **the agent claims too**
(SCENARIOS S10/F5). Because the executor's invocation is at-least-once (§6.6),
two sessions can arrive at one item. So the agent's first act, before any
work: post its own claim comment (session id + the invocation nonce from its
prompt, which must match the hand-off comment on the item), re-read, and the
**earliest agent claim wins** — the loser ends its session without touching
the item, exactly the read-swap-confirm shape the executor lease uses. This is
the same move the literature makes with single-use task tokens (a second
redemption of a Step Functions task token is rejected); GitHub gives us no
single-use token, so earliest-claim-wins stands in, as it already does one hop
earlier.

## 8. Urgency and forcing — creating or waking an item is the whole mechanism

- **Urgent** work is an item with `task:urgent`: picked first, and the
  `labeled` event gives it executor latency of one spin-up. Nothing else is
  special about it.
- **Forcing a scheduled task is waking its standing item** (owner model,
  2026-08-13). The item exists (§5), so force = strip `task:blocked`, clear
  `Not-before`, optionally add `task:urgent` — the same lever as the human
  re-queue (§4), which is no accident: "run this now" and "retry this now"
  are the same operation on the same object. The executor evaluates the
  precondition at pick like always; a no-go rolls the item again with the
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
- **`manual` tasks** are simply tasks the tick never instantiates: their items
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
by the tick (§5). Three patterns fall out, all from the sketch:

- **Follow-up validation.** A task whose run delivered something long-running
  (a store submission, an armed auto-merge, a real-world change that settles
  over days) ends `outcome:delivered` and creates its own follow-up item:
  `Blocked-by: #<this item>` (satisfied the moment this item closes) +
  `Not-before: <now + settle time>`. The tick readies it when the time passes;
  an executor then re-runs its precondition — which checks whether the world
  actually settled — and the item either runs, or closes obsolete because
  everything landed on its own. The "will anyone check tomorrow?" gap closes
  with machinery that is just two body fields.
- **Ordering, declared — the exclusive claim retires.** A task may declare
  `after: ['basics/baselining']` in `task.mjs`, and it compiles to the
  **pick-time yield** (§6.1), *not* to a `Blocked-by` edge: the executor
  skips the dependent while the upstream's standing item is live
  (ready/executing/agent) this cycle, and picks it the moment the upstream
  converges — or rolls. The distinction is load-bearing under the
  standing-item model: `Blocked-by` requires the blocker *closed*, and a
  standing item that rolls never closes, so wiring `after` as blocked-by
  would starve every dependent of a quiet upstream forever (S24 — the one
  trap found replaying the model). As a yield: on the late-fire night all
  chain items are created together, baselining runs first, extract and
  promote follow *the same night* in order; on the routine night where
  baselining's precondition declines and its item rolls, extract is pickable
  a minute later. Nothing is spent, no task claims a run, and the engine
  still never knows what baselining is — `after` names a task id, and the
  pick filter reads item states, generically. §12's exclusive-claim
  machinery (and its stated throughput cost) deletes. `Blocked-by` remains
  the right edge for what it is: dependencies on items that *terminate*
  (follow-ups, fan-ins).
- **Fan-out with a fan-in.** Fanning out is creating N items (§8). The fan-in
  is one more item — the status/aggregation task — created `Blocked-by` all N.
  It readies only when every child converged, and its precondition/prework read
  the children's outcome labels to report or escalate. "Getting the status of
  a fan-out" stops being a bespoke sweep and becomes an ordinary task whose
  edges the tick already evaluates.

Native GitHub issue dependencies (blocked-by/blocking — GA since Aug 2025,
API- and webhook-supported) and sub-issues *mirror* these fields: the tick
writes the native edge alongside the body field, buying the dependency UI for
free ([RESEARCH](RESEARCH.md) §2). The body fields remain the truth the tick
parses — they are portable to any tracker with issues, labels, and comments,
which is the platform-agnosticism the sketch asks for. One vendored module owns
parse/serialize of the two fields; nothing else touches them.

Cycles: the tick readies nothing in a `Blocked-by` cycle, forever, and the
stale escalation (§11) surfaces it as `needs-human` after ~2 periods — the
same convergence-not-prevention posture as the rest of the system. The tick
does not attempt cycle detection; the janitor's health review may.

## 10. Capacity and platform-agnosticism

The default deployment stays one vendored workflow — the repo's only cron,
rule unchanged — now containing the tick job and one executor job (the tick
runs first; the executor drains what it created, which keeps the common case's
latency at zero even without events). Event triggers (`task:ready` labeled)
give urgent and hand-created items sub-minute pickup. Scaling is a config
knob: the executor job's `maxItems`, a matrix width for parallel executor
jobs, or executors outside Actions entirely — the executor contract is "issue
read/write plus the repo checkout at HEAD", so a runner anywhere with a token
qualifies. Executor identity is self-declared in claim comments; the system
never enumerates executors, which is why adding one requires telling no one.

## 11. Recovery — what the janitor keeps, what dies

| failure | today | proposed |
|---|---|---|
| scheduler/tick miss or late fire | run-ledger catch-up math | same property from the occurrence guard (§5) — the next tick instantiates the most recent occurrence only |
| double tick | concurrency group + slot-title search | concurrency group + occurrence-guard search (same window, same answer) |
| lost label event | janitor re-arm (remove/re-add), 20-min grace, bounded by stale escalation | **retired** — executors poll on the tick's cron; events are latency sugar, never the only delivery |
| duplicate events / racing executors | claim lease on one implicit executor | same lease, N executors — the loser picks a different item |
| executor died mid-claim | — (executor was a session; janitor reclaimed via `agent-running`) | **the tick** (owner, 2026-08-13): `task:executing` with no activity past ~1h → strip to `task:ready` with a comment, so a dead executor's item is back in the queue within ~2h rather than ~25h. An executor iteration is minutes, not hours, and a lease checked once a day is not a short lease |
| agent session died mid-run | janitor: stale `agent-running` → `needs-human` after ~3h | same, on `task:agent` (a hand-off comment names the session, so the janitor can say *which* session died) |
| CCR invocation lost | undetectable (label event fired into the void); surfaced only by re-arm/stale | **synchronous**: the executor sees the API failure, retries, converges `needs-human` with the error (§6.6) |
| item never picked up | stale dispatch escalation, period parsed from the slot id's leading char | same escalation, period read from the task's declared `frequency` at HEAD (or a default for ad-hoc items) — no title parsing; the stale item converges `needs-human`, out of the queue |
| dependency never resolves | n/a | **the stale-ready rule cannot see it** — a blocked item is never ready (F14, caught by the simulator against S18's claim). The janitor gains a third rule: a blocked item whose blockers have not resolved for ~2 days gets an escalation *comment* — labels untouched, so the item still proceeds by itself the moment its blockers resolve; a human who decides it is dead closes it by hand |

The janitor remains an ordinary daily task and shrinks twice over: re-arm and
its grace window delete, and the **executing-leash reclaim moves to the tick**
— a deterministic label rule, serialized and hourly, which is exactly the
tick's kind of work. This amends the 2026-08-06 "all recovery lives in the
janitor" split, deliberately: the split's purpose was that recovery happen
*once, in one place, in code* rather than in every triggered session, and a
rule that runs once per tick satisfies that as fully as one that runs once per
day. What stays with the janitor is everything needing judgment or a longer
horizon — four rules and a review: the dead *agent* claim (`task:agent`
silent past ~3h → `needs-human`, the hand-off comment naming which session
died), the stale-ready escalation (unpicked past ~2 periods →
`needs-human`), the stuck-dependency sweep (F14 above — comment-only), the
stateless-item repair (an open work item wearing neither a `task:*` state
nor `needs-human` — a torn label swap's leavings, §6.2 → `needs-human`),
and the health review, which gains the queue (ready-item age, blocked-item
depth, outcome mix) as its subject and can now compute all of it from
issues.

Two leash constraints, made explicit by the validation review (2026-08-13):

- **The executing leash must exceed every task's prework timeout bound
  (F17)** — enforced as a wiring-time conformance check, not a convention.
  A prework legally allowed to outlive the leash is reclaimed *alive*, and
  the failure is not one duplicate run but a **livelock**: every tenure is
  reclaimed before it can finish, prework re-executes each cycle, and the
  occurrence never converges (S31's trace). The paired runtime rule: an
  executor **re-verifies its own lease at every state transition** (is my
  claim still this episode's earliest?) and abandons silently when it is
  not — which is what keeps a reclaimed-but-alive runner from handing off
  work it no longer owns.
- **The agent leash (~3h) assumes agent sessions finish or touch their item
  within it** — parity with today's stale `agent-running` sweep, stated as
  an assumption rather than discovered as an incident: a legitimately
  longer-running agent must comment on its item to reset the activity
  clock, or it will be declared dead.

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

**The token must be usable from the GitHub Action, and the plumbing is the
`required_secrets` plumbing, reused exactly**: the wiring converge stamps each
endpoint's secret into the executor workflow's env by name, so the executor
job — the *only* place invocation happens — reads it as ordinary environment.
This works because Actions secrets are reachable Action-side and nowhere else
in a task's life, and Action-side is precisely where the executor runs; the
agent session it invokes still carries no secrets, unchanged. Baselining asks
the owner (the standing-issue posture) for any endpoint secret the repo
declares but has not configured; until then the tasks naming that endpoint
converge `needs-human` at hand-off with the missing secret named — the same
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
`after` and `on_interrupt`), preconditions as the only decision point (evaluated at admission and
at pickup, §6.4), prework and `required_secrets`, outcome ceilings and
`verify-outcome`, the claim lease, one-agent-one-item, terminal convergence,
`claudinite-task-exec` records and the usage fold (plus outcome labels as a
second, queryable census), the janitor as sole recovery site, dormancy (the
tick's first gate, before any read), the issue-is-data security posture, the
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

1. **Labels**, create-if-missing: `task:ready/blocked/executing/agent/urgent`,
   `origin:schedule`, `needs-human`, the `outcome:*` family.
2. **Two vendored workflows**: the tick (cron at the repo's stable hashed
   minute, plus `workflow_dispatch` so an operator or a migration never waits
   for the cron), and the executor (invoked as the tick's drain job and by
   `labeled` events on `task:ready`/`task:urgent`; carries the stamped
   secrets env — below).
3. **Config**: `taskScheduler.dispatch: "queue"`, the endpoint map (§12), the
   anchor schedule.
4. **Nothing else** — no seed items, no ledger to initialize. The first tick
   after wiring creates every task's first item `task:blocked` until its next
   real anchor (§5's first-item rule, S25), so adoption never fires weekly or
   monthly work off-anchor on the least-proven repo. The adoption smoke test
   is the force lever: wake one item by hand and watch it converge.

Pre-existing issues from the slot mechanism (`[claudinite-task]` titles) are
invisible to the tick — the family list is title-filtered — so bootstrap into
a repo with old-vocabulary issues neither reads nor touches them (S29); they
are the old mechanism's to drain or a human's to close.

### Updates — when the mechanism changes

The mechanism's only durable state is the items, and an item is deliberately
schema-thin: a title naming a task, labels naming a state, two body fields,
comments as record. Everything else — anchors, guards, yields, leashes,
verdicts — is **computed fresh at every tick and pick from the engine and the
declarations at HEAD**. That one property decides every update question:

- **A task declaration change** (frequency, `after`, precondition, secrets)
  applies to its standing item at the item's next evaluation, with no
  migration and no relabeling. One precision the simulator pinned (S28): the
  stamped `Not-before` is the *one* scheduling fact an item carries, so a
  frequency change takes effect **at the wake already stamped** — the item
  sleeps out its old wake, is judged there by the new precondition, and the
  next roll targets the new anchor. An operator who wants the new cadence
  sooner wakes the item — the force lever, as everywhere.
- **An engine change** lands through the ordinary update flow (engine release
  → members' baselining converges the vendored workflows). In-flight items
  survive by construction: a run that claimed an item finishes it on the code
  it checked out; every later touch — next tick, next pick, the janitor — is
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
3. **Wiring** — the wiring converge stamps each declared name into the
   **executor workflow's env** (`CHROME_STORE_TOKEN:
   ${{ secrets.CHROME_STORE_TOKEN }}`). The tick and the janitor workflows
   get no secrets — they never execute task code.
4. **Execution** — after claim and a go verdict, the executor runs prework as
   a subprocess (task dir cwd, timeout) whose env carries exactly the
   declared names. **Prework is the only task code that ever sees values.**
5. **The agent hop carries nothing** — the hand-off writes body sections and
   calls the invocation endpoint with a prompt naming the issue and nonce;
   the session works under its own identity. A task whose agent phase needs
   a privileged effect routes it through prework's delivered artifact or a
   wider invocation endpoint — never a secret in the session.
6. **Endpoint tokens ride the same rail** (§12): config maps endpoint name →
   URL + the *name* of the Actions secret; the stamp puts it in the executor
   env; the executor reads it only at the moment of the API call. The CCR
   session-creation token is simply the default endpoint's entry.
7. **Missing secret** — declared but not configured: baselining asks the
   owner on its standing issue (the adoption-interview posture), and until
   set, execution converges the affected item `needs-human` naming the
   missing secret — at prework for `required_secrets`, at hand-off for an
   endpoint token. Nothing fails silently; the task just doesn't work yet.
8. **Rotation** — rotate the value in repo settings; nothing else changes,
   because names are the interface everywhere above.

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

## 15. Decisions on record (owner, 2026-08-13)

The eight questions this design opened, as answered. Where an answer changed
the design rather than confirming it, the section it changed is named.

1. **Invocation is a CCR API call** (§12). Reverses per-project-scheduling
   §12.6; the session-creation credential in every repo is an accepted cost.
2. **The precondition re-runs at pickup, and forcing loses its exemption**
   (§6.4) — conditioned on preconditions asking task questions, not calendar
   ones. #515's rationale does not survive the pull model.
3. **Timing in a precondition is advisory, not forbidden** (§6.4): permitted
   where the verdict cannot flip between creation and pickup for scheduling
   reasons alone. No check — the property is not mechanically checkable, and
   the residual failure is a visible `outcome:obsolete`, not a wrong result.
4. **A precondition is go/no-go, never maybe-later** (§5) — *changed the
   design twice*. First cut: one verdict per occurrence at the first tick
   after the anchor, which required a `lastTick` read from the Actions ledger
   — a partial rebuild of the very watermark §1 complains about, called out
   as such when the owner asked for a state assessment. Resolved by the
   owner's **standing-item model** (decision 13 below): the verdict stays
   once-per-period, and the memory moves onto the item itself (`Not-before`
   roll), deleting the ledger read entirely. Mid-window firing stays out; a
   task wanting finer latency declares a finer `frequency`.
5. **The fleet concept is eliminated** (§12, §13) — *changed the design*.
   Wider reach is a different invocation endpoint, declared by the task that
   needs it. `ready-for-agent-fleet`, the second executor routine, and
   `session_scope` all delete. (One elaboration flagged in §12: the task names
   an endpoint *key*, with the URL and credential in repo config, so no
   vendored pack file carries deployment detail.)
6. **The executing-leash reclaim rides the tick** (§11) — *changed the
   design*. ~2h to recover a dead executor's item instead of ~25h; the janitor
   keeps the judgment sweeps. Amends the 2026-08-06 single-recovery-site split
   in siting, not in principle.
7. **Namespaced labels, executor identity in claim comments** (§4). As
   drafted; the sketch's literals and a label-per-executor are both declined —
   the first for queryability, the second because executor identities are an
   unbounded set.
8. **Dependency readiness is the tick's alone** (§9). No converger poke: one
   site evaluates `Blocked-by`/`Not-before`, and ~1h per chain link is within
   what nightly work tolerates.

Standing entries — no decision needed now:

9. **Known limitation (S18):** a fan-in blocked on a stuck child waits for a
   human; no quorum or deadline semantics at this scale. The janitor's stale
   escalation is the visibility. Revisit only on evidence.
10. **Ref-creation CAS claims** — `refs/claudinite/claim/<n>` is the
    platform's one true first-writer-wins primitive and would replace the
    comment lease outright. Recommendation stands: keep comment leases
    (visible on the item, sufficient at this concurrency) unless a real
    lost-race incident occurs. Recorded so it is not re-derived.
11. **Invocation idempotency key** — if the CCR session-creation API accepts
    one, pass §6.6's nonce as it: duplicates then collapse at creation and the
    agent-side lease becomes a backstop rather than the mechanism. One
    API-docs check at implementation time.
12. **The no-go record alternative** — every occurrence creating an item born
    closed on a no-go was recorded here as the only ledger-free way to keep
    every occurrence on record, priced at ~2,500 closed issues a year.
    **Superseded by decision 13**, which achieves both properties (no ledger,
    every ask on record) with one *rolling* item per task instead of one
    closed item per occurrence.
13. **The standing work item** (owner, 2026-08-13) — *the generation model,
    settled*. The tick creates each task's item unconditionally at its anchor
    and evaluates nothing; the precondition runs exactly once per period, at
    pick, on the executor; a no-go **rolls** the item to the task's next
    anchor instead of closing it, so the item carries "asked, declined, wakes
    at T" and the tick is a pure function of the clock and the issue list.
    Forcing a scheduled task becomes waking its standing item. One
    elaboration of the owner's literal proposal, flagged in §9: `after`
    compiles to a pick-time yield, not a `Blocked-by` edge — a rolling item
    never closes, so blocked-by would starve dependents of a quiet upstream
    forever (S24). Titles carry no timestamp; the issue number is the
    identity, as ever.

---

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
