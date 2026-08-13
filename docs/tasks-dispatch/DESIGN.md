# Task dispatch without slots — the work-item queue

Status: **proposed, unverified** — a continuation of the owner's sketch
(2026-08-12, reproduced in Appendix A), not yet agreed. If adopted it supersedes
the slot machinery of
[per-project-scheduling DESIGN §3–§5](../per-project-scheduling/DESIGN.md) and
amends several of its §12 decisions (each amendment is named where it happens).
What it does **not** touch: the task folder anatomy (§1), the precondition
contract, prework and its secrets model
([task-prework DESIGN](../task-prework/DESIGN.md)), the outcome ceiling, the
security posture (the issue is data; behavior comes from tracked files), and the
usage-metrics records.

The shape in one paragraph: **work items are issues, available for work; any
number of executors pull from them.** A thin generator tick turns recurring
tasks into work items and flips blocked items ready. An executor — a GitHub
Action by default, but anything that can read issues — picks up the next ready
item, claims it by label, re-evaluates the precondition, runs prework, hands
off to agentic work (a CCR session invoked by API), marks the item as the
agent's, and ends. Follow-ups, fan-outs, ordering, urgency, and one-off forcing
are all just *creating work items* — with dependency and not-before fields the
tick evaluates. There is no slot id, no run-ledger watermark, no exclusive
claim, and no label-event re-arm.

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
  from there.

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
   rule). Two jobs, both deterministic: *instantiate* recurring tasks as work
   items when their time comes and their precondition passes, and *ready*
   blocked items whose dependencies have resolved and whose not-before has
   passed. It creates and flips labels; it executes nothing.
2. **Executors** — any number of pull workers. Each iteration: pick the next
   ready item (urgent first), claim it, re-evaluate the precondition, run
   prework, then either finish (agentless task) or invoke the agentic phase and
   hand the item to it. An executor is platform-agnostic by construction: its
   whole interface is issue read/write. More capacity = more executors.
3. **Agents** — CCR sessions, one per handed-off item, invoked by the executor.
   An agent executes its one item's task file, verifies its outcome ceiling,
   and converges the item to a terminal state.
4. **The janitor** — unchanged in role, smaller in scope: dead executor claims,
   dead agent claims, stale-item escalation, queue health review. The re-arm
   retires (§11).

The queue itself is the repo's issues. There is no other state: no watermark,
no ledger read, no plan file. Everything the system knows about a piece of work
is on the work item, which is what the sketch means by *visibility into state*.

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

**The road back from `needs-human`** (SCENARIOS S12/S19, F7): a human who has
resolved the cause re-queues the item by removing `needs-human` and applying
`task:ready` — the sanctioned retry lever, write-gated like every label
operation here. The next pickup re-runs the precondition (§6.4), which is what
makes the retry safe even when the failed run half-did its work. Alternatively
the human closes the item (optionally superseding it with a forced retry,
§8); nothing mechanical ever re-queues a `needs-human` item.

## 5. The generator — recurring work without slots

The tick (hourly, the vendored workflow's cron, concurrency-serialized) has
two jobs — *instantiate* and *ready* — and the whole mechanism fits in one
block of pseudocode:

```text
tick(now):
  if dormant: return                            # before any read, as today

  # ---- job 1: instantiate recurring occurrences ----------------------------
  # ITERATION ORDER IS LOAD-BEARING (SCENARIOS S4/F9): topological by `after`
  # edges, so a task's upstream is instantiated before the tick asks whether an
  # open upstream item exists. Arbitrary order would create a downstream item
  # task:ready in the very tick its upstream's item is about to appear beside
  # it. Cycles in `after`: fall back to declaration order and warn.
  for task in topoSortByAfter(discoverTasks()):
    if task.frequency == 'manual': continue     # never instantiated by the tick (§8)

    # A — the ANCHOR INSTANT: the most recent wall-clock time this task's
    # schedule came due, from `frequency` + the repo's `taskScheduler` anchors.
    # A daily task with dailyHour 04, evaluated at 15:20Z, has A = today 04:00Z;
    # evaluated at 03:00Z it has A = yesterday 04:00Z. This is exactly today's
    # mostRecentSlot(...).time — the instant survives; the slot *id* derived
    # from it is what dies.
    A = mostRecentAnchor(task.frequency, config.taskScheduler, now)

    family = issues(title startswith "[claudinite-work] <pack>/<task>",
                    label "origin:schedule", state ALL)
                    # via the REST issue LIST (label-filtered, title-filtered
                    # client-side) — NEVER the search index, whose lag races
                    # back-to-back serialized ticks (SCENARIOS S6/F11)

    if any(i.created_at >= A for i in family):  # OCCURRENCE GUARD: this
      continue                                  # occurrence already fired

    if any(i.state == OPEN for i in family):    # BACKLOG GUARD: at-most-one-
      continue                                  # open, incl. one sat needs-human

    verdict = task.precondition(collectSignals(task.precondition_signals),
                                packConfig(task.pack))
    if not verdict.run:                         # quiet; re-evaluated each tick
      continue                                  # until the next anchor passes

    blockers = openScheduledItemsOf(task.after) # declared ordering edges (§9)
    createIssue(
      title:  "[claudinite-work] <pack>/<task>",
      body:   taskPath + blockedByLines(blockers) + contextSection(verdict.context),
      labels: ["origin:schedule", blockers ? "task:blocked" : "task:ready"])

  # ---- job 2: ready blocked items (ALL items, any origin) ------------------
  for item in issues(label "task:blocked", state OPEN):
    {blockedBy, notBefore} = parseBody(item)
    if all(issue.state == CLOSED for issue in blockedBy) and now >= notBefore:
      swapLabel(item, "task:blocked" -> "task:ready")
```

**`A` is an instant, not an identity.** It answers one question — *when did
this task's schedule last come due?* — and is consumed by one comparison, the
occurrence guard. Nothing names it, stores it, or parses it back out of a
title; the moment the guard has run, `A` is gone. That is the whole difference
from a slot: today the same instant is minted into an id (`d2026-08-12`) that
must then be searched for exactly, period-decoded by its leading character,
and marker-suffixed when forced.

**The ledger is the issue family.** The occurrence guard's timestamp
comparison replaces the entire run-ledger watermark: "was this occurrence
handled" is read from where the work lives, is visible to a human as an issue
list, cannot be advanced past work that wasn't created, and needs no
forced-run exclusions. The catch-up semantics carry over intact — only the
most recent anchor is ever considered, so a three-day outage instantiates one
occurrence per task, never a backfill storm; hourly tasks never backfill
because their most recent anchor is always the current hour.

**Errored items, forced items, and the guards.** The interaction is
deliberate, so it is spelled out:

- A scheduled item that **failed** sits open with `needs-human` — and the
  backlog guard counts it, so the tick stops instantiating a task whose last
  run is unresolved. That is today's at-most-one-open posture, kept on
  purpose: a broken task converges to one triage item, never one failure per
  period.
- A **forced** item — created by hand or by a task, so no `origin:schedule` —
  is invisible to both guards, in both directions, *whatever state it ends
  in*. A forced run that errored does not suppress the next scheduled
  occurrence (the failure was the operator's experiment, not the schedule's
  state), and a forced run that succeeded does not consume one — a force at
  03:50 never swallows the 04:00 occurrence. This is the #749 property
  ("forced runs are excluded from the watermark"), carried by the origin
  marker instead of the `~f` slot-id marker.
- **Forcing a retry of an errored scheduled item** is legal while that item
  sits open — the forced item runs independently, guards unbothered. But the
  open `needs-human` item is a triage state, and the force *is* the triage:
  the operator closes it as superseded when creating the retry
  (`create-work-item --supersedes #N` does both in one step, §8) — or leaves
  it open when the failure still needs a human even after a retry. Nothing
  closes it automatically: a mechanism that silently retires triage states is
  how failures stop being seen.

**A deliberate semantic change, called out:** today a slot's precondition is
evaluated once, when the slot fires, and a `false` spends the slot — a
precondition that would have passed at 09:00 waits for tomorrow. Under the
tick, every hourly run re-evaluates step 4 until the occurrence fires or the
next anchor passes; work that becomes ready mid-window fires mid-window. That
is *more* faithful to "run daily if there is work" — the sketch's "created
after the daily execution time **regularly**, only if it passes preconditions"
— and the noise bound is exactly the occurrence guard: at most one item per
task per period, whatever hour it fires. Signal lookback windows stay
period + slack as today; the overlap this creates is absorbed by the guards
plus downstream idempotence, as now.

The tick's second job is **readiness**: for every open `task:blocked` item,
parse `Blocked-by` and `Not-before`; when every named issue is closed and the
time has passed, swap `task:blocked → task:ready`. A blocker's *outcome* is
deliberately not inspected here — closed is closed; a follow-up that only makes
sense after a *successful* blocker checks the blocker's outcome label in its
own precondition, which is task logic and can say so in its Context.

The tick makes no execution decisions, runs no prework, and files nothing but
work items. It is small enough that its whole contract is this section.

## 6. The executor — pick up, claim, prepare, hand off

An executor iteration, in code end to end (the reference implementation is a
job in the vendored workflow, triggered by `issues: labeled [task:ready]`
events for latency **and** by the tick's cron as the poll that makes lost
events irrelevant; `workflow_dispatch` for a hand-started drain):

1. **Pick**: list open `task:ready` items; order `task:urgent` first, then
   oldest-created. Skip any item whose exact title (task + qualifier) has
   another open item in `task:executing` or `task:agent` — **one task, one
   execution at a time** (SCENARIOS S15/F6: without this, a forced item runs a
   task concurrently with its own scheduled run; keyed on the full title so a
   fan-out's distinct qualifiers still run in parallel — the skipped item is
   simply picked once its twin converges). Take the first survivor. None →
   exit quietly.
2. **Claim — the verified lease, unchanged in shape** (it earned its keep):
   read labels, abandon if `task:ready` is gone or `task:executing` /
   `task:agent` / `needs-human` present; swap `task:ready → task:executing` and
   post the claim comment (executor id, run URL, UTC time); re-read, earliest
   claim comment wins, loser reverts nothing and moves on — it may pick a
   *different* item and try again (an executor is code iterating a queue, not a
   session sweeping one; the one-session-one-issue rule binds agents, and each
   claimed item still gets exactly one agent).
3. **Validate in code**: the body's first line is a legal task path, the file
   exists at HEAD, the pack is declared, `task.mjs` parses. Task gone → close,
   `outcome:obsolete`, comment. Malformed → `needs-human` (possible forgery, a
   human must see it), unchanged from today.
4. **Re-evaluate the precondition** — the sketch's "evaluates preconditions,
   re-runs preconditions". The creation-time verdict was admission control; the
   pickup-time verdict is the binding one, because time passed (a blocked
   follow-up may ready days after creation; an urgent hand-created item was
   never evaluated at all). Verdict `run: false` → close, `outcome:obsolete`,
   with the reason commented. **This amends §12.3's "the precondition is the
   only decision point" by re-siting, not weakening it**: it is still exactly
   the precondition deciding — the same pure function over fresh signals — and
   prework and the agent still may not skip; the doctrine's target (later
   phases inventing "new reasons to skip") is untouched. The pickup verdict's
   Context *replaces* the creation Context on the item (edit the body), so the
   agent's binding scope is current, not stale.
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
independently leased, so executor concurrency is safe at any width. Running
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

## 8. Urgency and forcing — creating an item is the whole mechanism

- **Urgent** work is an item with `task:urgent`: picked first, and the
  `labeled` event gives it executor latency of one spin-up. Nothing else is
  special about it.
- **Forcing is creating.** `FORCE_TASKS`, the forced-verdict Context, the
  `~f<runId>` marker, the watermark exclusion, the deferral exemption — all of
  it reduces to: *create a work item for the task, marked urgent if you like*.
  A small CLI/composite (`create-work-item <pack>/<task> [--urgent]
  [--context …] [--supersedes #N]`) writes the generic "forced by hand — no
  precondition asserts there is work" Context, exactly as `FORCED_VERDICT`
  does today; `--supersedes` additionally closes a named errored item as
  superseded by this retry (§5's third guard note). The CLI warns when an
  *open* item with the same exact title already exists — the pick-time mutex
  (§6.1) means the new item would wait behind it anyway, and the operator
  should know they are queueing, not jumping (SCENARIOS S15/F6). The pickup
  precondition re-run (§6.4) replaces the skip-the-precondition rule: a forced
  item is evaluated like any other, and if the operator truly wants it
  unconditional the item's Context says so and the task's precondition can
  honor an explicit override context — but the default is that even forced work
  is admitted by code. *(This is a deliberate divergence from #515's
  "forcing never consults the task"; the case that motivated #515 — the slot
  gate running before preconditions made mid-day forcing unreachable — does not
  exist in a pull model, so the exemption loses its reason.)*
- **`manual` tasks** are simply tasks the tick never instantiates: their items
  are only ever created by hand or by other tasks. The frequency token
  survives; the special-case slot resolution for it dies.
- **Fleet fan-out** is the enforcer creating one item per member repo (urgent
  when the pass is urgent) instead of firing member schedulers with
  `FORCE_TASKS` — same write-gated surface, and the fan-in below gives the
  enforcer something it never had: a status.

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
  `after: ['basics/baselining']` in `task.mjs`: when the tick instantiates its
  occurrence while an open `origin:schedule` item exists for a task named in
  `after`, the new item is created `task:blocked`, `Blocked-by` that item. The
  nightly chain's real constraint — extract runs against a converged mount —
  becomes an explicit edge instead of anchor-hour staging that collapses on a
  late fire. On the late-fire night, all four items are created together,
  baselining's is ready, the others wait, and they run *this same night*, in
  order, as soon as it closes. Nothing is spent, nothing is deferred to
  tomorrow, no task claims a run, and the engine still never knows what
  baselining is — `after` names a task id, and the tick wires an edge,
  generically. §12's exclusive-claim machinery (and its stated
  throughput cost) deletes.
- **Fan-out with a fan-in.** Fanning out is creating N items (§8). The fan-in
  is one more item — the status/aggregation task — created `Blocked-by` all N.
  It readies only when every child converged, and its precondition/prework read
  the children's outcome labels to report or escalate. "Getting the status of
  a fan-out" stops being a bespoke sweep and becomes an ordinary task whose
  edges the tick already evaluates.

Native GitHub sub-issues / issue dependencies can *mirror* these fields for
human navigation where available, but the body fields are the truth the tick
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
| executor died mid-claim | — (executor was a session; janitor reclaimed via `agent-running`) | janitor: `task:executing` with no activity past ~1h → strip to `task:ready` with a comment (an executor iteration is minutes, not hours — a *short* leash is safe because re-execution before the agent phase is idempotent prework at worst) |
| agent session died mid-run | janitor: stale `agent-running` → `needs-human` after ~3h | same, on `task:agent` (a hand-off comment names the session, so the janitor can say *which* session died) |
| CCR invocation lost | undetectable (label event fired into the void); surfaced only by re-arm/stale | **synchronous**: the executor sees the API failure, retries, converges `needs-human` with the error (§6.6) |
| item never picked up | stale dispatch escalation, period parsed from the slot id's leading char | same escalation, period read from the task's declared `frequency` at HEAD (or a default for ad-hoc items) — no title parsing |
| dependency never resolves | n/a | stale escalation covers it (§9) |

The janitor remains an ordinary daily task, remains the only recovery site, and
shrinks: re-arm and its grace window delete; the two dead-claim sweeps and the
stale escalation re-target the new labels; the health review gains the queue
(ready-item age, blocked-item depth, outcome mix) as its subject — which it can
now compute entirely from issues.

## 12. The invocation credential — the one new trade, owner's call

§12.6 declined URL-invoked routines because the label was trigger *and*
write-gated authorization, the re-arm was built on it, and an API endpoint
"would add a callable credential to every repo's Action for no reduction in
moving parts". This design changes the balance sheet on all three points: the
authorization surface is unchanged (creating/labeling items is write-gated
exactly as labeling was), the re-arm no longer exists to preserve, and the
moving parts genuinely reduce (re-arm, grace window, transport-dance exits,
no-fallback doctrine all delete). What it costs is real and must be decided,
not slid past: **a CCR API credential as an Actions secret in every repo**,
readable by anything that can run a workflow with secrets access, whose blast
radius is "start agent sessions as the owner". Mitigations if accepted: a
dedicated key scoped to session-creation only, provisioned by
bootstrap/baselining like any `required_secrets`, rotated centrally.
Fallback if declined: the executor's hand-off step applies a `task:agent`
*trigger label* wired to the routine (today's mechanism, minus discovery —
the routine's session still gets told its item by the label event), and the
janitor keeps a re-arm for that one hop. The design works either way; the
recommendation is the API, because a hand-off whose failure is synchronous and
attributable is the single biggest operability win in this document.

## 13. What retires, what survives

Retires: `slots.mjs` (both exports and the slot-id grammar), `lastSuccessTime`
and the ledger-read failure mode, `FORCE_TASKS` and `FORCED_VERDICT` and the
`~f` marker, the exclusive claim and `deferredByClaim`, the re-arm
(`rearmDispatchIssues`) and its grace window, `resolve-dispatch`'s
trigger-discovery exits (11/12/13) and the two-transport dance, the
`ready-for-agent(-fleet)` labels (the fleet variant's job — keeping the broad
grant on a separate routine — transfers to the fleet executor picking up only
fleet-marked items, or to the API invocation naming the routine; decide with
§12), `SLOT_PERIOD_MS` title parsing.

Survives unchanged: the task folder and contract (plus the new optional
`after`), preconditions as the only decision point (evaluated at admission and
at pickup, §6.4), prework and `required_secrets`, outcome ceilings and
`verify-outcome`, the claim lease, one-agent-one-item, terminal convergence,
`claudinite-task-exec` records and the usage fold (plus outcome labels as a
second, queryable census), the janitor as sole recovery site, dormancy (the
tick's first gate, before any read), the issue-is-data security posture, the
one-cron rule.

## 14. Migration sketch

Deliberately thin — the phase plan belongs to a tracking issue, not this
record. The property that makes migration tractable: the two mechanisms can
coexist per-repo behind one config flag (`taskScheduler.dispatch:
"slots" | "queue"`), because they share the task contract, and their issue
families are disjoint (`[claudinite-task]` vs `[claudinite-work]`). Order:
vocabulary + tick + executor behind the flag on the canon repo → janitor
re-target → dependency fields + `after` → fleet fan-out/fan-in → flip members
by baselining → delete the slot machinery. Every retired mechanism deletes in
the same PR that lands its replacement's fleet flip, per the corpus's
no-lingering-legacy discipline. One migration detail already known
(SCENARIOS F8): the signal collectors' self-trigger exclusions must learn the
new vocabulary — `[claudinite-work]` titles and the `task:*` label events —
before the first queue-mode repo flips, or the queue's own items read as repo
activity to the preconditions watching it.

## 15. Open questions for the owner

1. **§12 — the invocation credential.** API invocation (recommended) or the
   trigger-label fallback? This is the one decision the rest hangs on.
2. **§6.4 — pickup-time re-evaluation.** Accept the amendment to §12.3
   (precondition decides *twice*, obsolete-on-pickup is a legal terminal), and
   the death of forcing's precondition exemption (#515's rationale no longer
   applies)?
3. **§5 — mid-window firing.** Accept that an occurrence whose precondition
   passes at 09:00 fires at 09:00 rather than waiting for tomorrow's anchor?
4. **Label vocabulary.** The namespaced set above vs the sketch's literals —
   and should executor identity really be comment-only (§4)?
5. **Fleet scope routing** (§13): fleet-marked items + a fleet-only executor,
   or routine-named API invocation?

From the scenario play-through ([SCENARIOS.md](SCENARIOS.md)):

6. **F10 — evaluation cadence.** Mid-window firing (§5) means up to 24
   precondition evaluations + signal collections per unfired daily occurrence,
   vs one today. Options: continuous (as drafted — work fires the hour it
   appears), once-per-occurrence (today's parity, cheapest), or a per-task
   opt-in. Which default?
7. **F4 — where the executing-leash reclaim lives.** A dead executor's
   `task:executing` claim reclaimed by the daily janitor stalls the item up to
   ~25h; proposal: that one deterministic label rule rides the hourly tick
   (worst case ~2h), the janitor keeps the judgment-heavy sweeps. Accept the
   janitor-scope amendment?
8. **F1 — converger pokes dependents.** Optional latency optimization: on
   closing an item, the converger readies (in code) any `task:blocked` item
   naming it whose conditions now hold, instead of waiting for the next tick
   (~1h/chain link). Same event+poll shape as pickup. Worth the extra moving
   part?
9. **Known limitation, on record (S18):** a fan-in blocked on a stuck child
   waits until a human resolves that child — no quorum/deadline semantics,
   deliberately, at this scale; the janitor's stale escalation is the
   visibility. Revisit only on evidence.

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
