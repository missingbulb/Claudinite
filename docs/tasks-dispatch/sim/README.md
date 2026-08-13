# The dispatch simulator — SCENARIOS.md, executable

A discrete-event simulator of the [tasks-dispatch DESIGN](../DESIGN.md), so
the scenario play-throughs in [SCENARIOS.md](../SCENARIOS.md) run as tests
instead of living only as prose. Owner request, 2026-08-13: *"add the 'at
time x — y happens' to the tests, and then execute the simulator — this will
help us make the design more robust."* Its first run promptly caught **F13**,
a double-execution bug in the occurrence guard that three rounds of prose
replay had missed — which is the whole argument for its existence.

- [`sim.mjs`](sim.mjs) — the model: a virtual clock and an ordered event
  queue (no threads, no waits, no wall clock), an in-memory issue store, and
  the mechanism exactly as DESIGN.md specifies it — the tick's three jobs,
  the executor's pick/claim/evaluate/roll, prework → hand-off → converge as
  timed phases, the janitor's stale rule, the force-is-waking lever.
  `afterMode: 'blocked-by'` exists solely so S24 can demonstrate the
  starvation that ruled that wiring out.
- [`scenarios.test.mjs`](scenarios.test.mjs) — the play-throughs, numbered to
  match SCENARIOS.md (§H's replay plus the stable earlier scenarios). Each
  test schedules world events at instants (`sim.at('2026-08-12T09:03Z', …)`),
  runs the clock across a window, and asserts on the issue store and event
  log.

Run: `node --test docs/tasks-dispatch/sim/` (CI runs it — the folder is a
declared test root in `ci.yml`).

## Working discipline

**Change the simulator first.** When the design changes, encode the change in
`sim.mjs`, run the suite, and let the red tests name the scenarios the change
breaks; then update the prose in DESIGN.md/SCENARIOS.md and the tests
together. A new scenario earns a numbered section in SCENARIOS.md *and* a
test here — the number is the cross-reference.

**What the model deliberately omits** (a test here cannot catch bugs living
exactly on these boundaries — say so rather than trusting it to): the search
index and its lag (the store *is* the REST list), races between concurrent
executors (one deterministic executor; the lease protocol's own races are
argued in DESIGN §6–§7), API failure modes and the hand-off nonce (S9/S10's
at-least-once argument is prose), token/permission surfaces, and real
prework/agent content (durations and verdicts are scenario inputs). Fidelity
grows only when a scenario needs it.
