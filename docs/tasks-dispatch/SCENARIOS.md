# Task dispatch — scenario play-through

Twenty scenarios played, minute by minute, against the mechanism exactly as
[DESIGN.md](DESIGN.md) specifies it (owner request on #784: *"play them out
using this mechanism, and see if there are conceptual issues we missed"*).
Each scenario ends in a verdict: **holds** (the design handles it as written),
or a numbered **finding**. The findings ledger at the end classifies every
finding and says what was done about it — some amended DESIGN.md in this same
change, some are owner calls added to its §15.

> **Read §H, then §I, for the current mechanism.** Sections A–G record rounds
> one and two (the scheduler run-evaluates models); the owner's **standing-item model**
> (2026-08-13) replaced generation, and §H replays everything it touches. §I
> records the **work-as-work review** (2026-08-15) — the correction that the
> work step IS the work — and the invocation reversal (at-most-once, the
> agent lease deleted) decided the same day: where earlier sections conflict
> with §I, §I is the design as it stands. The superseded sections are kept
> because their reasoning is the record.
>
> **The scenarios are executable.** [`sim/`](sim/) holds a discrete-event
> simulator of the mechanism (virtual clock, no threads, no waits) and
> [`sim/scenarios.test.mjs`](sim/scenarios.test.mjs) plays the §H scenarios
> against it as `at time X, Y happens` tests, run by CI. A future design
> change should change the simulator first and let the red tests name the
> scenarios it breaks. Its first run caught F13 — a double-execution bug
> every prose replay had missed.

## Cast and constants

A fictional but realistic repo, tasks drawn from the real fleet:

| task | frequency (anchor) | model | ceiling | notes |
|---|---|---|---|---|
| `basics/baselining` | daily-2h (02:00Z) | sonnet | merged-pr | code-work converges the mount; conditional hand-off |
| `grow/growth-extract` | daily-1h (03:00Z) | opus | merged-pr | `schedule_after: ['basics/baselining']` |
| `grow/growth-promote` | daily (04:00Z) | opus | open-pr | canon repo; `schedule_after: ['grow/growth-extract']` |
| `tidy/tidy-issues` | daily (04:00Z) | sonnet | none | precondition: issue touched in window |
| `gcec/create-extractor` | hourly | sonnet | open-pr | code-work-heavy, conditional hand-off |
| `chrome/store-release` | daily (04:00Z) | none | none | agentless: code-work only |
| `sheepdog/fleet-baseline` | manual | sonnet | merged-pr | fan-out target |

Constants: scheduler run cron minute **:17** (hourly); executor = post-scheduler run drain job +
`task:status:waiting-for-executor`-labeled event runs; janitor = a daily item around 04:00; leashes —
`task:status:running-executor` 1h, `task:status:running-agent` 3h, unpicked-`task:status:waiting-for-executor` ~2 periods; work-step
heartbeat every **15m** (§I). "E1/E2" are executor iterations (workflow runs);
"the API" is the CCR routine-fire call, made **once per item, never retried** (§I).

---

## A. Routine nights

### S1 — quiet night, nothing to do

- **02:17** scheduler run: baselining — occurrence guard passes (no item ≥ 02:00),
  backlog guard passes, precondition: mount converged yesterday, stamp fresh →
  `run: false`. No item. Same for every other task at its hour.
- **03:17–23:17** nothing re-evaluates: each occurrence had its one verdict at
  the first scheduler run at-or-after its anchor, and a no-go spends it. Zero items
  created, zero further preconditions run, all day.

**Verdict: holds.** *(Replayed after the 2026-08-13 go/no-go ruling. As first
drafted, the design re-evaluated every unfired occurrence each scheduler run — 24
precondition runs and signal collections per quiet daily task, a ~×20 read
amplification, which is what F10 asked about. The ruling removed both the cost
and the question: one occurrence, one verdict.)*

### S2 — happy path, one agentic task

- **04:02** a contributor closes two issues; **04:17** scheduler run: tidy-issues
  precondition sees issues touched in window → item #900 created,
  `task:status:waiting-for-executor`, Context naming the two issues.
- **04:17:40** the scheduler run's own executor job drains: picks #900, lease
  (read/swap/comment/re-read) — clean claim, `task:status:running-executor`.
- **04:18** precondition re-run: still true; Context refreshed (same two
  issues). No code-work declared. Hand-off: body gets its sections, swap to
  `task:status:running-agent`, hand-off comment, API call → session `s-123`.
- **04:34** agent validates the item in code, triages the two issues within
  Context, verifies ceiling (`none`: no PR opened — ok), comments the result,
  closes #900 `outcome:done`, prints the exec record, captures.

**Verdict: holds.** One item, one claim, one session, one terminal state, all
of it readable on #900.

### S3 — work appears mid-window

- **04:17** tidy-issues precondition: nothing touched → no-go. The occurrence
  is spent.
- **09:03** someone updates an old issue. **09:17** scheduler run: the evaluate-once
  gate holds (this occurrence already had its verdict) → nothing happens.
- **Tomorrow 04:17** the next occurrence evaluates, sees the issue touched
  inside its window, and runs.

**Verdict: holds, with the accepted latency.** *(Replayed after the go/no-go
ruling, which reversed this scenario's original outcome — it used to fire at
09:20.)* The work waits up to a day; the window-scoped signals mean it is
found, not lost. A task for which that latency is wrong declares a finer
`frequency` — which is what create-extractor's `hourly` already does, and is
the mechanism's own answer rather than a special case. Note this is exactly
today's behaviour, so it is parity, not a regression.

## B. Scheduler unreliability

### S4 — the late-fire night (the exclusive-claim replacement, end to end)

GitHub drops the 02:17, 03:17 and 04:17 fires; the first scheduler run lands **05:41**.

- **05:41** scheduler-run job 1, iterating in dependency order (**F9** — see below):
  - baselining: A = 02:00, no item since → precondition true (stamp stale) →
    item #910, `task:status:waiting-for-executor`.
  - growth-extract: A = 03:00 → true; `schedule_after: [basics/baselining]` and #910 is
    open → item #911, `task:status:blocked`, `Blocked-by: #910`.
  - growth-promote: A = 04:00 → true; `schedule_after` extract, #911 open → #912
    blocked by #911.
  - tidy-issues, store-release: independent → #913, #914 `task:status:waiting-for-executor`.
- **05:42** executors drain: #910 claimed (baselining), #913, #914 run in
  parallel — they never depended on the mount ordering. Baselining's code-work
  converges the mount **06:02**; no judgment needed → no hand-off; closes
  #910 `outcome:done` **06:03**.
- **06:17** scheduler-run job 2: #911's blocker closed → `task:status:waiting-for-executor`; picked 06:18;
  extract's agent lands its PR **06:55**, closes #911 `outcome:done`.
- **07:17** scheduler run readies #912; promote runs **07:20**.

**Verdict: holds, and strictly better than today.** Today this night either
runs the chain *beside* baselining (pre-exclusive) or baselining claims the
run and extract/promote **lose the whole day** (deferred slots are spent).
Here the chain completes the same morning, ordered, ~1h of scheduler run-quantized
latency per link. Two findings anyway:

- **F9 (bug in the design as written):** §5's pseudocode iterates
  `discoverTasks()` in arbitrary order. If growth-extract is processed
  *before* baselining in the same scheduler run, `openScheduledItemsOf(after)` finds
  nothing — baselining's item doesn't exist yet — and extract is created
  `task:status:waiting-for-executor`, running beside the mount converge. Job 1 must iterate in
  topological order of `schedule_after` edges (cycles: fall back to declaration order
  and warn). *Amended in DESIGN.md §5.*
- **F1 (optimization, not defect):** dependency readiness is quantized to the
  scheduler run — each chain link waits for the next :17. Optional improvement, same
  event+poll shape as pickup: the converger, on closing an item, checks in
  code for open `task:status:blocked` items naming it and readies those whose
  conditions now hold; the scheduler run stays the backstop. *Added to §15.*

### S5 — the scheduler run is down for three days

Workflow disabled Tuesday 09:00, re-enabled Friday 10:00; first scheduler run **10:17
Friday**.

- Every daily task: A = Friday 04:00 (etc.) — only the **most recent** anchor
  is ever computed, so exactly one occurrence per task is evaluated; Wednesday
  and Thursday are gone, not backfilled. Weekly tasks: A = last Sunday —
  evaluated once if it never fired (occurrence guard finds no item ≥ A).
- Items that were already open Tuesday sat untouched (executors run from the
  scheduler run's workflow in the default deployment, so they were down too);
  unpicked-`task:status:waiting-for-executor` items older than ~2 periods get janitor escalation
  Friday — visible, once.

**Verdict: holds** — the catch-up property carried over from the slot design
intact (most-recent-occurrence-only), with the ledger now being the issue
family instead of the Actions run history.

### S6 — double-fire and index lag

- **04:17:05 and 04:17:20** two scheduler runs start (GitHub duplicate fire). The
  workflow `concurrency` group serializes them; run 2 starts after run 1
  finished creating #920.
- Run 2's occurrence guard must *see* #920 seconds after creation. If the
  guard is implemented over the **search API** it may not — the search index
  lags writes by seconds to minutes. Implemented over the **REST issue list**
  (`state=all`, filter `origin:schedule` + title prefix client-side), the
  read is consistent and #920 is seen.

**Verdict: holds with an implementation constraint → F11:** the guards must
read via the REST list, never the search index. (Today's slot design has the
same latent constraint — `existingIssuesViaSearch` tolerates it only because
runs are an hour apart; the new design's serialized back-to-back runs make it
sharp.) *Amended in DESIGN.md §5.*

## C. Executor concurrency and death

### S7 — two executors race for one item

- **04:17:40** E1 (post-scheduler run drain) and E2 (label-event run for the same
  item) both list ready items and pick #930.
- **04:17:42** E1: read (ready present) → swap → claim comment `c1`.
- **04:17:43** E2: read — raced, still sees `task:status:waiting-for-executor` (its read predates
  E1's swap landing) → swap (no-op removes, no-op add) → claim comment `c2`.
- Both **re-read**: two claim comments; earliest (`c1`) wins. E2 abandons
  #930 — reverting nothing — and picks the next ready item, or exits.

**Verdict: holds** — the verified lease transplants cleanly to N executors;
the loser losing an *item* rather than a session is what's new, and it's
harmless.

### S8 — executor dies after claiming

- **04:20** E1 claims #931 (baselining), code-work starts converging the mount.
- **04:22** the runner is killed (spot eviction / job cancelled). #931 sits
  `task:status:running-executor`, half a converge branch pushed.
- Leash: `task:status:running-executor` with no activity past **1h** → strip back to
  `task:status:waiting-for-executor` with a comment. As first drafted this ran on the **daily**
  janitor, so the strip waited up to ~25h → **F4**: the reclaim should ride
  the **scheduler run** (a deterministic label rule, serialized, hourly), leaving the
  janitor the judgment-heavy sweeps. Worst case then ~2h. *Accepted by the
  owner 2026-08-13; DESIGN §11 amended.*
- **05:17 (as decided — the reclaim rides the scheduler run, F4 accepted)** scheduler run strips
  #931 → ready; E3 claims **05:18**,
  precondition re-runs, code-work **re-runs over the half-done converge** — so
  code-work must be re-entrant after a crash. It already must be today (a
  scheduler run that dies mid-code-work leaves the slot due; the next run
  re-runs it), but the doc never said so → **F12**: state re-entrancy as an
  explicit code-work contract requirement. *Amended in DESIGN.md §6.*

**Verdict: two findings (F4 latency-home, F12 contract gap); no unsoundness.**

### S9 — CCR API transiently down at hand-off

- **04:19** E1 finishes #932's code-work, calls the API — 503. Retries 2s/4s/8s
  — still 503. Design as written: converge `needs-human`.
- But the same minute, E2 is handing off #933 and E3 #934: a **10-minute CCR
  outage converges every in-flight item to `needs-human`**, and a human must
  hand-reset each. The failure isn't the items' — it's the platform's, and it
  is transient → **F3**: on hand-off failure after in-run retries, **revert**
  `task:status:running-executor → task:status:waiting-for-executor` with an attempt-counter comment
  (`handoff-attempts: 2`); each later pickup retries with the scheduler run cadence as
  natural backoff; converge to `needs-human` only at N attempts (say 5, ~5h of
  outage). Visible at every step, bounded, and no human cost for a blip.
  *Amended in DESIGN.md §6.*
- **05:18** (amended) E4 picks #932 again, API healthy, hand-off proceeds.

**Verdict: finding F3 — the as-written policy amplifies platform blips into
triage load; fixed by bounded revert-to-ready.**

### S10 — API timeout, but the session was actually created

- **04:19:00** E1 calls the API for #935; the call **times out** client-side
  at 30s — but the session was created and starts working.
- **04:19:31** E1 retries → a **second session** for #935. Two agents, one
  item: the exact bug class (duplicate PRs) the one-session-one-issue rule
  exists to prevent. The executor cannot tell "failed" from "unconfirmed" —
  invocation is at-least-once under timeout retry, always.
- The design as written has no defense: §7 says the agent needs no claim
  ("the session never receives a queue, only an item") → **F5, the most
  important finding of the exercise**: the verified lease must exist at the
  **agent hop too**. On start, an agent posts its own claim comment (session
  id + the invocation nonce the executor wrote in the hand-off comment),
  re-reads, and the **earliest agent claim wins**; the loser stops without
  touching the item. Cheap, uses the mechanism the system already trusts, and
  turns at-least-once invocation into exactly-one execution. *Amended in
  DESIGN.md §6/§7.*

**Verdict: finding F5 — at-least-once invocation requires the agent-side
lease; without it the design reintroduces duplicate execution.**

## D. Agent-phase failure

### S11 — agent dies mid-run

- **04:21** hand-off of #936, session `s-200` named in the hand-off comment.
- **04:50** the session's container dies. #936 sits `task:status:running-agent`.
- Next janitor run: `task:status:running-agent`, no activity > 3h → comment naming `s-200`
  as the dead session, `needs-human`. Worst case ~24h to surface — parity
  with today's stale `agent-running` sweep.

**Verdict: holds (parity).** The hand-off comment naming the session is what
lets the janitor say *which* session died — better forensics than today.

### S12 — agent did the work, died before converging

- **04:40** agent for #937 (extract) opens PR #501, auto-merge arms, then the
  session dies before commenting/closing.
- Janitor next day: `needs-human` on #937. The human (or the re-queued run)
  finds PR #501 already merged. If instead a human re-queues #937 (strip
  `needs-human`, apply `task:status:waiting-for-executor` — the **F7** affordance below), the
  precondition re-runs and, seeing the window's work already extracted,
  closes it `outcome:obsolete`. Either path converges without duplicating
  the PR.

**Verdict: holds**, *because* re-execution passes through the precondition
again — the §6.4 re-run is what makes crash-retry safe here. **F7** (the
sanctioned human re-queue lever: remove `needs-human`, apply `task:status:waiting-for-executor`,
write-gated like everything else) was implicit; it is now documented.
*Amended in DESIGN.md §4.*

### S13 — obsolete at pickup

- **04:17** tidy-issues item #938 created (issue #77 touched). **04:25** a
  human closes #77 themselves. **04:26** E1 claims #938, precondition re-run:
  no eligible issues → close `outcome:obsolete`, reason commented.
- **09:00** another issue is touched. Occurrence guard: #938 was created ≥
  04:00 → **today's occurrence is consumed**; the new work waits for
  tomorrow 04:17.

**Verdict: holds, with a documented asymmetry (F2, accepted).** An occurrence
that fires-and-obsoletes is spent; one that never fires keeps re-evaluating
(S3). The alternative — letting obsolete re-arm the occurrence — invites
create/obsolete churn loops on flappy preconditions; the guard bounds noise
at one item per task per period, which is the right trade at this scale.
Parity with today (a spent slot) in the worst case, better in S3's case.

## E. Injections — forced and urgent work

### S14 — forced retry of an errored scheduled item

- **Mon 04:30** scheduled item #940 fails (agent error) → open,
  `needs-human`.
- **Mon 10:00** operator diagnoses a transient cause, runs
  `create-work-item tidy/tidy-issues --urgent --supersedes #940` → #941
  created `task:status:waiting-for-executor`+`task:urgent`, no `origin:schedule`; #940 closed as
  superseded by #941.
- **10:01** label event → executor picks #941 first (urgent), runs clean,
  `outcome:done`.
- **Tue 04:17** scheduler run: occurrence guard — was an `origin:schedule` item
  created ≥ Tue 04:00? No (#941 doesn't count, #940 was Monday's) → backlog
  guard — #940 closed, nothing open → normal Tuesday evaluation.

**Verdict: holds** — the §5 guard rules (forced items invisible to guards,
`--supersedes` closing the triage item) play out exactly as specified after
the last review round.

### S15 — forcing while the same task is mid-execution

- **10:00** scheduled item #942 (extract) is `task:status:running-agent`, its session
  writing lesson PRs.
- **10:05** operator, impatient, forces the same task: #943, urgent.
- **10:06** E1 picks #943 — nothing stops it — and a second extract runs
  beside the first: two sessions writing overlapping PRs against the same
  local packs. The forced-item guard-invisibility that S14 *needs* is exactly
  what bites here → **F6**: one task, one execution at a time, enforced at
  **pick**: an executor never picks an item whose exact title (task +
  qualifier) has another item in `task:status:running-executor`/`task:status:running-agent`; and
  `create-work-item` warns when an open same-title item exists. Keyed on the
  full title so fan-out items (same task, different qualifier — S18) still
  run in parallel. The forced item simply *waits* until #942 converges —
  which is what the operator actually wanted. *Amended in DESIGN.md §6/§8.*

**Verdict: finding F6 — the design as written permits concurrent duplicate
execution of one task via forcing; fixed with a same-title pick mutex.**

### S16 — urgent item during a lost label event

- **14:00** urgent item #944 created; the `labeled` webhook delivery is
  dropped (Actions outage). No executor run fires.
- **14:17** scheduler run's drain executor lists ready items — #944 is there
  (listing, not events) — picked first as urgent, runs 14:18.

**Verdict: holds** — events are latency sugar; the poll is the guarantee.
Worst-case urgent latency = one scheduler run interval. (Compare today: a lost label
event waits for the janitor's daily re-arm — up to ~25h.)

## F. Follow-ups, fan-out, fan-in

### S17 — delayed validation of a real-world change

- **Day 1, 04:20** store-release code-work submits extension v2.4 to the store
  review queue; converges its item #950 `outcome:done` (closed), and
  creates follow-up #951: `Blocked-by: #950`, `Not-before: Day 3 04:00Z`,
  `task:status:blocked`, Context: "validate v2.4 review outcome".
- **Day 1–2** every scheduler run's job 2 sees #951: blocker closed ✓, not-before not
  reached ✗ → stays blocked. Nothing picks it; no cost.
- **Day 3, 04:17** not-before passed → `task:status:waiting-for-executor`; **04:18** executor:
  precondition re-run — store API says v2.4 **live** → close #951
  `outcome:obsolete` ("landed on its own"). *(Alternate ending: store
  **rejected** v2.4 → precondition true → hand-off; the agent investigates
  and files the fix PR or converges `needs-human`.)*

**Verdict: holds** — the sketch's "blocked by this work + blocked by time"
plays out with no machinery beyond the two body fields and the scheduler run.

### S18 — fleet fan-out with a fan-in, one member stuck

- **09:00** the enforcer creates 20 items `[claudinite-work]
  sheepdog/fleet-baseline <member>` (distinct qualifiers → F6's mutex keys
  them separately; they run in parallel) plus fan-in #970 `Blocked-by:` all
  twenty, `task:status:blocked`.
- **09:00–13:00** nineteen members converge (`outcome:done`).
- Member-x's item never gets picked — that repo's executor is broken. It sits
  `task:status:waiting-for-executor` for days. Janitor: unpicked past ~2 periods (ad-hoc default:
  daily) → `needs-human` on member-x's item — **open**, so #970 stays
  blocked.
- #970 itself trips the same stale escalation ~2 days later → a second
  `needs-human`. A human closes member-x's item (fixing or writing it off);
  next scheduler run readies #970; the fan-in task reports 19/20 with member-x's
  outcome label telling the story.

**Verdict: holds, slowly.** Everything converges and everything is visible,
but a single stuck member stalls the fan-in until a human acts — there is no
"proceed with quorum / deadline" semantics. Deliberately **not** proposing
one: `Not-after`/quorum fields are exactly the complexity this design's scale
doesn't justify, and the janitor's escalation is the answer at fleet size 20.
Noted in §15 as a known limitation, revisit on evidence.

## G. Lifecycle odds and ends

### S19 — human re-queues after fixing the cause

- **Mon** #960 `needs-human` (a secret had expired). **Tue 09:00** owner
  rotates the secret, removes `needs-human`, applies `task:status:waiting-for-executor` (**F7**,
  now documented as the sanctioned lever — write-gated, same as label-based
  authorization everywhere else in the system).
- **09:01** label event → executor claims, precondition re-runs (still
  true), code-work now succeeds, normal run.
- Note the scheduler run never re-created a second item meanwhile: the open
  `needs-human` item held the backlog guard (§5) — one broken task, one
  item, however many days it takes.

**Verdict: holds** once F7 is stated; before this exercise the design had no
written path from `needs-human` back to execution.

### S20 — task removed while its item is open

- **Mon** pack undeclared; task directory gone from HEAD. Its item #965
  (created last week, `task:status:waiting-for-executor`) is picked **Tue 04:18**: executor step 3
  fails to resolve the task path at HEAD → close #965 `outcome:obsolete`
  ("task gone"), comment. The scheduler run never creates another (task no longer
  discovered).

**Verdict: holds** — parity with today's exit-14, one hop earlier.

## H. Replay under the standing-item model (owner proposal, 2026-08-13)

> Superseded record for the ROLL half (2026-08-20, #1115 — see §L): a declined
> occurrence no longer rolls an open item forward; it files nothing and lands
> as a row on the schedule board, and a pick-time no-go closes its item. The
> occurrence guard, the pick-time yield, forcing-as-waking/minting and the
> first-item rule all stand; the tests behind S1′/S3′/S5/S13′/S14′/S21/S22/
> S23/S26b/S28 are re-pinned to the new model in `sim/scenarios.test.mjs`.

The owner's third-round proposal: *the scheduler run creates a daily task's item
automatically; a failed precondition marks the item delayed until tomorrow's
time.* Every scenario above was replayed under it (with `schedule_after` compiled to
the pick-time yield — see S24 for why the literal `Blocked-by` reading cannot
work). Unchanged: S2 (happy path), S5–S12 (scheduler run outage, double-scheduler run,
executor races and deaths, hand-off failures — none touch generation),
S17–S20 (ad-hoc items keep their old lifecycle: a no-go *closes* them, since
they have no anchor to roll to). What changes, and what is new:

### S1′ — quiet night

- **02:17** scheduler run creates baselining's item #900 `task:status:waiting-for-executor` — no precondition
  asked, creation is calendar-only. **02:18** executor picks #900, collects
  baselining's signals, evaluates: no-go (mount converged, no pending notes) →
  stamps `Not-before: <tomorrow 02:00Z>`, swaps to `task:status:blocked`, records the
  reason. The item **rolls**. Same for each task at its anchor.
- Rest of the day: nothing — the items sit blocked with their wake times
  visible. **One evaluation per task per day**, executor-side; the scheduler run
  evaluated nothing and collected nothing. (F10's 24-attempts cost: gone.)

**Verdict: holds.** The issue list now always shows one open blocked item per
task — the dashboard reading, priced in DESIGN §5.

### S3′ — work appears mid-window

- **04:18** tidy-issues' item rolls (no-go). **09:03** an issue is touched.
  Nothing wakes until **tomorrow 04:17**, when the readiness flip + pick
  re-ask finds the work. Go/no-go held: one ask per period; a task wanting
  finer latency declares a finer frequency.

**Verdict: holds — today's parity, by ruling.**

### S13′ — "obsolete at pickup" becomes the roll

- Old S13: precondition true at creation, false at pickup → close
  `task:status:rejected`. Under the standing-item model there *is* no creation
  verdict; the pick verdict is the only one, and a scheduled no-go rolls
  instead of closing. `task:status:rejected` narrows to: task gone from the repo
  (S20), and ad-hoc items whose reason to exist lapsed (S17's follow-up
  finding the store already live). F2 ("an occurrence that fires-and-obsoletes
  is spent") dissolves — there is no fire-then-obsolete path left for
  scheduled work.

**Verdict: holds, and simpler than what it replaces.**

### S14′/S16′ — forcing is waking

- Scheduled task, operator wants it now: its standing item exists (blocked,
  wake tomorrow). Force = strip `task:status:blocked`, clear `Not-before`, add
  `task:urgent` → picked within a minute (label event) → precondition
  evaluated → runs, or rolls again *with the reason where the operator reads
  it*. No second item, so the S15 same-title collision cannot arise from the
  common force; `create-work-item` (ad-hoc, `--supersedes`) covers the rest.

**Verdict: holds — forcing got simpler than in any earlier model.**

### S21 — the quiet month (new)

- tidy-prs (weekly) finds nothing for five weeks. Its item rolls five times:
  five ready/blocked flips, five `Not-before` bumps, reasons on record, one
  issue. The janitor's stale rule keys on *ready-item age*, which a rolling
  item never accumulates (ready for ~a minute per week) → no false
  escalation. A human reading the repo sees one item saying "quiet since
  July 8, next ask Aug 17".

**Verdict: holds.** The long-lived open item is the feature and the cost at
once — named in DESIGN §5.

### S22 — the hourly task's churn (new)

- create-extractor (hourly), no eligible requests all day: its item rolls
  every hour — ~24 ready/blocked flips and body edits, ~2 pick-evaluate
  executor iterations' worth of API traffic per roll, all on one issue.
  Cheap against quotas (~100 writes/day), noisy on that one item's timeline;
  the roll writes no comment, so it is timeline events, not comment spam.
- **14:40** a request arrives; **15:17** the item readies, picks, code-work
  triages, agent requested → runs. Latency ≤1h, parity with today.

**Verdict: holds, with the churn named and accepted (DESIGN §5).**

### S23 — the chain when the upstream declines (new)

- **02:18** baselining's item rolls (mount fine). **03:17** extract's item
  created `task:status:waiting-for-executor`; the pick-time `schedule_after` yield checks baselining's item:
  *blocked* (rolled — declined this cycle) → **not** live → extract is
  pickable immediately and runs at 03:18. The old world needed the exclusive
  claim NOT to fire on exactly this night; here the ordering dissolves into
  "upstream isn't running, so there is nothing to wait for".
- Variant: baselining sits `needs-human` from a failed Monday run. Extract
  still runs (needs-human is not live) — a broken upstream does not halt its
  dependents indefinitely, the same bound the old claim drew at three days.

**Verdict: holds — and this is the scenario that shows why the yield must
read item *state*, not item *existence*.**

### S24 — the trap: `schedule_after` as `Blocked-by` starves the chain (new)

- Suppose `schedule_after` compiled to `Blocked-by: #<upstream's standing item>`, the
  literal reading of the earlier draft. Baselining is quiet all week — its
  standing item rolls daily and **never closes**. Extract's item, blocked-by
  it, waits for a closure that never comes: readiness requires the blocker
  CLOSED. Extract never runs while its upstream has nothing to do — the
  exact inversion of what `schedule_after` means.
- Hence the fix, folded into DESIGN §6.1/§9: `schedule_after` is a **pick-time
  yield** over the upstream item's live states (ready/executing/agent),
  never a `Blocked-by` edge. `Blocked-by` remains correct for items that
  terminate (follow-ups, fan-ins).

**Verdict: the one real conceptual issue in the standing-item proposal —
found in replay, fixed in the design.**

### S26 — the day after a rolled item finally runs (new; found by the simulator, F13)

- tidy-issues' item #900, created Tuesday 04:17, rolls (quiet Tuesday). An
  issue is touched Tuesday evening; Wednesday 04:17 readies #900, the pick
  says go, the agent finishes and **closes #900 at 04:34 Wednesday**.
- **05:17 Wednesday scheduler run, with the occurrence guard as first drafted**
  ("skip if any family item was *created* at-or-after A"): no open item; the
  most recent item was created *Tuesday* 04:17 < A (Wednesday 04:00) → the
  guard passes → **a second Wednesday item is created**, evaluates go (the
  touched-issue signal is still inside the window), and the task runs twice
  in one period. Prose replays missed this every round; the simulator's S3′
  trace surfaced it on its first run.
- **The fix (F13, folded into DESIGN §5):** the guard needs both halves — an
  occurrence is covered by an item **created** at-or-after A *or* an item
  **closed** at-or-after A. A rolled item created in an earlier period that
  runs today consumes today's occurrence with its closure, not its creation.

**Verdict: a real double-execution bug in the standing-item draft — caught
executable, fixed in the spec, pinned by S3′'s test.**

### The executable round (owner request, 2026-08-13 — every scenario a test)

All of A–G's still-live scenarios gained tests in [`sim/`](sim/): the double
scheduler run (S6), the executor race and the lease (S7), the hand-off failure modes
(S9a/S9b), the duplicate-session agent lease (S10), agent death and the
janitor's leash (S11), the force-while-executing mutex (S15), the lost label
event (S16), the follow-up (S17/S17b), the fan-out with a stuck member
(S18), and the human re-queue (S19). Making them executable found two
deltas and one more spec bug:

- **S12′ (delta):** old S12 ends with the re-queued item closing
  `task:status:rejected`; under the standing-item model the re-ask's no-go
  **rolls** the scheduled item instead — same safety (the precondition
  re-run is still what makes crash-retry safe), better record (the reason
  and the next wake live on the item).
- **S24 (delta):** with F14's sweep in place, the blocked-by starvation is
  no longer *silent* — it surfaces as a stuck-dependency comment, days
  late. Still the wrong wiring; the yield stands.
- **F14 (spec bug):** S18's prose claimed the starving fan-in "trips the
  same stale escalation ~2 days later" — it cannot. The stale rule keys on
  *ready*-age and a blocked item is never ready; as specified, a fan-in
  blocked on a dead child waited **silently forever**. The janitor gains a
  third rule (DESIGN §11): blocked with unresolved blockers past ~2 days →
  an escalation *comment*, labels untouched, so the item still proceeds by
  itself once unstuck. S18's test drives the whole corrected chain:
  qualifiers parallelize, the stuck member escalates out of the queue, the
  fan-in is surfaced, a human close releases it, and it converges on its
  own.

### S28 — the mechanism changes mid-flight (new)

- Noon: an update lands moving tidy-issues from `daily` (04:00) to
  `daily-2h` (02:00) and replacing its precondition. Its standing item is
  asleep, `Not-before: tomorrow 04:00Z` — stamped under the old declaration.
- The item **sleeps out the wake it already carries** (the one scheduling
  fact on an item), is judged there by the **new** precondition, and that
  roll targets the **new** 02:00 anchor; the day after, it wakes at 02:17.
  The update itself never touched the item — no migration, no relabeling.
  An operator wanting the new cadence immediately wakes the item (§8).
- The general rule this pins (DESIGN §14): declarations apply at the next
  evaluation because everything but `Not-before` is computed from HEAD at
  every scheduler run and pick; only a label/field **grammar** change needs a
  migration note, and the simulator is where such a change is rehearsed.

**Verdict: holds, with the stamped-wake precision the simulator forced.**

### S29 — bootstrap beside the old mechanism's issues (new)

- A repo flips to the queue with an open slot-era issue
  (`[claudinite-task] basics/baselining d2026-08-11`, `agent-dispatch`).
- A full day of scheduler runs, drains, and the janitor: the relic's state, labels,
  and comments are byte-identical after — the scheduler run's family list is
  title-filtered and every sweep is `task:*`-label-scoped — while the new
  mechanism runs its own `[claudinite-work]` item beside it. Disjoint
  families are what make the migration flag two-directional (DESIGN §14).

**Verdict: holds.**

### The validation review (owner request, 2026-08-13 — is the simulator honest?)

A line-by-line audit of the simulator against DESIGN.md, hunting implicit
assumptions: every place the model treats as atomic, fresh, or ordered
something GitHub does not promise. Four findings, all now explicit in the
design and executable:

- **S30 / F16 — a stale issue list duplicates the standing item.** The
  occurrence guards assume the scheduler run's REST list sees an item created by a
  prior run. GitHub documents no such cross-node freshness bound. Rather
  than assume, the scheduler run self-heals: more than one open family item → close
  all but the oldest, `task:status:rejected`, dedupe comment.
- **S31 / F17 — the leash arithmetic.** A code-work bound that reaches the
  executing leash is reclaimed *alive*, and the failure mode is a
  **livelock**, not one duplicate: every tenure is reclaimed before it can
  finish, code-work re-executes each cycle, nothing ever converges (the sim
  run shows reclaim/claim/evaluate repeating for 8 straight hours). Fixed
  twice over: leash > code-work-timeout as a wiring-time conformance check,
  and the executor re-verifying its own lease at every state transition so
  a reclaimed-but-alive runner abandons instead of handing off.
- **S32 / F15 — the pick filters race.** Mutex and yield are read from
  possibly-stale state; two executors can pass them together and claim
  different same-title items (or an upstream and its dependent). Fixed with
  the post-claim re-verify: the later claim (comment order) reverts itself
  to ready; the earlier never notices.
- **S32 / F18 — the claim arbiter must be episode-scoped.** "Earliest claim
  comment wins" over the item's *lifetime* makes every dead claim (left
  behind by each revert and reclaim) outrank all future live claimants —
  the reverted item livelocks through reclaim cycles forever. Masked in
  every single-executor test because an executor beats its own stale claim;
  surfaced the moment S32 raced two. The arbiter is now "earliest since the
  item last became ready", with the revert/reclaim comment as the episode
  boundary.
- **S39 / F24 — the boundary must be maintained by *every* path that ends
  an episode.** F18 stated the rule semantically ("earliest claim since the
  item last became ready") and it was implemented over the three paths that
  already wrote a comment — revert, reclaim, hand-wake. The two that end an
  episode *silently* were left out: the roll (comment-free on purpose, §5)
  and the `needs-human` park. Both leave the claim standing, so the next
  claimant loses to a dead one. The roll self-heals in ≤1h via the leash
  reclaim; the park never does, because nothing reclaims a parked item — a
  human following the park's own re-queue instruction (F7) gets a
  permanently unclaimable item. Fixed by **striking the claim**: the
  departing executor appends the marker to its own claim comment, which
  ends the episode without a timeline entry. Found on live traffic during
  the migration burst, not in simulation — S32 raced two executors within
  one episode, and this needs a race *across* one.

Two §6.2 precisions came out of the same audit without needing scenarios:
claim ordering is by server-assigned **comment id**, never timestamps
(one-second granularity ties); and the label swap being two non-atomic API
calls is safe *because* comments arbitrate — but an executor dying between
the two calls leaves a **stateless** open item no rule filters for, so the
janitor gains the stateless-item repair (fourth rule). The full inventory
of what the simulator deliberately does not model — and what defends the
design at each unmodeled boundary — is
[`sim/README.md`](sim/README.md)'s "The unsimulated world".

### S25 — adoption's first scheduler run (new)

- A freshly wired repo's first scheduler run creates *every* task's item — including
  weekly and monthly tasks whose anchors are days past. Evaluated
  immediately, an always-true weekly task would fire off-anchor on the
  least-proven repo (the old first-run concern, #522). So a task's **first**
  item (empty family) is born `task:status:blocked` with `Not-before: <next
  anchor>`: every task's first ask happens at its real anchor. Bootstrap's
  smoke test, when wanted, is the force lever — wake one item by hand.

**Verdict: holds with one deliberate rule, now in §5's pseudocode.**

## I. The work-as-work review (owner corrections, 2026-08-15)

Two owner rulings landed the same day, and this section replays what they
touch. First the **invocation reversal** (recorded in DESIGN §6.6/§7/§15.11
when the mechanism was built): the routine-fire endpoint has no idempotency
key, and the owner's correction was *don't create the duplicates* — one call
per item, never retried, so at-least-once invocation, the hand-off retry (F3)
and the agent-side claim lease (F5) all delete. Then the **work-as-work
correction**: *"The pre work is not pre work. It's work. Sometimes there's
also agentic work. The work can take time. The work can crash. The work
creates PRs. The work is a lot."* The executor-side work step is the whole
task for most of the fleet; every sizing assumption built on "the drain is
quick" was re-derived. The simulator was brought up to both in this same
change — the sections below supersede S9/S10/S31 as previously written.

### S9/S10, replayed under at-most-once invocation

- **S9a (refused)**: the endpoint answers with an error — a token, URL or
  routine is wrong, which no retry fixes. The item converges `needs-human` at
  once, naming the cause; zero sessions exist. (Replaces the bounded
  revert-and-retry of F3, which assumed retrying was safe.)
- **S10a (unanswered, session started)**: the call times out client-side but
  did create a session. Nothing retries — so exactly one session exists, and
  it converges the item itself. The duplicate-session problem F5's lease
  solved can no longer occur.
- **S10b (unanswered, no session)**: the call created nothing. The item stays
  `task:status:running-agent` wearing the outcome-unknown comment, silent, until the
  janitor's agent leash brings it to triage within hours. The cost of never
  guessing is bounded latency on a rare platform failure — the trade the
  owner chose over any path that could put two sessions on one item.

### S31, replayed under the heartbeat (F20 — the leash inflation)

F17 as first written made the executing leash exceed every task's work bound —
which, once the work step is priced as the work, inflates the leash to the
heaviest task in the fleet and slows every dead-executor recovery to match.
The heartbeat replaces that arithmetic:

- **S31**: the wiring check shrinks to the one relation the heartbeat needs —
  interval well inside the leash; a violating configuration is refused at
  construction.
- **S31b**: with heartbeats switched off, the original livelock is still
  demonstrable — a silent long work step is reclaimed alive every cycle,
  re-executes forever, never converges. This is why the heartbeat is
  contract, not courtesy.
- **S31c**: a 130-minute work step heartbeats through two leash windows, is
  never reclaimed, and converges once — long work is now legal.
- **S31d**: the runner dies 40 minutes into that work; heartbeats stop, and
  the reclaim lands within ~leash of the last heartbeat — recovery is bounded
  by the leash, never by the work's duration. The re-pick converges (the work
  step's re-entrancy contract, F12, unchanged).

### S33 — the readiness re-check at close (F1, reopened)

Two fan-out members converge; the close of the second readies the fan-in **in
code, within the minute**, and the follow-on drain runs it — no scheduler run in the
path (`ready` carries `by: close`). S4 gains the matching assertion on the
yield side: the chain's dependent is picked within minutes of its upstream
closing. A close by hand still runs no engine code; S18 keeps the scheduler run as
that path's backstop, unchanged.

### S34/S36 — run granularity, and what causes the next run (F23)

The first simulator brought up to this review still modeled the executor as an
instantaneous loop: all picked items' work phases started in the same virtual
instant, nothing bounded a run, and no test could say *which run* did *what* —
exactly the shape F21 warned about, reproduced in the model meant to catch it
(owner question, 2026-08-15: *"asserted that each executor run completes just
one task from the queue? Have you simulated what causes the next executor
run?"*). The sim models runs as first-class objects. A run performed **one
item** through 2026-08-21 (owner, 2026-08-15: *"An executor performs a task.
It's not a current value. It's the essence of it."*) — then the invocation
bill reversed it (§15.30, #1212, section N below): a run now **drains until
nothing is pickable**, items settled serially in the same run.
**Every run records its cause**: `scheduler-run-drain` — the cron workflow's own drain
job, started by the job graph when the scheduler run left something pickable,
no event involved; `label-event` — a foreign
token's `task:status:waiting-for-executor`/`task:urgent`; `close-drain` — an agent
session's converge path, when its readiness re-check leaves something
pickable (the executor's own closes need no dispatch — the run picks the
next item itself); `failure-redispatch` — the workflow's continuation
job (S36 below). And the pick order is **urgent first, then random among the
ready** (owner, same day — the stale-ready escalation is period-scale, so
nothing leaned on oldest-first), seeded in the sim so scenarios replay
identically.

- **S34** (two tasks with real work plus the day's rolls): the whole morning
  ran in **two invocations**, both `scheduler-run-drain` — extract's hour,
  then the 04:00 batch settling both of its items in one run, picks auditable
  per run; both items converged well inside the hour, and every quiet hour
  skipped its drain.
- **S36** (the broken train — owner question: *"the 2nd executor fails, or
  dies, or times out — what will cause the third executor to start?"*): five
  tasks with work; the one drain run dies two minutes into its fourth item.
  The items it already settled stand, its run-end is never written (the
  record died with the runner), and the answer
  is the **failure-continuation job**: `needs: execute`, `if: failure() ||
  cancelled()`, run by the platform on a fresh runner even after a timeout,
  cancellation, or runner loss, its one step re-dispatching the workflow. The
  test asserts the unaffected items drained within minutes with no cron
  fire involved, the crashed item alone waited out the leash reclaim and then
  converged, and the whole affair cost three invocations. The hourly scheduler run
  drain remains the backstop for the case where the whole run vanishes,
  continuation job included.

### S37/S38 — the operator hold, and resume (owner, 2026-08-16)

The cancellation-intent question: a user cancelling one executor run almost
always means *"this run is stalled — let the system move on"*, and the
mechanism already treats it exactly so (cancellation = crash: the failure
continuation keeps the train moving, the leash frees the item). The intent it
can never express is *"stop processing"*, so that one is a lever:
**`CLAUDINITE_TASKS_SUSPEND_ALL`**, a repo Actions variable every Claudinite
workflow checks as its first act, exiting cleanly having fired nothing.

- **S37 (the hold)**: five tasks mid-drain; the variable set at 04:30. No
  pick, no evaluation happens after the hold — but the in-flight drain
  finishes its *current* item (suspension never interrupts running work) and
  parks between items, re-reading the variable at each pick (§15.30 — the
  env copy lands at run start only, so this is an API read), every later
  cron fire exits as a recorded `suspended-skip`, and every never-picked item
  freezes as `task:status:waiting-for-executor`, untouched — the hold is stateless.
- **S38 (cancel + suspend, then resume)**: the user cancels a stalled run
  mid-work AND suspends before its continuation lands — intent 2 overrides
  intent 1's train, the continuation's re-dispatch parks. Hours later the
  variable is cleared, **and nothing else is done**: the next cron scheduler run alone
  reclaims the cancelled run's long-silent claim, readies what came due, and
  its drain converges the whole queue. The impatient path — a hand-dispatched
  *scheduler* run (scheduler run + drain), not a bare executor run — is the same
  recovery a minute sooner; a bare executor would drain ready items but skip
  the reclaim/ready half.

## J. The triage split (owner, 2026-08-19)

`needs-human` was one word for fifteen different situations, and a person
opening the queue could not tell a secret nobody set (five seconds) from a
worker that crashed (an afternoon) from a PR waiting to be merged (not a fault
at all). It splits by **remedy** into four sub-labels worn beside it —
`action`, `decision`, `approval`, `failure` (DESIGN §4) — and the split turns
out to carry two behaviours that were never anyone's decision, only
consequences of there being one word.

### S40 — the lane rule, from both sides (replaces an assertion, not a scenario)

The finding that started it (**F25**) was not simulated at all: it was
measured in production. An open standing item (an
unqualified item of a scheduled task — DESIGN §3) is what holds its lane, so
any park stopped the task being scheduled — `missingbulb/Shepherd`'s
`fleet-digest` failed once on a permission gap, its item sat parked, and **no
item was ever filed behind it for two days** while the four sweeps whose items
had closed kept running normally. The dashboard read healthy and the series
simply stopped.

The split makes the guard conditional, and the two existing scenarios that
asserted the old behaviour are where it shows:

- **S11** (dead agent, the leash parks the item) asserted *"the backlog guard
  held — no second item while triage sits open"*. A dead session is a
  `decision` park, so the next day's occurrence is now filed beside it: the
  incident waits for a person while the task keeps working.
- **S12′** (the human re-queue after a dead agent) asserted *no* closed item at
  all. The next anchor's item now runs normally — two anchors, two items, not a
  double execution of one occurrence, and the same-title pick mutex (S15) still
  forbids the two running at once, since a park is neither executing nor with an
  agent.

A `failure` park still holds the lane, and so does a park wearing no sub-label:
every item an engine older than the split left behind, and every kind word a
newer engine invents that this one does not know. That is the direction that
has to be safe — a broken task filing work forever is worse than a stopped one.

### S41 — the worker's own triage verdict

The executor sees an exit code and nothing more, so it cannot tell a token
missing a scope from an exception in the worker's own code. A worker that knows
prints `claudinite-needs-human: <kind> — <detail>` before exiting non-zero and
the park routes on it (**S41**); a worker that says nothing parks at `failure`
and holds the lane (**S41b**), which is what every worker written before the
marker existed does in every run.

### S42 — the approval park

A run that deliberately left an unmerged PR **succeeded**, but it is not
finished: it is waiting on a named reviewer. Closing it as `outcome:delivered`
hid that from every surface that counts open work, so it parks open instead —
and does not hold the lane, because the reviewer's silence must delay only the
review. Two anchors pass, two items are filed, and the unreviewed PRs
accumulate visibly rather than silently stopping the task. `outcome:delivered`
loses its only writer and stays readable for the closed issues that carry it.

### S43 — the road back clears both labels

A re-queue that stripped only `needs-human` would leave a live item still
wearing a triage sub-label: a shape no rule defines, and one the janitor's
stateless repair cannot catch either, since the item does wear `task:status:waiting-for-executor`.
The lever clears both. Asserted at the moment the lever is pulled, not at the
end of the run — by then the re-queued item has run and closed, taking every
label with it, and the test would pass over nothing (it did, once, before the
mutation check caught it).

### The prose-only findings (no scenario can carry them)

- **F19 — a long drain starves the scheduler run.** The drain job shares the cron
  workflow's serializing `concurrency` group, so once the heartbeat legalizes
  multi-hour work, a busy drain holds the next hourly fire — instantiation,
  readiness and the leash reclaim all stall behind the very work they
  schedule. Fixed in DESIGN §10: the serialization scopes to the scheduler run alone;
  executor work runs outside it. The sim cannot see workflow concurrency
  (unsimulated-world row); the migration burst verifies the wiring.
- **F21 — throughput was priced as if drains were free.** A drain's real
  throughput is its serial work-step occupancy — at the time, one item per
  run, with self-re-dispatch as the drain-until-empty shape — so executor
  width is the capacity, and the oldest-first fairness exposure is named and
  accepted. DESIGN §10 carries the model; §15.30 later moved the
  drain-until-empty loop inside one run, occupancy arithmetic unchanged.
- **F22 — the durable record was implicit.** Actions logs expire; for an
  agentless run — the majority, under this review's premise — the item's
  terminal comment is the only durable trace, so it must carry the
  `claudinite-task-exec` record and every artifact the work created. DESIGN
  §6.5 makes it contract.

---

## K. Ad-hoc requests (owner, 2026-08-18 — DESIGN §16)

A person marks an ordinary issue and the queue implements it. What these play
is not the happy path (S44 is two lines of it) but the ways a request can be
something other than what it looks like: asked by the wrong person, withdrawn
after it was accepted, broken and silently re-run, asking for a model that
does not exist, pointing at an issue that cannot be read, or re-asked while
the previous run is still standing.

### S44 — a marked issue becomes exactly one run

09:03 the owner marks issue #500 with `task:origin:ad-hoc`. 09:17 the
scheduler run adopts it: #500 itself becomes the item (DESIGN §16.1) — the
machine block lands in its body, `Model: opus` (no body model ⇒ the default),
and the first status goes on. The post-scheduler run drain picks it, the
precondition passes on the author's write access, the hand-off fires once, and
the session leaves a pull request — so #500 **parks open at
`task:status:needs-human-approval`**, which *is* the in-review state, beside
the mark that never comes off. A further day of scheduler runs adopts
**nothing**: the standing status is the exactly-once guard.

### S45 — an unauthorized mark is refused once, and disarmed

The same play with an issue opened by someone with no permission on the repo
and blessed by nobody. The scheduler run adopts it (adoption forms no
judgment), the precondition declines, and `task:status:rejected` lands **on
the still-open issue** — a refusal is nobody's inbox and the run's verdict is
not the issue's validity — with one comment saying why. The standing terminal
status is the disarm: without it every scheduler run for the rest of time
re-adopts and re-refuses the same issue.

### S46 — the approval path, judged by permission

An outsider's issue with `/claude go` from someone with push runs and parks
for review. The same issue with `/claude go` from someone without does not —
the phrase decides nothing on its own; the permission behind it does. And the
permission is the *API-read* permission, not the payload association (F30): a
read-only collaborator — who rides every payload as `COLLABORATOR` — is
refused on their own issue exactly like a stranger.

### S47 — the body model routes the run

`Model: sonnet` in the body reaches the run as sonnet — honored because the
author holds push access (§16.7's gate). `Model: gpt-9` falls back to the
default rather than parking a request nobody can run. Two marked issues make
two items, two runs and two approval parks — neither of which delays the
other, because an approval park holds no lane. The field is re-read and
re-gated at every adoption (F29's guarantee with no label to consume), so no
stale value from this ask can outrank the next one's choice.

### S48 — withdrawal between adoption and pickup

The mark is stripped at 09:17:20, after the scheduler run adopted it and
before the executor reaches it: the precondition declines and **no session is
ever invoked** — the window that exists because adoption and the verdict are
deliberately in different phases. Closing the issue is the same answer with no
run at all: one issue means closing it closes the item, so there is nothing
left to pick or decline.

### S49 — a broken request stays put; clearing the status re-runs it

The session fails. The issue parks at `task:status:needs-human-failure` —
someone reads the trace — and that standing status is what stops the next
scheduler run re-adopting: nothing mechanical re-arms work that writes code.
The person fixes the cause and clears the status — the one re-ask lever the
one-issue shape leaves (§16.3) — and the next scheduler run re-adopts the
*same* record, at whatever model the body asks for now. There is no
predecessor to supersede, because there was only ever one issue.

### S50 — gone declines; unreadable fails the run

Two requests meet a broken read at pickup. One's issue is **gone** — the API
answers it does not exist, and one issue means the item went with it: nothing
to pick, nothing to decline, no write-back to strand. The other's issue exists
but **cannot be read** — a rate limit, a 500. Declining there would eat the
request permanently (F27) over nothing. Instead the run **fails**: the issue
parks at `task:status:needs-human-failure`, open and visible, still marked and
still armed. The API recovers, a human re-queues it (the same clearing lever),
and the run completes to its approval park.

### S51 — an impatient re-ask mid-run is structurally nothing

A re-ask lands while the first run is still with its agent — and under one
issue there is nothing to apply: the mark already stands, the live status says
a run owns it, so the ask changes nothing and no scheduler run adopts a second
session (F28's guarantee, now structural). Once the run settles into its
approval park, the same clearing lever re-runs the record. Two runs, strictly
in sequence, never two sessions on one issue.

## L. No work, no item — the schedule board (owner, 2026-08-20, #1115)

The scheduler run evaluates the precondition when the anchor comes and files a
work item only on a yes; a no is a row on the per-repo `[claudinite-schedule]`
board issue, the watermark ("have I asked this task about this anchor?"). It
fails toward evaluating, never toward skipping, and the executor still
re-evaluates at pick. DESIGN §5 (rewritten) and §15.28 carry the mechanism and
the decision; these scenarios are its executable edges.

### S52 — a decline files no item; the board is created lazily

04:17, tidy-issues' anchor: signals collected, precondition says no. Nothing is
created except — on the first decline ever — the board itself, whose row for
the task names the anchor asked about, the verdict, the reason and the
frequency. A quiet repo's open issues: at most the one board.

### S53 — the watermark holds between anchors

The ~28 hourly scheduler runs between two daily anchors re-ask nothing: the
row's `no` at this anchor is the gate. The next anchor is a new question and is
asked.

### S54/S54b — a deleted or corrupt board fails open, bounded

The board is deleted (or its body mangled) at noon. The 12:17 run finds no row
— absent reads as absent — and re-asks: exactly one redundant evaluation per
task, whose rewritten row then holds every later run back. Never a double run:
a task that RAN this period is covered by the occurrence guard's closed-at
half, not by the board, so it is not even re-asked. A corrupt body degrades
per-row and the next write replaces it wholesale.

### S55 — signal collection fails for one task; the others are untouched

The scheduler holds no `FLEET_GITHUB_TOKEN`, so a fleet task's anchor-side ask
errors. Fail-open: its item is created exactly as the calendar-only model
created it — one per occurrence — and the executor, which holds the
credential, decides at pick (day 1 declines and closes; day 2 finds work and
runs). Every other task still decides at the anchor and files nothing. Never
fewer runs because a read failed; the per-occurrence issue for such tasks is
the named, accepted cost (DESIGN §5).

### S56 — the migration, idempotent, sparing the waiting

The first run that understands the new shape closes the roll model's sleeping
items — open, blocked, a future `Not-before`, no `Blocked-by`, a Last-verdict
section proving a roll — with a comment, and seeds each item's last verdict as
its board row. Running the pass again (every scheduler run runs it) closes
nothing twice. Untouched: an item waiting on a blocker, a first-ever/adoption
`Not-before` (no Last-verdict section), and a rolled item whose wake has
passed — that one is due, and job 2 readies it for an ordinary pick.

### S57 — a decline racing a hand-created item

A person mints the unqualified item at 04:10; the 04:17 anchor finds an open
standing item and never asks — no row, no duplicate, no dedupe. The executor
evaluates the minted item on its own (and, declining, closes it). The reverse
order is S14′: the anchor's decline is a row, the later mint is evaluated on
its own, and the closed-at guard plus the watermark keep the occurrence single.

### S58 — write only what changed

An hourly task declining all day moves only its own row, once per ask; a
scheduler run that asked nothing writes nothing (tidy-repo's "record changes,
never scans", artifact-side). The change test compares the authoritative
columns only — last-asked, verdict, reason — never the derived next-window
column, which is recomputed at write time.

### S59 — the verdict flips between the anchor and the pick

The anchor says go and files the item; the world changes in the seconds before
the drain; the executor re-evaluates, declines, and closes it. One anchor-side
ask, one pick-side evaluation, no re-run for the rest of the period — the
board's verdict is a watermark, never a verdict carried forward.

### S60 — F31: a go row must never gate

Found by this simulator, red before the fix: the anchor says go, writes its
row, and the item CREATE fails (a refused POST). If the watermark honored go
rows, the next run would read "asked" and skip — the occurrence silently
eaten, fewer runs because a *write* failed, the exact inversion of fail-open.
The watermark is therefore scoped to declined rows only; a go (and a
fail-open) verdict's cover is the item it created, judged by the occurrence
guard. The engine test "a yes files the item; the board records the go but
never gates on it (F31)" pins the same property engine-side.

## M. The label vocabulary (owner, 2026-08-20 — #1119, DESIGN §4/§3/§16)

The unified `task:status:*`/`task:origin:*` vocabulary, played from both
directions the migration cares about: the labels the scheduler and executor
**emit** at every transition, and the mechanism's **reaction** to labels that
already exist — the fielded engine's old spellings included, since open items
wearing them are exactly what the first post-migration scheduler run meets.

### S61 — the emitted labels, one item's whole life

The 04:17 ask files the item wearing `task:origin:planned` +
`task:status:waiting-for-executor` and nothing else; the claim swaps the one
status to `running-executor`; the close puts `done` ON and keeps the origin —
the closed issue still says where it came from. One status at every instant,
the origin at every instant, no third thing ever.

### S62/S62b — the decode direction: a fielded engine's leftovers

An open `task:ready` item from an old engine is picked by the drain and driven
to a canonical close — the first transition clears the legacy spelling, which
is how the fleet converges with no mass relabel. A legacy park PAIR routes by
its sub-label: `needs-human` + `task:needs-human-approval` holds nobody's lane
(the next occurrence files beside it), while a BARE `needs-human` — kind
unknown — decodes as `failure` and blocks, the conservative direction.

### S63 — an unknown park kind blocks

`task:needs-human-shrugged` — a future writer, a typo — reads as `failure`
and holds the lane: the unclassifiable park must never silently join an inbox
lane nobody treats as urgent.

### S64 — the request's labels, on one issue throughout

The bare mark (`task:origin:ad-hoc`, no status — what adoption keys on), the
adopted shape, the running shape, and the approval park that IS the in-review
state: exactly one status beside the lifelong mark at every step, on the one
issue the person is already watching.

## N. Invocation cost — the batched drain and the executions accounting (owner, 2026-08-22, #1212)

Actions bills each job's runtime rounded **up** to the next minute, so a
day's cost is the workflow-run count, not the minutes worked — and the
one-item run (§15.22) paid a whole invocation of checkout, setup and rounding
per item, with the hourly drain dispatched even into an empty queue. The
reversal (§15.30): a run drains until nothing is pickable, the drain job
dispatches only when the scheduler run left something pickable, and the hold
is re-read between items. The accounting (`actionExecutions()`) counts every
billed run — a suspended start included, since the runner still spins up to
read the hold — by workflow and, for the executor, by recorded trigger. S34,
S36 and S37 above replay under the new run boundary; the two scenarios here
pin the bill itself.

### S65 — a working day's bill

A full day of scheduled work — the 02:00/03:00/04:00 morning chain, tidy,
a release — plus ad-hoc work: a marked request and a hand-created item of a
manual task. Seven pieces of work converge for exactly **29 invocations**:
the cron's 24 scheduler runs (the floor), one drain per hour that had work
(four — the 04:00 anchor's three items settle in the one 04:17 run), and the
hand-created item's one label event. The 20 hours with nothing pickable
dispatched no executor at all.

### S66 — the quiet day's floor

No signals, no items: **24 invocations**, the hourly cron alone — every
scheduler run skipped its drain, and no executor runner ever started. Under
the retired shape the same day cost 48.

## Findings ledger

| # | severity | what | resolution |
|---|---|---|---|
| **F5** | **design bug** | CCR invocation is at-least-once under timeout retry → two sessions on one item (S10) | first fixed with an agent-side claim lease; **superseded 2026-08-15 (§I)**: invocation is at-most-once — one call per item, never retried — so no second session can exist and the lease deleted (S10a/S10b are the replacement tests; the nonce survives as a replay check) |
| **F9** | **design bug** | same-scheduler run `schedule_after` wiring depends on task iteration order (S4) | first fixed by topological iteration; **retired unbuilt** by the standing-item model — `schedule_after` moved to the pick-time yield (S23/S24), so creation order stopped mattering |
| **F6** | **design bug** | forcing can run a task concurrently with itself (S15) | **fixed in DESIGN §6/§8**: same-title pick mutex + create-time warning; the standing-item model removes the common case outright (force = wake the existing item, S14′) |
| **F3** | policy gap | as-written hand-off failure policy turns platform blips into triage load (S9) | first fixed with bounded revert-and-retry; **superseded 2026-08-15 (§I)**: no retry exists to bound — refused converges `needs-human` at once (S9a), unanswered is settled by the agent leash (S10b) |
| **F12** | contract gap | code-work re-runs after an executor death; re-entrancy was never stated (S8) | **fixed in DESIGN §6**: re-entrancy is an explicit code-work requirement (it was already implicitly required today) |
| **F13** | **design bug** | the occurrence guard's created-at half alone double-executes: a rolled item that runs today was created yesterday, so after it closes the same-day scheduler run creates a second item for the same occurrence (S26) | **fixed in DESIGN §5**: the guard is created-at-or-after A *or closed*-at-or-after A. Caught by the simulator's first run — no prose replay had seen it |
| **F14** | **design bug** | a blocked item whose dependency never resolves waits silently forever: §11 claimed the stale escalation covers it, but that rule keys on ready-age and a blocked item is never ready (S18's fan-in) | **fixed in DESIGN §11**: a third janitor rule — blocked with unresolved blockers past ~2 days gets an escalation comment, labels untouched. Caught by making S18 executable |
| **F15** | **design bug** | the pick filters (same-title mutex, `schedule_after` yield) read stale state — two executors can claim different items the filters should serialize (S32) | **fixed in DESIGN §6.1**: post-claim re-verify; the later claim (comment order) reverts itself to ready |
| **F16** | implicit assumption | the occurrence guards assume the scheduler run's REST list sees creations from prior runs; GitHub documents no cross-node freshness bound (S30) | **made explicit + defended in DESIGN §5**: the scheduler run self-heals — more than one open family item closes all but the oldest |
| **F17** | **design bug** | a work bound reaching the executing leash livelocks the occurrence: reclaimed alive every cycle, the work re-runs forever, never converges (S31b) | first fixed as leash > work-bound; **reframed 2026-08-15 (§I, F20)**: heartbeat comments during the work step — the leash measures executor death, not work duration; the wiring check shrinks to heartbeat interval < leash (S31, S31c, S31d); the transition lease re-verify stays |
| **F18** | **design bug** | lifetime-scoped claim arbitration lets dead claims (from reverts/reclaims) outrank every future claimant — the item livelocks; masked in single-executor tests (S32) | **fixed in DESIGN §6.2**: the arbiter is episode-scoped — earliest claim since the item last became ready, by comment id |
| **F11** | implementation constraint | guards over the search index race its lag; back-to-back serialized scheduler runs make it sharp (S6) | **fixed in DESIGN §5**: guards read the REST issue list, never search |
| **F7** | doc gap | no written path from `needs-human` back to execution (S12, S19) | **fixed in DESIGN §4**: strip `needs-human` + apply `task:status:waiting-for-executor` is the sanctioned re-queue |
| **F4** | **decided** | executing-leash reclaim on the daily janitor = up to ~25h stall for a dead executor (S8) | **accepted 2026-08-13**: the reclaim rides the scheduler run (deterministic label rule, ~2h worst case); janitor keeps the judgment sweeps — DESIGN §11 |
| **F10** | **decided** | mid-window firing costs up to 24 precondition evaluations + signal collections per unfired daily occurrence (S1/S3) | **resolved twice**: first by the go/no-go ruling (one verdict per occurrence — which required a ledger read), then properly by the standing-item model (S1′): the verdict is one-per-period at pick, the memory is the item's own `Not-before`, no ledger at all |
| **F1** | **decided** | chain readiness quantized to the scheduler run, ~1h/link (S4) | declined 2026-08-13; **reopened and accepted 2026-08-15 (§I)**: under the work-as-work model the ~1h/link stacks on drain occupancy — whoever closes an item re-checks its dependents' readiness in code, the scheduler run stays the backstop (S33, S4) |
| **F2** | dissolved | an occurrence that fires-and-obsoletes is spent for the period (S13) | the standing-item model has no fire-then-obsolete path for scheduled work — the pick verdict is the only verdict, and a no-go rolls (S13′) |
| — | accepted | fan-in stalls on one stuck child until a human acts (S18) | documented here; no quorum/deadline semantics at this scale |
| **F8** | migration detail | signal collectors' self-trigger exclusions must cover `[claudinite-work]` titles and the new labels | **noted in DESIGN §14** |
| **F19** | **design bug** | a long drain holds the cron workflow's concurrency group and starves the hourly scheduler run — legal the moment the heartbeat legalizes multi-hour work (§I) | **fixed in DESIGN §10**: the serialization scopes to the scheduler run alone; executor work runs outside it. Unsimulable (workflow concurrency); the migration burst verifies the wiring |
| **F20** | **design bug** | one global executing leash must exceed the heaviest task's work bound, so a single slow task slows every dead-executor recovery fleet-wide (§I) | **fixed in DESIGN §6.5/§11**: heartbeat comments during the work step; F17's wiring check reframed (S31, S31b, S31c, S31d) |
| **F21** | sizing gap | throughput was priced as if drains were free; a drain's real throughput is its serial work-step occupancy (§I) | **stated in DESIGN §10**: `maxItems` and executor width as the primary capacity parameters, self-re-dispatch for drain-until-empty, the oldest-first fairness exposure named |
| **F22** | contract gap | the durable per-run record was implicit — Actions logs expire, and an agentless run leaves no other trace (§I) | **fixed in DESIGN §6.5**: the terminal comment carries the `claudinite-task-exec` record and every artifact the work created |
| **F24** | **design bug** | F18's episode boundary was stated as a rule ("earliest claim since the item last became ready") and implemented over only the paths that already wrote a comment; the roll and the `needs-human` park end an episode silently and leave the claim standing, so the next claimant loses to a dead one — the roll costs a leash period, the park livelocks forever (S39) | **fixed in DESIGN §6.2**: letting go of an open item kills your claim — the departing executor strikes its own claim comment, which ends the episode without the timeline entry §5 refuses. Found on live traffic (a member's first re-queue), not in simulation |
| **F25** | **design bug** | one open park stops its task being scheduled at all: the standing-item guard cannot tell a fault from an inbox, so a permission gap parked `missingbulb/Shepherd`'s `fleet-digest` for two days behind one item while its dashboard read healthy ([#1032](https://github.com/missingbulb/Claudinite/issues/1032), Shepherd#37) | **fixed in DESIGN §4/§5**: the guard is conditional — only a `failure` park (and any park an older engine left unclassified) holds the lane; `action`, `decision` and `approval` are one person's inbox and the schedule goes on around them (S40, and S11/S12′ rewritten to the new property). Found in production, not in simulation — the sim had encoded the old behaviour as an assertion |
| **F23** | **sim fidelity bug** | the simulator modeled the executor as an instantaneous unbounded loop — items' work started concurrently, nothing modeled run boundaries or what triggers the next run — so F21's occupancy model had no executable teeth (§I) | **fixed in the sim**: a run performs one item (structural — DESIGN §15.22), picks urgent-then-random, and records its trigger, the failure continuation included (§15.23); asserted by S34/S36, with S4's chain re-verified under it |
| **F26** | doc bug | §9's follow-up bullet and S17 still had a run *ending* `outcome:delivered` after the 2026-08-19 triage split retired it as written-by-nothing | **fixed**: a run that delivered something long-running closes `task:status:done` (fielded spelling `outcome:done` until the vocabulary rename — §15.25); the retired label keeps its read-only row in §4 |
| **F27** | **design bug** | "the issue cannot be read at all" was a precondition *refusal*: a transient API failure converged the item obsolete while the decline's write-back could not reach the unreadable issue — the request silently eaten, `claude-queued` stranded forever | **fixed in DESIGN §16.4** (owner, 2026-08-19): only a definitive *gone* declines; any other read failure fails the run into the failure park, open and re-queueable (S50) |
| **F28** | **design bug** | adoption had no prior-item guard: re-applying `claude-task` beside an open item created a second item for the same issue, and the parked predecessor stayed open forever — S49's own retry story walked straight into it | **fixed in DESIGN §16.3** (owner, 2026-08-19): one issue, one live item — a live prior item leaves the mark waiting, unconsumed; a parked one is superseded (closed obsolete) by the new adoption (S49, S51) |
| **F29** | design gap | model labels accumulated across asks, and multiples resolved by family-precedence order — a stale label from an earlier ask outranked the newest one | **fixed in DESIGN §16.3/§16.7** (owner, 2026-08-19): the model labels are consumed with the mark, so each ask names its model afresh (S47) |
| **F30** | security precision | §16.4 read `author_association` as "the asker's permission on the repository": `MEMBER` is any org member and `COLLABORATOR` includes read-only collaborators — broader than the push access #1010 asked for | **fixed in DESIGN §16.4** (owner, 2026-08-19): push permission is read from the permission API; the association is at most a prefilter (S46) |
| **F31** | **design bug** | the schedule board's go rows, read as watermark, eat an occurrence whenever the item's create fails after the row lands — fewer runs because a WRITE failed, the inversion of #1115's fail-open rule (S60) | **fixed in DESIGN §5/§15.28**: the watermark is scoped to declined rows only; a go/fail-open verdict's cover is the item it created, judged by the occurrence guard. Caught by the simulator before any engine code ran |

What the exercise did **not** find: any scenario where work is lost silently,
executed with no record, or where two mechanisms disagree about an item's
state — the properties the issue-as-single-source-of-truth shape was chosen
for. Every failure path ends at a labeled, commented issue.
