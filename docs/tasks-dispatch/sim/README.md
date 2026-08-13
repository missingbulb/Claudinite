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
  the mechanism as DESIGN.md specifies it — the tick's three jobs, the
  executor's pick/claim/evaluate/roll with the verified lease, prework →
  hand-off → converge as timed phases, the invocation layer (bounded retry,
  at-least-once duplicates, the agent-side lease), the janitor's three
  rules, and the force/re-queue levers. `afterMode: 'blocked-by'` exists
  solely so S24 can demonstrate the starvation that ruled that wiring out.
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
| §5 calendar-only creation; the tick evaluates nothing | `S1'` (zero handoffs, one ask per task) |
| §5 occurrence guard, both halves (F13) | `S3'` (no double execution), `S26b` (next anchor still fires), `S6` (double tick) |
| §5 standing-item guard (one open item per task) | `S21`, `S5` |
| §5 the roll: no-go → Not-before next anchor | `S1'`, `S14'`, `S21`, `S22` |
| §5 first-item adoption rule | `S25` |
| §5 backlog guard: needs-human suppresses occurrences | `backlog`, `S11` |
| §5 catch-up: most recent occurrence only, no backfill | `S5` |
| §6.1 pick order — urgent first, then oldest | `S16` |
| §6.1 same-title mutex; qualifiers parallelize | `S15`, `S18` |
| §6.1 the `after` yield (not Blocked-by) | `S4`, `S23`, `S23b`, `S24` |
| §6.2 the verified claim lease, N executors | `S7` |
| §6.4 the single evaluation site; roll vs close by origin | `S3'`, `S13'`, `S17` |
| §6.5 prework failure → needs-human; re-entrant re-pick | `S19`, `S8` |
| §6.6 hand-off failure: bounded revert-to-ready (F3) | `S9a`, `S9b` |
| §7 the agent-side lease under at-least-once invocation (F5) | `S10` |
| §8 force = waking the standing item | `S14'`, `S16'`, `S19` |
| §8 ad-hoc work = creating an item; obsolete on no-go | `S13'`, `S15`, `S16` |
| §9 follow-ups: Blocked-by + Not-before, verdict at wake | `S17`, `S17b` |
| §9 fan-out/fan-in | `S18` |
| §11 executing-leash reclaim on the tick | `S8` |
| §11 janitor agent leash (~3h) names the dead session | `S11` |
| §11 janitor stale-ready escalation (~2 periods) | `S18`, `S21` (never on a rolling item) |
| §11 janitor stuck-dependency sweep (F14) | `S18`, `S24` |
| §4/F7 the human re-queue lever | `S19`, `S12'` |
| §15.1 invocation is a CCR API call | failure modes: `S9a`, `S9b`, `S10`; **prose** for the call contract itself |
| §15.2 precondition at pickup; forcing loses its exemption | `S14'`, `S16'` |
| §15.3 timing-in-preconditions is advisory | **prose** — advisory by ruling, unenforceable by design |
| §15.4 go/no-go, once per period | `S1'`, `S3'`, `S22` |
| §15.5 the fleet concept is eliminated | `S18` (fan-out as ordinary items); rest **prose** |
| §15.6 the reclaim rides the tick | `S8` |
| §15.7 namespaced labels; executor id in claim comments | `S7` (ids in claim comments); naming scheme **prose** |
| §15.8 dependency readiness is the tick's alone | `S17` (readied only at Not-before), `S4` (tick-quantized links) |
| §15.9 known limitation: stuck fan-in waits for a human | `S18` |
| §15.10 ref-creation CAS claims | **prose** — recorded alternative, not designed in |
| §15.11 invocation idempotency key | **prose** — conditional improvement; the modeled defense is the F5 lease (`S10`) |
| §15.12 the no-go record alternative | **prose** — superseded by §15.13 |
| §15.13 the standing work item | `S1'`, `S21`, `S25`, `S26b`, `S12'` |
| §14 bootstrap: first-item rule; old-vocabulary issues untouched | `S25`, `S29` |
| §14 updates: declaration changes apply at the next evaluation; the stamped wake is the one carried fact | `S28` |
| §14 secrets: the missing-secret needs-human posture | `S9b` (the bound); storage/stamping/rotation **prose** — Actions-platform behavior |
| §5 F16 duplicate-standing-item self-heal | `S30` |
| §11 F17 leash constraint + livelock hazard; transition lease re-verify | `S31`, `S31b` |
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
| **Cron delivery** | `schedule:` is a request to queue: fires land minutes-to-tens-of-minutes late, are silently dropped under load, and GitHub disables schedules after 60 days of repo inactivity ([github-actions-scheduling](../../../.claude/skills/github-actions-scheduling/SKILL.md)) | late/dropped fires ARE modeled abstractly (`dropTicks`/`tickAt` — S4, S5); every rule derives due-ness from durable state, never from "the cron fired"; the 60-day disable is inherited risk, mitigated as today (repo activity from the mechanism's own writes) |
| **Actions start latency** | a queued workflow may wait minutes before running; the drain is not really at tick+40s | nothing depends on start latency; all deadlines (leashes, staleness) are hours against minutes of jitter |
| **Tick serialization** | two ticks racing is prevented by the workflow `concurrency` group, an Actions feature the sim assumes rather than models | S6 models the *guards* under a duplicated fire; the group is platform config, verified in the migration burst (B1) |
| **REST list freshness** | no documented bound on when a list from another node reflects a creation seconds old | **F16**: the tick assumes duplicates WILL happen and self-heals (close all open family items but the oldest) — S30 |
| **Label API atomicity** | a swap is two calls; no CAS; either can fail or land alone | labels are visibility + pick filter, never the arbiter — comments arbitrate (§6.2); a torn swap's stateless item is repaired by the janitor's fourth rule; modeled atomically here, defended structurally there |
| **Comment ordering** | `created_at` has 1-second granularity (simultaneous claims tie); comment **ids** are server-assigned, strictly increasing | the design orders by id, never timestamp (§6.2); the sim's `seq` models exactly that id order |
| **Claim-comment interleaving** | true API interleaving between executors | modeled as stale-snapshot races (`raceExecutorsAt` — S7, S32), which covers the protocol's decision points but not GitHub's own consistency between a comment post and a comment list; residual assumption: a comment list read after posting includes all earlier-id comments |
| **Body-edit lost updates** | two concurrent body edits: last write wins, no merge | single-writer-per-state by construction: only the claim winner edits the body, only the roll's owner stamps `Not-before`; residual: a human editing concurrently with the executor loses one edit — accepted, the record comments survive |
| **Event delivery** | `labeled` webhook events are droppable | modeled only as `eventLost` on creation (S16); every flow is poll-guaranteed by the tick's drain — events are latency sugar everywhere by design |
| **Rate limits / quotas** | API quotas, secondary rate limits | costs estimated in DESIGN §5 (hourly-task churn); not modeled; the burst (B-rows) observes real consumption |
| **Clocks** | runner clocks skew; only server timestamps are trustworthy | no rule compares runner clocks; ordering is by server-assigned ids, durations by server timestamps; anchors tolerate minute-scale skew by construction (tick-quantized) |
| **The invocation wire** | the CCR API's real contract, timeouts, the nonce's comment grammar | the *semantics* (at-least-once, bounded retry, agent lease) are modeled (S9/S10); the wire format is not — burst rows B3/B7 prove it live |
| **Secrets & permissions** | Actions secret storage, env stamping, write-gating of labels/comments | prose + conformance checks (§14 secrets path); burst row B4/B7 |
| **Search index** | minutes-stale, eventually consistent | never used by the design (F11) — the REST issue list is the only read |
| **Real prework/agent content** | side effects, repos, PRs, sessions | durations and verdicts are scenario inputs; the outcome ceiling and record formats are the engine's existing tested surface |

Fidelity grows only when a scenario needs it — an entry leaves this table by
becoming modeled, never by being forgotten.
