# The task machinery — principles

Every claim below is *Y happens when Z*, present tense, and ends with the test
that proves it: a scenario's first word (`S13'`, `S59` — run against
[`packs/claudinite-tasks/test/sim/scenarios.test.mjs`](../test/sim/scenarios.test.mjs)) or, for what
the simulator does not see, `<test file>: <test title>` from the unit suite.
The two-way guard in [`packs/claudinite-tasks/test/sim/coverage.test.mjs`](../test/sim/coverage.test.mjs)
keeps this honest: every scenario in `scenarios.test.mjs` is cited by at least
one claim here, and every citation names a test that actually exists. Claims
are grouped by role — schedule, execute, session, deliver, recover, requests,
cost, contract — the same cut the pack's own folders take. Run the suite from
[`packs/claudinite-tasks/test/sim/README.md`](../test/sim/README.md).

## Schedule

- Every tick asks every task whose `preconditions` puts it on the schedule; a
  yes files a `task:origin:planned`, ready item, and a no writes nothing but
  one log line — no board, no watermark, no memory of the ask.
  `S1'`, `S21`, `S22`, `S3'`, `S74`,
  `test/queue/scheduler-run.test.mjs: a yes files a ready planned item; a no files nothing and is only asked again next run`
  - Rejected: a decline watermark (a `[claudinite-schedule]` board row) — the
    history terms below get the same property (never re-asking a declined
    occurrence) for free, off the queue the run already holds.
- A task with no `preconditions`, or whose one term reads the item itself
  (`request-eligible`), is off the schedule: never asked, and it runs only
  from an item somebody created.
  `S76`, `S1'`, `S70`, `S44`,
  `test/queue/scheduler-run.test.mjs: every task on the schedule is asked, in declaration order; one stating no condition, or one reading the item, never is`
- `trigger`, not the presence of a cadence term, decides whether the
  scheduler asks a task at all: a `request` task's precondition cannot hold
  it back onto the schedule, and a `schedule` task with no `preconditions`
  runs at every tick. `S79`
- `due:<daily|weekly|monthly>` holds when no run of the task started or ended
  since that cadence's most recent anchor on the repo's `taskScheduler`
  schedule. `S74`, `S26b`, `S59`, `S6`
- `last-run-over:<duration>` holds when the newest run started longer ago than
  that duration, or there is no run in the horizon — elapsed, so it drifts by
  up to a tick's gap each period. `S75`
- `last-run-not-failed` holds unless the newest run stands at a
  `needs-human-failure` park; only a task that declares the term is held back
  by its own failure, and only the newest run speaks. `backlog`, `S41b`,
  `S62b`, `S63`
- `due:` and `last-run-over:` hold on a `Woken`-stamped item without reading
  the run history at all — the wake stands in for the cadence, while every
  other condition the task states still applies. `S77`
- A task is asked at its very first tick like any other; there is no gentler
  first-sight rule and no booked first window.
  `S78`, `test/queue/scheduler-run.test.mjs: a brand-new task is asked at the first run like any other — there is no first-window booking`
- One live item per task is the engine's one invariant: while an unqualified
  item is open in a live status, the task is not asked, and the item is its
  current occurrence; a parked item is not live, so the task is asked beside
  it. `S57`, `S6`, `S11`, `S42`,
  `test/queue/scheduler-run.test.mjs: a live standing item suppresses the ask however long it has stood, in every live status`,
  `test/queue/scheduler-run.test.mjs: a parked item is not live: the task is asked beside it, whatever the park's kind`
- A second live unqualified item of one task, however it arose, is closed
  obsolete, oldest kept. `S30`,
  `test/queue/scheduler-run.test.mjs: a duplicate live standing item is closed obsolete, oldest kept (F16)`
- Ad-hoc work — a qualified item, a mark, a chain link — never suppresses a
  scheduled occurrence and is never suppressed by one.
  `test/queue/scheduler-run.test.mjs: ad-hoc items neither suppress nor consume a scheduled occurrence (§3)`
- A pick-time no-go closes the item, `task:status:rejected`, with the reason
  in the comment — there is no roll to a later anchor. `S13'`, `S14'`, `S59`,
  `S12'`
- The first tick back after an outage asks about now, once, with no backfill
  of the missed periods. `S5`
- The window a movement signal is read over is "since this task's newest run
  started"; a rejected item does not move that seam, so the next ask still
  sees what the rejected one saw. `S3'`, `S22`, `S28`
- Pick order is urgent first, then random among the ready, under a seeded
  PRNG — nothing in the system leans on oldest-first ordering. `S16`
- The same-title mutex serializes a task's own occurrences; a fan-out's
  distinct qualifiers parallelize freely. `S15`, `S18`
- A `schedule_after` yield skips a dependent while its named upstream's
  standing item is live this cycle only; a declined or parked upstream holds
  nothing, because it has no live item to yield to. `S4`, `S23`, `S23b`, `S24`
- Readiness — `Blocked-by` closing, `Not-before` passing — has exactly one
  site, the scheduler run's own job; no close anywhere else ever readies a
  dependent. `S33`, `S18`
  - Rejected: a second check at close (the run that closes an item also
    freeing what it blocked) — a latency optimisation on a mechanism already
    correct without it, at the cost of a task execution relabelling a sibling
    item.
- Fanning out is creating N items; the fan-in is one more item, `Blocked-by`
  all N, that readies only once every child has converged. `S18`
- A follow-up (`Blocked-by: #<this item>` + `Not-before: <settle time>`)
  re-runs its own precondition once readied: it closes obsolete when the
  world already settled on its own, and runs when the store the run trusted
  actually rejected the release. `S17`, `S17b`
- The human re-queue lever — stripping a park and applying
  `waiting-for-executor` — is a label edit that stamps nothing else: the item
  is claimable by a different executor from the instant it lands, and it
  leaves no triage label behind. `S19`, `S12'`, `S39b`, `S43`
- Forcing a scheduled task wakes its standing item if one is open, or mints
  one stamped `Woken` if none is — the ordinary case, since most of a quiet
  task's day has nothing standing to wake. `S14'`, `S16'`, `S19`, `S77`, `S20`,
  `S76`,
  `test/queue/scheduler-run.test.mjs: a task whose standing item is CLOSED is forced by minting a new one`,
  `test/queue/scheduler-run.test.mjs: a task that has never had an item at all is also minted, not refused`
- Forcing an unscheduled task never mints an item — there is no standing item
  to stand in for — it wakes the open items already routed to it by path, or
  reports there is nothing to wake.
  `test/queue/scheduler-run.test.mjs: an UNSCHEDULED task is never minted by a force — it wakes the items routed to it, or reports nothing`
- Forcing ad-hoc work is creating an item, stamped `Woken`, with a generic
  Context saying no precondition asserted there was work. `S13'`, `S15`, `S16`
- A dropped or late scheduler-run fire costs latency only, never the
  occurrence: the next tick's `due:` term reads the missed period as the
  current one. `S71`, `S5`
- `due:weekly` fires exactly once a week even when no tick lands on its
  anchor hour. `S73`
- A `Not-before` that falls between two ticks waits for the next tick,
  unescalated. `S72`
- A task declaration change — cadence, `schedule_after`, a precondition, a
  secret — applies at the very next tick, with no migration and no
  relabelling, because nothing durable ever carried the old schedule. `S28`
- The cron fires twice a day, at the repo's anchor hour and twelve hours
  later; both ticks ask every scheduled task the same way — what differs is
  only which terms have come due. `S67`, `S68`, `S69`

## Execute

- The pick-time skip rules — the same-title mutex, the `schedule_after` yield
  — are advisory: they read possibly-stale state, so a winning claim
  re-verifies them against live state and reverts to `waiting-for-executor`
  on a conflict, bounded to one revert. `S32`
- The claim lease arbitrates by comment id, never timestamp, and the earliest
  comment *since the item's current episode began* wins — a dead claim from
  an earlier episode can never outrank a live one. `S7`, `S32`
- Two scheduler runs racing hold under the workflow's `concurrency` group
  plus the one-live-item invariant over the same issue list. `S6`
- The executor re-evaluates the precondition at pick, over freshly collected
  signals, because a chained stage re-derives world state rather than
  trusting the tick's verdict; a no-go closes the item there exactly as it
  would have at the tick. `S59`, `S13'`, `S17`, `S77`, `S14'`, `S19`
- The executor resolves which pull request a run works on exactly once,
  between the go verdict and the work step, from the task's declared
  `expected_outcome`, and hands the same answer to both phases.
  `test/queue/target.test.mjs: the env a target becomes is exactly the three variables, every mode`,
  `test/queue/executor-loop.test.mjs: code-work is handed the target the executor resolved, minted under the task's prefix`,
  `test/queue/executor-loop.test.mjs: the hand-off stamps the target on the item, where the agent reads it`
- A target the resolver could not answer — an unreadable pull-request list —
  is a run failure, never a guessed "nothing to amend."
  `test/queue/target.test.mjs: an unreadable pull request list is an error, not an empty one`,
  `test/queue/executor-loop.test.mjs: a target that could not be resolved parks the run, and nothing runs`
- The executor comments a heartbeat on the item every ~15 minutes during the
  work step; a live run is never reclaimed however long it runs, and a dead
  one is reclaimed within ~the leash of its last heartbeat. `S31c`, `S31d`
  - Rejected: a leash sized to the heaviest task's work bound — it would
    inflate the reclaim time for every lighter task in the fleet to match the
    slowest one.
- Removing the heartbeat reproduces the livelock it exists to prevent: every
  tenure reclaimed alive before it can finish, the work re-executing forever.
  `S31b`
- The wiring-time conformance check enforces exactly one relation: the
  heartbeat interval sits well inside the executing leash. `S31`
- A worker that names its failure kind on stdout/stderr parks there; the last
  marker printed wins, so a sweep may revise its own verdict mid-run; a
  worker that says nothing parks at failure. `S41`, `S41b`
- The work step's terminal comment carries the `claudinite-task-exec` record
  and every artifact the run created — for an agentless task it is the only
  durable trace of the run, since Actions logs expire. (comment content, not
  label mechanics — **prose**, not sim territory)
- An executor run drains the queue until nothing is pickable, settling items
  serially — never two at once — and a platform kill loses at most the
  current item's progress. `S34`,
  `test/queue/executor-loop.test.mjs: a run drains every pickable item, one at a time`,
  `test/queue/executor-loop.test.mjs: a drained run never runs two items' work at once`
- A dead run mid-queue is picked back up by the failure-continuation job on a
  fresh runner within about a minute; the dead item itself still waits for
  the leash. `S36`
- `CLAUDINITE_TASKS_SUSPEND_ALL` makes every workflow exit at its first act,
  having fired nothing; a live drain re-reads the variable between items over
  the API, so suspension still parks the train at most one item later.
  `S37`, `test/queue/executor-loop.test.mjs: a hold arriving mid-drain stops the next pick and leaves the queue untouched`
- Clearing the suspend variable needs no lever of its own: the next scheduler
  run's reclaim, readiness and drain jobs perform the entire self-heal
  unaided; a hand-dispatched **scheduler** run (not the bare executor) does it
  immediately. `S38`
- A task whose signals the scheduler cannot read fails open into an item the
  executor decides, at most once per period the cadence holds. `S55`
- A hand-minted item preempts the tick's own ask for that task — no
  duplicate, no dedupe. `S57`
- A refused create at pick — the precondition declines over evidence the tick
  did not have — costs one tick, never the occurrence itself. `S60`
- The ordinary path — a go verdict at pick runs the work step and closes the
  item `task:status:done` — is what every recovery and edge-case claim above
  is a variation of. `S2`

## Session

- Invocation is one CCR API call per item, fired exactly once, ever: the
  executor never retries a timed-out or dropped call, so no two sessions can
  ever arrive at one item and there is nothing for a lease to arbitrate.
  `test/queue/executor-loop.test.mjs: a hand-off swaps to task:status:running-agent and invokes exactly one session`
- A refused invocation — a status came back — converges the item to
  `task:status:needs-human-action` at once, naming the cause; no retry can
  fix a bad token, URL or routine. `S9a`,
  `test/queue/executor-loop.test.mjs: a refused invocation converges to triage: no session exists and a retry cannot help`
- An unanswered invocation — a timeout or dropped connection — leaves the
  item `running-agent` with a comment that the outcome is unknown: a session
  that did start converges the item itself, and one that never did is left
  for the agent leash to bring to triage. `S10a`, `S10b`,
  `test/queue/executor-loop.test.mjs: an unanswered invocation leaves the item with the agent and says the outcome is unknown`
- The session does not claim, it checks: before touching anything it
  confirms in code that the item still carries `task:status:running-agent`
  and that its newest hand-off comment carries the nonce this fire named — a
  mismatch means the fire is stale or replayed, and the session stops
  untouched. `S10a` (exactly one session ever reaches an item under
  at-most-once invocation)
- The session's instructions are themselves a tracked file the routine's
  stored prompt does nothing but point at, so the issue-is-data posture holds
  at the invocation hop too. (**prose** — a security posture, not a label
  mechanic)

## Deliver

- A task's `expected_outcome` is a ceiling on what its run may do to pull
  requests, never an instruction — `no_code_changes`, `fresh_pr`,
  `amend_existing_or_create_new_pr`, `supersede_existing_pr` — and the
  legacy two-word ceilings normalize to one of these at the door.
  `test/queue/target.test.mjs: the legacy ceilings plan as the values they normalize to`
- `no_code_changes` gets no branch and no pull request; `fresh_pr` gets a
  freshly minted branch under the task's own prefix and leaves the task's
  earlier pull requests alone.
  `test/queue/target.test.mjs: no_code_changes gets no branch and no pull request`,
  `test/queue/target.test.mjs: fresh_pr gets the minted branch and leaves the task's earlier pull requests alone`
- `amend_existing_or_create_new_pr` targets the task's newest open pull
  request — found by branch prefix or by the `Claudinite-Task:` trailer on
  its head commit — while it has no conflicts with its base; a conflicted or
  unreadable incumbent gets a fresh branch instead of a guess.
  `test/queue/target.test.mjs: amend_existing_or_create_new_pr amends the newest open pull request when it has no conflicts`,
  `test/queue/target.test.mjs: amend falls back to a fresh branch on a conflicted incumbent, and on one whose mergeability could not be read`
- `supersede_existing_pr` mints a fresh branch and closes every earlier open
  pull request of the task once its own exists; a green, already-mergeable
  incumbent is landed instead of re-cut, and that landing ends the occurrence
  on the spot.
  `test/queue/target.test.mjs: supersede_existing_pr gets a fresh branch and names every open pull request of the task to close once its own exists`,
  `test/queue/target.test.mjs: supersede lands a green incumbent instead of re-cutting it, and the occurrence ends`,
  `test/queue/executor-loop.test.mjs: a landed incumbent ends the occurrence without running the work`,
  `test/queue/executor-loop.test.mjs: a supersede run closes the pull requests it was told to, once its own exists`
- A supersede run that delivered no pull request of its own leaves the
  incumbents exactly where they were.
  `test/queue/executor-loop.test.mjs: a supersede run that delivered no pull request leaves the incumbents where they were`
- Code-work communicates with the agent only through the repository — commits
  and files — with one named exception: the identifiers of what this run
  created (a branch, a PR number), rendered into the item's own
  `### Delivered by code-work` section; if the item names no artifact, none
  exists. `test/queue/executor-loop.test.mjs: the hand-off stamps the target on the item, where the agent reads it`
- A task's `automerge` ceiling and a marked issue's `Merge:` field are one
  policy vocabulary: `anything`, a `a;b;reject:c` diff-class list, or
  `if-narrow` — the same engine either compiles to.
  `test/queue/request-mode.test.mjs: the Merge field is fenced by policy shape`,
  `test/queue/request-mode.test.mjs: the Merge fence and normalizePolicy agree on what is a policy expression`
- A request's `Merge:` authorization is honored only when the issue's
  **author** holds push access, re-read and re-gated at every adoption so a
  stale value can never outrank a new ask.
  `test/queue/request-mode.test.mjs: the body's Automerge: becomes the item's Merge field, and only for a gated author`

## Recover

- The janitor is a fallback: every rule it runs repairs something that
  already went wrong, no stage of a task's healthy flow passes through it,
  and an item somebody closed is finished, not a state to repair.
- The executing-leash reclaim rides the scheduler run: `running-executor`
  silent past ~1h strips to `waiting-for-executor` with a comment, so a dead
  executor's item is back in the queue within ~2h rather than a day. `S8`
- The janitor's agent leash (~3h) converges a silent `running-agent` item to
  `needs-human-decision`, naming which session died. `S11`
- A run that dies mid-queue is caught first by the failure-continuation job
  (a fresh runner, ~a minute); the scheduler run's own drain is the backstop
  when the whole workflow run is lost. `S36`
- The stale-ready escalation converges an item unpicked past ~2 periods to
  `needs-human-action`, the period read from the task's own declared cadence
  term at HEAD — never from title parsing. `S18`, `S21` (never fires on a
  quiet task, which has no item to escalate)
- The stuck-dependency sweep escalates a `blocked` item whose blockers have
  not resolved for ~2 days with a comment only — labels untouched, so the
  item still proceeds by itself the moment its blockers resolve. `S18`
- An open item wearing neither a status label nor a park — a torn label
  swap's leavings — is repaired to `needs-human-decision` by the janitor's
  stateless-item rule, on a fresh re-read so an item that settled between the
  sweep's read and its write is left alone.
  `test/tasks/task-janitor-queue-sweep.test.mjs: a stateless item parks at failure — a torn swap is breakage, not a judgement`,
  `test/tasks/task-janitor-queue-sweep.test.mjs: an item that settled between the sweep's read and its write is left alone`,
  `test/tasks/task-janitor-queue-sweep.test.mjs: an item still stateless on the second read is repaired`
- `Ends-when: #<n> closed`, stamped by the converge on any park given a `--pr`,
  is what lets a park end itself: the janitor reads the named issue or pull
  request's resolution and closes the item accordingly — merged closes
  `done`, closed unmerged closes `rejected`, and a condition it cannot
  evaluate reads as not yet met.
  `test/tasks/task-janitor-queue-sweep.test.mjs: a park whose pull request MERGED closes done — the work landed`,
  `test/tasks/task-janitor-queue-sweep.test.mjs: a park whose pull request was closed unmerged closes rejected — nothing landed`,
  `test/tasks/task-janitor-queue-sweep.test.mjs: a park whose pull request is still open is the machinery working`,
  `test/tasks/task-janitor-queue-sweep.test.mjs: an ended park on a marked issue whose PR merged closes it done`,
  `test/tasks/task-janitor-queue-sweep.test.mjs: an ended park on a marked issue whose PR was closed unmerged closes it rejected`
- A terminal — `done` or `rejected` alike — closes the issue it stands on,
  marked or filed; a pull request closed unmerged says the task was
  rejected, and the item says so and closes exactly as an executor decline
  does. `S45` (a refused request is disarmed and closed on the issue itself),
  `test/tasks/task-janitor-queue-sweep.test.mjs: an unclosed terminal is closed at its own outcome, with no relabelling`
- A failure park nobody has answered past its bound closes obsolete, and a
  superseded park is closed as superseded, never as abandoned.
  `test/tasks/task-janitor-queue-sweep.test.mjs: a failure park nobody has answered past the bound closes obsolete`,
  `test/tasks/task-janitor-queue-sweep.test.mjs: a superseded park is closed as superseded, not as abandoned`
- A park naming a task at a path it has since moved off closes obsolete,
  naming the new path, rather than stranding on a dead reference.
  `test/tasks/task-janitor-queue-sweep.test.mjs: a park naming its task at a path it has moved off closes obsolete, naming the new path`

## Requests

- One label, `task:origin:ad-hoc`, applied to an ordinary issue, makes that
  issue the work item — no shadow `[claudinite-work]` issue is filed, and the
  whole status lifecycle plays out where the person is already looking.
  `S44`, `test/queue/request-mode.test.mjs: S44 — the marked issue BECOMES the item, and any status holds the mark`
- The scheduler run's fourth job, adopt, appends the machine block and the
  first status to every open issue wearing the mark with no status at all —
  that combination is the whole of the exactly-once adoption guard, and the
  status is what blocks re-adoption from here on. `S44`, `S49`
- Clearing a park, a rejection or an approval is the one lever that re-enters
  a request into the queue — there is no second label and no predecessor to
  supersede, because there is only the one issue. `S49`, `S51`
- A live prior item of the same mark makes a re-ask wait; a parked one is
  superseded rather than blocking it forever. `S49`, `S51`
- The precondition is the security check, evaluated once, at pickup: it
  refuses when the issue is closed or unmarked, when neither the author nor
  an `/claude go` commenter has push access, or when the issue is
  definitively gone — each a plain no-go that closes the item
  `task:status:rejected`. `S45`, `S46`
- Push access is read from the collaborators-permission API, never inferred
  from `author_association` alone, because `MEMBER`/`COLLABORATOR` are both
  broader than the push access the ask demands.
  `test/queue/request-mode.test.mjs: S46 — the verdict is the PERMISSION, not the association (F30)`
- A read failure that is not a definitive "gone" is not a verdict: it fails
  the run into `task:status:needs-human-failure` rather than stranding or
  silently eating the request. `S50`
- A request withdrawn — unmarked or closed — between adoption and pickup
  never reaches an agent: the same pickup-time precondition that checks
  authorization is what catches it. `S48`
- The precondition is handed this occurrence's own facts — its item, its
  `Request:` field — because a request's verdict is about the specific issue
  it names, not a fact any signal bundle could carry on its own.
  `test/queue/request-mode.test.mjs: the precondition is handed THIS occurrence's own facts, not just the signals`
- A request that leaves a pull request open parks at
  `task:status:needs-human-approval` — the in-review state itself, with
  nothing further to mirror; a refusal closes the issue with it; a break
  parks silently in the failure lane. `S44`, `S45`, `S49`
- The silence on a failed request is deliberate: re-arming code-writing work
  is a person's decision, and the standing park is exactly what stops the
  next scheduler run from re-adopting the same request.
- `Blocked-by:` and `Not-before:` on a marked issue carry onto the item
  adoption births, which is then born `task:status:blocked` until the
  scheduler run's own job releases it — a blocker already closed at adoption
  is dropped rather than born and instantly readied, and an unreadable
  blocker delays rather than releases.
  `test/queue/request-mode.test.mjs: a marked issue that names open blockers is adopted BLOCKED, and released when they close`,
  `test/queue/request-mode.test.mjs: a marked issue with a future Not-before is adopted BLOCKED until that moment`,
  `test/queue/request-mode.test.mjs: an unreadable blocker delays the request rather than releasing it`
- A mark's body may widen the default implementer with `Task: <pack>/<task>`,
  author-gated like every other body parameter; an id the repo does not
  carry is not adopted at all — the mark simply waits.
  `test/queue/request-mode.test.mjs: a marked issue may name WHICH task it asks for, gated like every other parameter`
- The model a request runs at rides the body's `Model:` field, honored only
  when the issue's **author** holds push access, re-read and re-gated at
  every adoption; an invalid value falls back to the task's default rather
  than failing. `S47`,
  `test/queue/request-mode.test.mjs: S47 — the body's Model reaches the item, an unknown family falls back, and an ungated one is ignored`
- A repo whose engine carries no request task adopts nothing — the marks
  simply wait for an engine that does.
  `test/queue/request-mode.test.mjs: a repo whose engine has no request task adopts nothing — the marks simply wait`

## Cost

- Actions bills each job's minutes rounded up to the whole minute, so a
  day's cost is the scheduler's run count, not the work inside each run —
  the only lever that reduces cost is fewer runs.
- An executor run drains until nothing is pickable rather than settling one
  item per run, because a chain of one-item runs pays a whole invocation —
  checkout, setup, rounding — per item. `S34`,
  `test/queue/executor-loop.test.mjs: a run drains every pickable item, one at a time`
- The scheduler's drain job dispatches only when the scheduler run's own
  parting look at the queue found something pickable, so an idle hour costs
  exactly the cron's one run.
- A working day costs 4 billed runs against the hourly grid's 27; a quiet day
  costs 2 against 24. `S65`, `S66`, `S67`
- An ad-hoc mark's latency **is** the wait for the next tick, so the cron's
  cadence sets it directly: roughly 7.2h worst-mean at twice a day against
  0.2h hourly and 19.2h once daily. `S68`
- A dropped scheduler-run fire under a twice-daily cron costs twelve times
  the latency it would cost hourly, for the same one dropped fire — never a
  lost occurrence. `S71`
- A `schedule_after` chain settles back to back inside one drain run, so
  collapsing three anchor hours into one tick slips a whole morning's chain
  by under an hour; a `Blocked-by` chain is not this mechanism and its
  cadence moves with the tick gap instead. `S67`
- A newly marked issue is not caught by a drain already in flight — adoption
  is the scheduler run's own job, so a mark landing mid-drain waits for the
  next tick. `S69`
- The operator hold is re-read between items over the API, since the
  workflow's env copy of the variable is delivered at run start only, so
  suspension parks a batched drain at most one item later. `S37`,
  `test/queue/executor-loop.test.mjs: a run that drained the queue asks the hold once per settle, not once more`

## Contract

- A work item is a GitHub issue titled `[claudinite-work] <pack>/<task>`,
  plus an optional free-form qualifier; the issue number is the whole
  identity — there is no slot id.
  `test/queue/work-item.test.mjs: a work-item title round-trips, with and without a qualifier`
- The slot mechanism's `[claudinite-task]` titles are a disjoint family,
  invisible to the queue's own reads. `S29`,
  `test/queue/work-item.test.mjs: the slot mechanism's titles are invisible here — the two families are disjoint (S29)`
- Every label the machinery writes is exactly one of three things: the
  item's single mutually-exclusive **status**, its lifelong **origin**, or
  the **urgent** flag — all in the `task:` namespace.
  `test/queue/work-item.test.mjs: only a fault park holds the task's lane`,
  `test/queue/work-item.test.mjs: every label the scheduler run and a convergence apply is one the queue ensures`
- `task:origin:*` is applied once, at birth, and never removed — a closed
  issue keeps saying where its work came from — and it is the single
  authority on standing versus ad-hoc; the structural read (an unqualified
  item of a task with a schedule) survives only as the decode fallback for
  items that predate the scheme. `S61`, `S62`, `S64`
- A park whose kind cannot be decoded reads as `needs-human-failure` — every
  bare legacy park and every unknown newer kind word reads as a fault rather
  than as somebody's inbox the schedule carries on around.
  `test/queue/work-item.test.mjs: a kind word maps to its label, and anything unrecognised to failure`
- Every legacy label and field spelling decodes forever, in one pass, straight
  to its current canonical form — never chained through an intermediate
  spelling — because closed issues keep the labels they were written with.
  `S62`, `S62b`, `S63`,
  `test/queue/work-item.test.mjs: outcomeOf maps every spelling, legacy and current, to the canonical word`,
  `test/legacy-task-fields.test.mjs: legacy-task-fields: every retired field name is reported at its own line, with its replacement`
- A hand-created item, a forced mint, and a `--wake` all stamp `Woken:` into
  the item's machine block; any item that is not the scheduler's own
  unqualified planned item is treated as woken too.
  `test/queue/work-item.test.mjs: Woken is stamped by the lever, replaced on a second wake, and read as the item's facts`
- `Ends-when: #<n> closed` is stamped at most once, under the task path, by
  the converge that plans a park given a `--pr`.
  `test/queue/work-item.test.mjs: withEndsWhen stamps a park's end condition once, under the task path`
- The target fields a run resolves (`Target-branch:`, `Target-pr:`,
  `Supersedes:`) land in a marked issue's own machine block, never in its
  prose, so the author-gate on the rest of the body is never crossed by the
  machinery's own writes.
  `test/queue/work-item.test.mjs: the target fields land in a marked issue's machine block, never its prose`
- `preconditions` is the only gate a task declares; the retired
  `precondition`/`precondition_signals` function forms are rejected by name,
  not silently ignored, so an old declaration is told what replaced it.
  `test/legacy-precondition-retired.test.mjs: a declaration carrying only the retired function is rejected by name`,
  `test/legacy-precondition-retired.test.mjs: the executor seam never calls a precondition function`
- The retired `frequency` field is read at exactly one door,
  `normalizeTaskDeclaration`: it becomes the cadence term it always meant
  first in the expression (`manual` becomes `trigger: request` and no term at
  all), and nothing downstream ever sees the field again.
  `test/legacy-task-fields.test.mjs: legacy-task-fields: the retired frequency field is reported with the condition it reads as`,
  `test/legacy-task-fields.test.mjs: legacy-task-fields: what it reports is exactly what the door normalizes away`
- Bootstrap's whole wiring is idempotent and durable-state-free: labels
  created if missing, the two vendored workflows, and `taskScheduler` config
  — no seed items, no ledger, no board; the first scheduler run after wiring
  asks every task exactly like any other tick. `S78`
- Pre-existing issues from the retired slot mechanism are invisible to the
  scheduler run — bootstrapping into a repo carrying old-vocabulary issues
  neither reads nor touches them. `S29`
- A task declaration a member's own engine cannot read is skipped by
  discovery with a recorded error, never allowed to fail the whole mount —
  an invalid local task file stops running with something red to say so.
- A task with `required_secrets` unconfigured parks the affected item at
  `task:status:needs-human-action`, naming the missing secret, rather than
  failing silently or blocking every other task.
  `test/queue/executor-loop.test.mjs: an unconfigured declared secret parks at action`,
  `test/queue/executor-loop.test.mjs: a declared-but-unconfigured secret names itself on the item`
- A work item whose task the repo no longer carries at HEAD closes obsolete —
  the same exit whether the task's whole pack was dropped or just renamed
  out from under an in-flight item.
  `test/queue/executor-loop.test.mjs: an item whose task the repo no longer carries closes obsolete, like exit-14 did`,
  `test/queue/executor-loop.test.mjs: a task deleted from the checkout mid-run closes obsolete rather than failing to a human`
- A malformed item — a body that cannot be the machinery's own writing — goes
  to a human rather than being executed: possible forgery is exactly the case
  nothing may guess past.
  `test/queue/executor-loop.test.mjs: a malformed item goes to a human — a forged body is never executed`

## Not yet verifiable

The simulator models the protocol's decision points, not the platform under
it. Each of the following is a place a bug could live that no scenario here
can catch; what would make it verifiable is named beside it.

- **Cron delivery** — `schedule:` fires land late or are silently dropped,
  and GitHub disables a quiet public repo's schedule after 60 days. Late and
  dropped fires are modeled abstractly; the 60-day disable is inherited risk,
  unverifiable without a live repo left quiet that long.
- **Label API non-atomicity** — a label swap is two calls with no CAS; a
  torn swap between them is defended structurally (labels are never the
  arbiter, only comments are) but not exercised by the simulator, which
  applies swaps atomically. Verifiable only against real API timing.
- **Comment list consistency** — the design assumes a comment list read after
  posting includes every earlier-id comment; GitHub's own consistency
  guarantee for that read is undocumented.
- **A whole day settling inside one Actions job** — the simulator's work
  durations are scenario fixtures, not any real task's; whether a real
  member's full daily chain fits inside the executor workflow's
  `timeout-minutes` is unmeasured until a real one is watched settle.
- **Rate limits and secondary quotas** — not modeled; only real usage
  observes them.
- **The invocation wire's real contract** — the routine-fire API's timeout
  behaviour and nonce handling are modeled by their *outcomes*
  (fired/refused/unanswered), never by the wire format itself.
- **Actions variable delivery mid-run** — that a hold set mid-drain is caught
  only between items (never inside running work) follows from the platform's
  documented env-at-start-only behaviour, unexercised against a live hold.
- **Secrets storage and masking** — Actions' own secret store, env stamping
  and masking-per-literal are platform behaviour the simulator does not
  reach; only the needs-human convergence around a missing one is modeled.
- **Real code-work and agent content** — the simulator scripts a session's
  duration and verdict as fixtures; the outcome ceiling and record formats
  are the tested surface, never a real diff or a real transcript.
- **F32 — an unpicked deduped twin's survivor** — the self-heal that closes
  every duplicate live item but the oldest is modeled (`S30`); what the
  survivor's own next pick then does with a `runs` window that saw a run it
  never started is open, and no scenario pins an answer yet.
