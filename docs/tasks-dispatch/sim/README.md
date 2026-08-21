# The dispatch simulator — SCENARIOS.md, executable

A discrete-event simulator of the [tasks-dispatch DESIGN](../DESIGN.md), so
the scenario play-throughs in [SCENARIOS.md](../SCENARIOS.md) run as tests
instead of living only as prose. Owner request, 2026-08-13: *"add the 'at
time x — y happens' to the tests, and then execute the simulator — this will
help us make the design more robust."* It has caught two real spec bugs prose
replay missed — **F13** (the occurrence guard's missing closed-at half) and
**F14** (the stale rule can never see a stuck *blocked* item) — which is the
whole argument for its existence.

- [`sim.mjs`](sim.mjs) — the model: a virtual clock and an ordered event
  queue (no threads, no waits, no wall clock), an in-memory issue store, and
  the mechanism as DESIGN.md specifies it — the scheduler run's jobs; executor
  RUNS as first-class objects (one item each, urgent-then-random pick under a
  seeded PRNG, the verified lease, a recorded trigger: scheduler-run-drain /
  label-event / close-drain / re-dispatch / failure-redispatch); the work
  step → hand-off → converge as timed phases with heartbeat comments;
  at-most-once invocation (fired / refused / unanswered); the readiness
  re-check on close; the janitor's rules; and the force/re-queue levers.
  Since #1115 the scheduler run evaluates at the anchor and the schedule
  board is a modeled ARTIFACT — rows the engine writes, a write log, and the
  absent/corrupt/refused-create degradations — never the rule's intent.
  Ad-hoc requests (DESIGN §16) are modeled as their own issue store beside the
  work items: a mark, the scheduler run's adopt job, the built-in request task's
  precondition, and the two write-backs — each modeled where the engine will
  leave a mark, never where the rule merely says something happened.
- [`scenarios.test.mjs`](scenarios.test.mjs) — the play-throughs, numbered
  to match SCENARIOS.md. Each test schedules world events at instants
  (`sim.at('2026-08-12T09:03Z', …)`), runs the clock across a window, and
  asserts on the issue store and event log. Multi-executor contention runs
  through `sim.raceExecutorsAt(…)`, which gives two executors the same stale
  snapshot and lets the lease sort it out.
- [`coverage.test.mjs`](coverage.test.mjs) — holds the map below honest:
  every §15 decision must appear in it, and every test name it cites must
  exist in `scenarios.test.mjs`.

Run: `node --test docs/tasks-dispatch/sim/` (CI runs it — the folder is a
declared test root in `ci.yml`).

## Working discipline

**Change the simulator first.** When the design changes, encode the change in
`sim.mjs`, run the suite, and let the red tests name the scenarios the change
breaks; then update the prose in DESIGN.md/SCENARIOS.md and the tests
together. A new scenario earns a numbered section in SCENARIOS.md *and* a
test here — the number is the cross-reference. A new design decision earns a
row in the coverage map below.

## Coverage — design decisions and mechanisms → the tests that validate them

Rows whose second column starts with **prose** are deliberately not modeled —
the sim cannot catch bugs there, and says so rather than pretending
(see "what the model omits" below). Test names are the first word of the
test's title in `scenarios.test.mjs`.

| design item | validated by |
|---|---|
| §5 evaluate-at-anchor: no work, no item (#1115) | `S1'` (one ask per task, zero items), `S52`, `S3'` |
| §5 occurrence guard, both halves (F13) | `S3'` (no double execution), `S26b` (next anchor still fires), `S6` (double scheduler run) |
| §5 standing-item guard (one open item per task) | `S21`, `S5` |
| §5 a decline is a board row; a pick-time no-go CLOSES (the roll is gone) | `S21`, `S22`, `S12'`, `S14'` |
| §5 first-item adoption rule | `S25` |
| §5 backlog guard: needs-human suppresses occurrences | `backlog`, `S11` |
| §5 catch-up: most recent occurrence only, no backfill | `S5` |
| §6.1 pick order — urgent first, then random among the ready (seeded) | `S16` (urgent precedence); the whole suite runs under the shuffle |
| §6.1 same-title mutex; qualifiers parallelize | `S15`, `S18` |
| §6.1 the `after` yield (not Blocked-by) | `S4`, `S23`, `S23b`, `S24` (a quiet upstream holds nothing) |
| §6.2 the verified claim lease, N executors | `S7` |
| §6.4 the pick-time re-evaluation; every no-go closes (#1115) | `S3'`, `S13'`, `S17`, `S59` |
| §6.5 work-step failure → needs-human; re-entrant re-pick | `S19`, `S8` |
| §6.5 heartbeat comments: the leash measures executor death, not work duration | `S31c`, `S31d` |
| §6.5 durable record: the terminal comment carries the exec record + artifacts | **prose** — comment content, not label mechanics |
| §6.6 at-most-once invocation: refused → needs-human; unanswered → stays with the agent, the leash decides | `S9a`, `S10a`, `S10b` |
| §7 the agent checks, not claims — no lease, no second session to arbitrate | `S10a` (exactly one session); the nonce check **prose** |
| §8 force = waking the standing item | `S14'`, `S16'`, `S19` |
| §8 ad-hoc work = creating an item; obsolete on no-go | `S13'`, `S15`, `S16` |
| §9 follow-ups: Blocked-by + Not-before, verdict at wake | `S17`, `S17b` |
| §9 fan-out/fan-in | `S18` |
| §11 executing-leash reclaim on the scheduler run | `S8` |
| §11 janitor agent leash (~3h) names the dead session | `S11` |
| §11 janitor stale-ready escalation (~2 periods) | `S18`, `S21` (never on a quiet task — it has no item) |
| §11 janitor stuck-dependency sweep (F14) | `S18` |
| §4/F7 the human re-queue lever | `S19`, `S12'` |
| §16.1/§16.3 the mark is consumed on adoption — exactly-once, no history search | `S44`, `S49` |
| §16.3 one issue, one live item — a live prior item makes the mark wait; a parked one is superseded (F28) | `S49`, `S51` |
| §16.4 the precondition is the security check (push permission via the permission API / approval comment) | `S45`, `S46` |
| §16.4 the precondition takes the item — a request verdict is about the issue it names | `S48` |
| §16.4 a gone issue declines; an unreadable one fails the run instead of guessing (F27) | `S50` |
| §16.5 a request that leaves a PR parks for approval; a refusal closes; a break parks as a fault | `S44`, `S45`, `S49` |
| §16.5 the write-backs onto the marked issue, and the silence on failure | `S44`, `S45`, `S49` |
| §16.7 the model label routes the run; an unknown family falls back; the labels are consumed (F29) | `S47` |
| §16.6 the session's request mode — what it validates and how it implements | **prose** — session behavior, not label mechanics |
| §15.1 invocation is a CCR API call | failure modes: `S9a`, `S10a`, `S10b`; **prose** for the call contract itself |
| §15.2 precondition at pickup; forcing loses its exemption | `S14'`, `S16'` |
| §15.3 timing-in-preconditions is advisory | **prose** — advisory by ruling, unenforceable by design |
| §15.4 go/no-go, once per period | `S1'`, `S3'`, `S22` |
| §15.5 the fleet concept is eliminated | `S18` (fan-out as ordinary items); rest **prose** |
| §15.6 the reclaim rides the scheduler run | `S8` |
| §15.7 namespaced labels; executor id in claim comments | `S7` (ids in claim comments); naming scheme **prose** |
| §15.8 dependency readiness is the scheduler run's alone | `S17` (readied only at Not-before), `S4` (scheduler run-quantized links) |
| §15.9 known limitation: stuck fan-in waits for a human | `S18` |
| §15.10 ref-creation CAS claims | **prose** — recorded alternative, not designed in |
| §15.11 invocation idempotency key | **answered: none exists** — the modeled defense is at-most-once invocation (`S9a`, `S10a`, `S10b`) |
| §15.12 the no-go record alternative | **prose** — superseded by §15.13 |
| §15.13 the standing work item | superseded in part by §15.28 (the roll and unconditional creation); what stands: `S25`, `S26b`, `S15`, `S30` |
| §15.14 the work step is the work (naming; contract key unchanged) | **prose** — vocabulary, not mechanics |
| §15.15 heartbeat comments during the work step | `S31`, `S31b`, `S31c`, `S31d` |
| §15.16 the scheduler run never waits on a drain | **prose** — workflow concurrency wiring (see "The unsimulated world") |
| §15.17 the occupancy capacity model; self-re-dispatch | `S34` (re-dispatch chains the queue); runner budgets **prose** |
| §15.18 the terminal comment is the durable record | **prose** — comment content, not label mechanics |
| §15.19 F1 reopened: readiness re-checks at close | `S33`, `S4` |
| §15.20 randomized pick order after urgent, adopted outright | modeled with a seeded PRNG (`pickSeed`); urgent precedence `S16` |
| §15.21 "scheduler run" keeps its name for now (#877) | **prose** — vocabulary |
| §15.22 one run performs one item — structural; every run records its trigger | `S34` (F23) |
| §15.23 a dead run must not stall the train — the failure-continuation job | `S36` |
| §15.24 the operator hold (`CLAUDINITE_TASKS_SUSPEND_ALL`) and the scheduler run-alone resume | `S37`, `S38` |
| §15.25 `task:done`/`task:obsolete` — the `outcome:` namespace dissolves | **prose** — a label spelling; the sim stores outcomes as values, not labels |
| §15.26 no origin marker — standing vs ad-hoc is structural (unqualified + frequency at HEAD) | `S13'`, `S15`, `S17`, `S44`, `S57` (an open unqualified item preempts the anchor's ask) |
| §15.27 the tick is the scheduler run, with `tick.mjs` kept as an entry-point shim | **live-only** — a rename of a module path and a workflow's `run:` line; nothing the sim models changes, and what has to hold is that a member's un-converged workflow still starts a run (`scheduler-run-entry-shim.test.mjs`) |
| §15.28 no work, no item — evaluate at the anchor, the schedule board as watermark, fail-open, the migration | `S52`, `S53`, `S54`, `S54b`, `S55`, `S56`, `S57`, `S58`, `S59`, `S60` (F31) |
| §15.29 the unified vocabulary: one `task:status:*` per item, emitted at every transition, terminal + origin on the closed issue | `S61`; `S43` (the re-queue leaves nothing behind) |
| §15.29 the decode-forever direction: legacy spellings drain, the first write canonicalizes, a bare or unknown park blocks | `S62`, `S62b`, `S63` |
| §15.29 the origin label as the standing/ad-hoc authority (structural read = fallback only) | `S61` (planned at birth), `S62` (fallback on unlabeled legacy), `S64` (ad-hoc) |
| §15.29 one-issue requests: the mark-with-no-status guard, the one clearing lever, gated body parameters, terminals on an open issue | `S64`, `S44`, `S45`, `S47`, `S49`, `S51` |
| §14 bootstrap: first-item rule; old-vocabulary issues untouched | `S25`, `S29` |
| §14 updates: declaration changes apply at the next scheduler run — nothing durable carries a schedule | `S28` |
| §14 secrets: the missing-secret needs-human posture | `S9a` (the refused hand-off's same convergence); storage/stamping/rotation **prose** — Actions-platform behavior |
| §5 F16 duplicate-standing-item self-heal | `S30` |
| §11 F17 (reframed): heartbeat interval < leash; the livelock heartbeats prevent; transition lease re-verify | `S31`, `S31b`, `S31c`, `S31d` |
| §9/§15.8 readiness re-check on close (F1, reopened 2026-08-15) | `S33`, `S4` (yielded chain picked in minutes) |
| §10 scheduler run/executor decoupling; runner budgets | **prose** — deployment wiring and sizing, not label mechanics |
| §6.1 F15 post-claim filter re-verify | `S32` |
| §6.2 F18 episode-scoped claim arbitration | `S32` |
| §6.2 comment-id ordering; label-swap non-atomicity; stateless-item repair | **prose** — see "The unsimulated world" |

## The unsimulated world

The validation review's inventory (owner request, 2026-08-13): every element
of the real platform the model does **not** simulate, why, and what defends
the design at that boundary. A test here cannot catch a bug living exactly
on one of these; anything listed as *assumption* is a place live operation
can still teach us.

| unmodeled element | what the real world does | what defends the design there |
|---|---|---|
| **Cron delivery** | `schedule:` is a request to queue: fires land minutes-to-tens-of-minutes late, are silently dropped under load, and GitHub disables schedules after 60 days of repo inactivity ([github-actions-scheduling](../../../packs/git-github/skills/github-actions-scheduling/SKILL.md)) | late/dropped fires ARE modeled abstractly (`dropSchedulerRuns`/`schedulerRunAt` — S4, S5); every rule derives due-ness from durable state, never from "the cron fired"; the 60-day disable is inherited risk, mitigated as today (repo activity from the mechanism's own writes) |
| **Actions start latency** | a queued workflow may wait minutes before running; the drain is not really at scheduler run+40s | nothing depends on start latency; all deadlines (leashes, staleness) are hours against minutes of jitter |
| **Scheduler run serialization** | two scheduler runs racing is prevented by the workflow `concurrency` group, an Actions feature the sim assumes rather than models | S6 models the *guards* under a duplicated fire; the group is platform config, verified in the migration burst (B1) |
| **REST list freshness** | no documented bound on when a list from another node reflects a creation seconds old | **F16**: the scheduler run assumes duplicates WILL happen and self-heals (close all open family items but the oldest) — S30 |
| **Label API atomicity** | a swap is two calls; no CAS; either can fail or land alone | labels are visibility + pick filter, never the arbiter — comments arbitrate (§6.2); a torn swap's stateless item is repaired by the janitor's fourth rule; modeled atomically here, defended structurally there |
| **Comment ordering** | `created_at` has 1-second granularity (simultaneous claims tie); comment **ids** are server-assigned, strictly increasing | the design orders by id, never timestamp (§6.2); the sim's `seq` models exactly that id order |
| **Claim-comment interleaving** | true API interleaving between executors | modeled as stale-snapshot races (`raceExecutorsAt` — S7, S32), which covers the protocol's decision points but not GitHub's own consistency between a comment post and a comment list; residual assumption: a comment list read after posting includes all earlier-id comments |
| **Body-edit lost updates** | two concurrent body edits: last write wins, no merge | single-writer-per-state by construction: only the claim winner edits an item's body, and only the scheduler run (serialized by its concurrency group) rewrites the board; residual: a human editing concurrently loses one edit — accepted, the record comments survive |
| **Event delivery** | `labeled` webhook events are droppable | modeled only as `eventLost` on creation (S16); every flow is poll-guaranteed by the scheduler run's drain — events are latency sugar everywhere by design |
| **Rate limits / quotas** | API quotas, secondary rate limits | costs estimated in DESIGN §5 (hourly-task churn); not modeled; the burst (B-rows) observes real consumption |
| **Clocks** | runner clocks skew; only server timestamps are trustworthy | no rule compares runner clocks; ordering is by server-assigned ids, durations by server timestamps; anchors tolerate minute-scale skew by construction (scheduler run-quantized) |
| **The invocation wire** | the routine-fire API's real contract, timeouts, the nonce's payload grammar | the *semantics* (at-most-once, the refused/unanswered split, the leash settling the unknown case) are modeled (S9a/S10a/S10b); the wire format is not — burst rows B3/B7 prove it live |
| **Actions variable delivery** | `vars.CLAUDINITE_TASKS_SUSPEND_ALL` reaches a run's env only at run start — a value changed mid-run is invisible to it | by design: suspension gates starts, never running work (S37 asserts exactly that boundary); the stamp is stub wiring, burst-verified |
| **Workflow concurrency between the scheduler run and a long drain** | the scheduler run and drain share a workflow whose `concurrency` group holds the next cron fire until the whole run ends — a drain doing hours of real work starves the hourly scheduler run | the decoupling wiring (work-as-work review, DESIGN §10): the drain must run outside the scheduler run's serializing group once work may legally outlive an hour; platform config the sim cannot see, verified in the migration burst |
| **Secrets & permissions** | Actions secret storage, env stamping, write-gating of labels/comments | prose + conformance checks (§14 secrets path); burst row B4/B7 |
| **Search index** | minutes-stale, eventually consistent | never used by the design (F11) — the REST issue list is the only read |
| **Real code-work/agent content** | side effects, repos, PRs, sessions | durations and verdicts are scenario inputs; the outcome ceiling and record formats are the engine's existing tested surface |

Fidelity grows only when a scenario needs it — an entry leaves this table by
becoming modeled, never by being forgotten.
