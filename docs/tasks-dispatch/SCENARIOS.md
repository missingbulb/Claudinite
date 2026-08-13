# Task dispatch — scenario play-through

Twenty scenarios played, minute by minute, against the mechanism exactly as
[DESIGN.md](DESIGN.md) specifies it (owner request on #784: *"play them out
using this mechanism, and see if there are conceptual issues we missed"*).
Each scenario ends in a verdict: **holds** (the design handles it as written),
or a numbered **finding**. The findings ledger at the end classifies every
finding and says what was done about it — some amended DESIGN.md in this same
change, some are owner calls added to its §15.

## Cast and constants

A fictional but realistic repo, tasks drawn from the real fleet:

| task | frequency (anchor) | model | ceiling | notes |
|---|---|---|---|---|
| `basics/baselining` | daily-2h (02:00Z) | sonnet | merged-pr | prework converges the mount; conditional hand-off |
| `grow/growth-extract` | daily-1h (03:00Z) | opus | merged-pr | `after: ['basics/baselining']` |
| `grow/growth-promote` | daily (04:00Z) | opus | open-pr | canon repo; `after: ['grow/growth-extract']` |
| `tidy/tidy-issues` | daily (04:00Z) | sonnet | none | precondition: issue touched in window |
| `gcec/create-extractor` | hourly | sonnet | open-pr | prework-heavy, conditional hand-off |
| `chrome/store-release` | daily (04:00Z) | none | none | agentless: prework only |
| `sheepdog/fleet-baseline` | manual | sonnet | merged-pr | fan-out target |

Constants: tick cron minute **:17** (hourly); executor = post-tick drain job +
`task:ready`-labeled event runs; janitor = a daily item around 04:00; leashes —
`task:executing` 1h, `task:agent` 3h, unpicked-`task:ready` ~2 periods.
"E1/E2" are executor iterations (workflow runs); "the API" is the CCR
session-creation call.

---

## A. Routine nights

### S1 — quiet night, nothing to do

- **02:17** tick: baselining — occurrence guard passes (no item ≥ 02:00),
  backlog guard passes, precondition: mount converged yesterday, stamp fresh →
  `run: false`. No item. Same for every other task at its hour.
- **03:17–23:17** nothing re-evaluates: each occurrence had its one verdict at
  the first tick at-or-after its anchor, and a no-go spends it. Zero items
  created, zero further preconditions run, all day.

**Verdict: holds.** *(Replayed after the 2026-08-13 go/no-go ruling. As first
drafted, the design re-evaluated every unfired occurrence each tick — 24
precondition runs and signal collections per quiet daily task, a ~×20 read
amplification, which is what F10 asked about. The ruling removed both the cost
and the question: one occurrence, one verdict.)*

### S2 — happy path, one agentic task

- **04:02** a contributor closes two issues; **04:17** tick: tidy-issues
  precondition sees issues touched in window → item #900 created,
  `task:ready`, Context naming the two issues.
- **04:17:40** the tick's own executor job drains: picks #900, lease
  (read/swap/comment/re-read) — clean claim, `task:executing`.
- **04:18** precondition re-run: still true; Context refreshed (same two
  issues). No prework declared. Hand-off: body gets its sections, swap to
  `task:agent`, hand-off comment, API call → session `s-123`.
- **04:34** agent validates the item in code, triages the two issues within
  Context, verifies ceiling (`none`: no PR opened — ok), comments the result,
  closes #900 `outcome:done`, prints the exec record, captures.

**Verdict: holds.** One item, one claim, one session, one terminal state, all
of it readable on #900.

### S3 — work appears mid-window

- **04:17** tidy-issues precondition: nothing touched → no-go. The occurrence
  is spent.
- **09:03** someone updates an old issue. **09:17** tick: the evaluate-once
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

GitHub drops the 02:17, 03:17 and 04:17 fires; the first tick lands **05:41**.

- **05:41** tick job 1, iterating in dependency order (**F9** — see below):
  - baselining: A = 02:00, no item since → precondition true (stamp stale) →
    item #910, `task:ready`.
  - growth-extract: A = 03:00 → true; `after: [basics/baselining]` and #910 is
    open → item #911, `task:blocked`, `Blocked-by: #910`.
  - growth-promote: A = 04:00 → true; `after` extract, #911 open → #912
    blocked by #911.
  - tidy-issues, store-release: independent → #913, #914 `task:ready`.
- **05:42** executors drain: #910 claimed (baselining), #913, #914 run in
  parallel — they never depended on the mount ordering. Baselining's prework
  converges the mount **06:02**; no judgment needed → no hand-off; closes
  #910 `outcome:done` **06:03**.
- **06:17** tick job 2: #911's blocker closed → `task:ready`; picked 06:18;
  extract's agent lands its PR **06:55**, closes #911 `outcome:done`.
- **07:17** tick readies #912; promote runs **07:20**.

**Verdict: holds, and strictly better than today.** Today this night either
runs the chain *beside* baselining (pre-exclusive) or baselining claims the
run and extract/promote **lose the whole day** (deferred slots are spent).
Here the chain completes the same morning, ordered, ~1h of tick-quantized
latency per link. Two findings anyway:

- **F9 (bug in the design as written):** §5's pseudocode iterates
  `discoverTasks()` in arbitrary order. If growth-extract is processed
  *before* baselining in the same tick, `openScheduledItemsOf(after)` finds
  nothing — baselining's item doesn't exist yet — and extract is created
  `task:ready`, running beside the mount converge. Job 1 must iterate in
  topological order of `after` edges (cycles: fall back to declaration order
  and warn). *Amended in DESIGN.md §5.*
- **F1 (optimization, not defect):** dependency readiness is quantized to the
  tick — each chain link waits for the next :17. Optional improvement, same
  event+poll shape as pickup: the converger, on closing an item, checks in
  code for open `task:blocked` items naming it and readies those whose
  conditions now hold; the tick stays the backstop. *Added to §15.*

### S5 — the tick is down for three days

Workflow disabled Tuesday 09:00, re-enabled Friday 10:00; first tick **10:17
Friday**.

- Every daily task: A = Friday 04:00 (etc.) — only the **most recent** anchor
  is ever computed, so exactly one occurrence per task is evaluated; Wednesday
  and Thursday are gone, not backfilled. Weekly tasks: A = last Sunday —
  evaluated once if it never fired (occurrence guard finds no item ≥ A).
- Items that were already open Tuesday sat untouched (executors run from the
  tick's workflow in the default deployment, so they were down too);
  unpicked-`task:ready` items older than ~2 periods get janitor escalation
  Friday — visible, once.

**Verdict: holds** — the catch-up property carried over from the slot design
intact (most-recent-occurrence-only), with the ledger now being the issue
family instead of the Actions run history.

### S6 — double-fire and index lag

- **04:17:05 and 04:17:20** two tick runs start (GitHub duplicate fire). The
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

- **04:17:40** E1 (post-tick drain) and E2 (label-event run for the same
  item) both list ready items and pick #930.
- **04:17:42** E1: read (ready present) → swap → claim comment `c1`.
- **04:17:43** E2: read — raced, still sees `task:ready` (its read predates
  E1's swap landing) → swap (no-op removes, no-op add) → claim comment `c2`.
- Both **re-read**: two claim comments; earliest (`c1`) wins. E2 abandons
  #930 — reverting nothing — and picks the next ready item, or exits.

**Verdict: holds** — the verified lease transplants cleanly to N executors;
the loser losing an *item* rather than a session is what's new, and it's
harmless.

### S8 — executor dies after claiming

- **04:20** E1 claims #931 (baselining), prework starts converging the mount.
- **04:22** the runner is killed (spot eviction / job cancelled). #931 sits
  `task:executing`, half a converge branch pushed.
- Leash: `task:executing` with no activity past **1h** → strip back to
  `task:ready` with a comment. As first drafted this ran on the **daily**
  janitor, so the strip waited up to ~25h → **F4**: the reclaim should ride
  the **tick** (a deterministic label rule, serialized, hourly), leaving the
  janitor the judgment-heavy sweeps. Worst case then ~2h. *Accepted by the
  owner 2026-08-13; DESIGN §11 amended.*
- **05:17 (as decided — the reclaim rides the tick, F4 accepted)** tick strips
  #931 → ready; E3 claims **05:18**,
  precondition re-runs, prework **re-runs over the half-done converge** — so
  prework must be re-entrant after a crash. It already must be today (a
  scheduler run that dies mid-prework leaves the slot due; the next run
  re-runs it), but the doc never said so → **F12**: state re-entrancy as an
  explicit prework contract requirement. *Amended in DESIGN.md §6.*

**Verdict: two findings (F4 latency-home, F12 contract gap); no unsoundness.**

### S9 — CCR API transiently down at hand-off

- **04:19** E1 finishes #932's prework, calls the API — 503. Retries 2s/4s/8s
  — still 503. Design as written: converge `needs-human`.
- But the same minute, E2 is handing off #933 and E3 #934: a **10-minute CCR
  outage converges every in-flight item to `needs-human`**, and a human must
  hand-reset each. The failure isn't the items' — it's the platform's, and it
  is transient → **F3**: on hand-off failure after in-run retries, **revert**
  `task:executing → task:ready` with an attempt-counter comment
  (`handoff-attempts: 2`); each later pickup retries with the tick cadence as
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
- **04:50** the session's container dies. #936 sits `task:agent`.
- Next janitor run: `task:agent`, no activity > 3h → comment naming `s-200`
  as the dead session, `needs-human`. Worst case ~24h to surface — parity
  with today's stale `agent-running` sweep.

**Verdict: holds (parity).** The hand-off comment naming the session is what
lets the janitor say *which* session died — better forensics than today.

### S12 — agent did the work, died before converging

- **04:40** agent for #937 (extract) opens PR #501, auto-merge arms, then the
  session dies before commenting/closing.
- Janitor next day: `needs-human` on #937. The human (or the re-queued run)
  finds PR #501 already merged. If instead a human re-queues #937 (strip
  `needs-human`, apply `task:ready` — the **F7** affordance below), the
  precondition re-runs and, seeing the window's work already extracted,
  closes it `outcome:obsolete`. Either path converges without duplicating
  the PR.

**Verdict: holds**, *because* re-execution passes through the precondition
again — the §6.4 re-run is what makes crash-retry safe here. **F7** (the
sanctioned human re-queue lever: remove `needs-human`, apply `task:ready`,
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
  created `task:ready`+`task:urgent`, no `origin:schedule`; #940 closed as
  superseded by #941.
- **10:01** label event → executor picks #941 first (urgent), runs clean,
  `outcome:done`.
- **Tue 04:17** tick: occurrence guard — was an `origin:schedule` item
  created ≥ Tue 04:00? No (#941 doesn't count, #940 was Monday's) → backlog
  guard — #940 closed, nothing open → normal Tuesday evaluation.

**Verdict: holds** — the §5 guard rules (forced items invisible to guards,
`--supersedes` closing the triage item) play out exactly as specified after
the last review round.

### S15 — forcing while the same task is mid-execution

- **10:00** scheduled item #942 (extract) is `task:agent`, its session
  writing lesson PRs.
- **10:05** operator, impatient, forces the same task: #943, urgent.
- **10:06** E1 picks #943 — nothing stops it — and a second extract runs
  beside the first: two sessions writing overlapping PRs against the same
  local packs. The forced-item guard-invisibility that S14 *needs* is exactly
  what bites here → **F6**: one task, one execution at a time, enforced at
  **pick**: an executor never picks an item whose exact title (task +
  qualifier) has another item in `task:executing`/`task:agent`; and
  `create-work-item` warns when an open same-title item exists. Keyed on the
  full title so fan-out items (same task, different qualifier — S18) still
  run in parallel. The forced item simply *waits* until #942 converges —
  which is what the operator actually wanted. *Amended in DESIGN.md §6/§8.*

**Verdict: finding F6 — the design as written permits concurrent duplicate
execution of one task via forcing; fixed with a same-title pick mutex.**

### S16 — urgent item during a lost label event

- **14:00** urgent item #944 created; the `labeled` webhook delivery is
  dropped (Actions outage). No executor run fires.
- **14:17** tick's drain executor lists ready items — #944 is there
  (listing, not events) — picked first as urgent, runs 14:18.

**Verdict: holds** — events are latency sugar; the poll is the guarantee.
Worst-case urgent latency = one tick interval. (Compare today: a lost label
event waits for the janitor's daily re-arm — up to ~25h.)

## F. Follow-ups, fan-out, fan-in

### S17 — delayed validation of a real-world change

- **Day 1, 04:20** store-release prework submits extension v2.4 to the store
  review queue; converges its item #950 `outcome:delivered` (closed), and
  creates follow-up #951: `Blocked-by: #950`, `Not-before: Day 3 04:00Z`,
  `task:blocked`, Context: "validate v2.4 review outcome".
- **Day 1–2** every tick's job 2 sees #951: blocker closed ✓, not-before not
  reached ✗ → stays blocked. Nothing picks it; no cost.
- **Day 3, 04:17** not-before passed → `task:ready`; **04:18** executor:
  precondition re-run — store API says v2.4 **live** → close #951
  `outcome:obsolete` ("landed on its own"). *(Alternate ending: store
  **rejected** v2.4 → precondition true → hand-off; the agent investigates
  and files the fix PR or converges `needs-human`.)*

**Verdict: holds** — the sketch's "blocked by this work + blocked by time"
plays out with no machinery beyond the two body fields and the tick.

### S18 — fleet fan-out with a fan-in, one member stuck

- **09:00** the enforcer creates 20 items `[claudinite-work]
  sheepdog/fleet-baseline <member>` (distinct qualifiers → F6's mutex keys
  them separately; they run in parallel) plus fan-in #970 `Blocked-by:` all
  twenty, `task:blocked`.
- **09:00–13:00** nineteen members converge (`outcome:done`).
- Member-x's item never gets picked — that repo's executor is broken. It sits
  `task:ready` for days. Janitor: unpicked past ~2 periods (ad-hoc default:
  daily) → `needs-human` on member-x's item — **open**, so #970 stays
  blocked.
- #970 itself trips the same stale escalation ~2 days later → a second
  `needs-human`. A human closes member-x's item (fixing or writing it off);
  next tick readies #970; the fan-in task reports 19/20 with member-x's
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
  rotates the secret, removes `needs-human`, applies `task:ready` (**F7**,
  now documented as the sanctioned lever — write-gated, same as label-based
  authorization everywhere else in the system).
- **09:01** label event → executor claims, precondition re-runs (still
  true), prework now succeeds, normal run.
- Note the tick never re-created a second item meanwhile: the open
  `needs-human` item held the backlog guard (§5) — one broken task, one
  item, however many days it takes.

**Verdict: holds** once F7 is stated; before this exercise the design had no
written path from `needs-human` back to execution.

### S20 — task removed while its item is open

- **Mon** pack undeclared; task directory gone from HEAD. Its item #965
  (created last week, `task:ready`) is picked **Tue 04:18**: executor step 3
  fails to resolve the task path at HEAD → close #965 `outcome:obsolete`
  ("task gone"), comment. The tick never creates another (task no longer
  discovered).

**Verdict: holds** — parity with today's exit-14, one hop earlier.

---

## Findings ledger

| # | severity | what | resolution |
|---|---|---|---|
| **F5** | **design bug** | CCR invocation is at-least-once under timeout retry → two sessions on one item (S10) | **fixed in DESIGN §6/§7**: the verified lease is required at the agent hop — agent claims with the executor's invocation nonce, earliest claim wins |
| **F9** | **design bug** | same-tick `after` wiring depends on task iteration order (S4) | **fixed in DESIGN §5**: job 1 iterates in topological order of `after` edges |
| **F6** | **design bug** | forcing can run a task concurrently with itself (S15) | **fixed in DESIGN §6/§8**: same-title pick mutex + create-time warning |
| **F3** | policy gap | as-written hand-off failure policy turns platform blips into triage load (S9) | **fixed in DESIGN §6**: bounded revert-to-ready with attempt counter; `needs-human` at N attempts |
| **F12** | contract gap | prework re-runs after an executor death; re-entrancy was never stated (S8) | **fixed in DESIGN §6**: re-entrancy is an explicit prework requirement (it was already implicitly required today) |
| **F11** | implementation constraint | guards over the search index race its lag; back-to-back serialized ticks make it sharp (S6) | **fixed in DESIGN §5**: guards read the REST issue list, never search |
| **F7** | doc gap | no written path from `needs-human` back to execution (S12, S19) | **fixed in DESIGN §4**: strip `needs-human` + apply `task:ready` is the sanctioned re-queue |
| **F4** | **decided** | executing-leash reclaim on the daily janitor = up to ~25h stall for a dead executor (S8) | **accepted 2026-08-13**: the reclaim rides the tick (deterministic label rule, ~2h worst case); janitor keeps the judgment sweeps — DESIGN §11 |
| **F10** | **decided** | mid-window firing costs up to 24 precondition evaluations + signal collections per unfired daily occurrence (S1/S3) | **resolved 2026-08-13 by ruling**: a precondition is go/no-go, not maybe-later — one verdict per occurrence, a no-go spends it. Cost and question both gone; S1/S3 replayed |
| **F1** | **decided** | chain readiness quantized to the tick, ~1h/link (S4) | **declined 2026-08-13**: the tick's readiness job stays the single site; ~1h/link is within tolerance |
| **F2** | accepted | an occurrence that fires-and-obsoletes is spent for the period (S13) | documented here; now simply consistent with the go/no-go ruling — every occurrence gets one verdict and one chance |
| — | accepted | fan-in stalls on one stuck child until a human acts (S18) | documented here; no quorum/deadline semantics at this scale |
| **F8** | migration detail | signal collectors' self-trigger exclusions must cover `[claudinite-work]` titles and the new labels | **noted in DESIGN §14** |

What the exercise did **not** find: any scenario where work is lost silently,
executed with no record, or where two mechanisms disagree about an item's
state — the properties the issue-as-single-source-of-truth shape was chosen
for. Every failure path ends at a labeled, commented issue.
