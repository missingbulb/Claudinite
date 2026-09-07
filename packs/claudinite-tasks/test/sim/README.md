# The dispatch simulator — the mechanism, executable

A discrete-event simulator of the task-dispatch mechanism, so its claims run
as tests instead of living only as prose. Owner request, 2026-08-13: *"add the
'at time x — y happens' to the tests, and then execute the simulator — this
will help us make the design more robust."* It has caught real spec bugs prose
replay missed — **F13** (the occurrence guard's missing closed-at half),
**F14** (the stale rule can never see a stuck *blocked* item), **F31** (the
board's go rows eating an occurrence) and **F32** (the stateless `due:` term
reading an unpicked deduped twin as this period's run) — which is the whole
argument for its existence.

- [`sim.mjs`](sim.mjs) — the model: a virtual clock and an ordered event
  queue (no threads, no waits, no wall clock), an in-memory issue store, and
  the mechanism as [`packs/claudinite-tasks/docs/PRINCIPLES.md`](../../docs/PRINCIPLES.md) states
  it — the scheduler run as a STATELESS loop: at every tick it asks every task
  on the schedule — one stating a condition, none of which reads the item
  itself; a task stating none runs only from an item somebody created, at
  whose pick the empty expression holds — through the task's own
  preconditions — the run-history terms (`due:`, `last-run-over:`,
  `last-run-not-failed`) judged first over the task's own items in the issue
  store, then the scenario's precondition function standing for every other
  condition, over the since-last-run window the engine collects movement
  over — files a READY item on a yes, writes a log entry and nothing else on
  a no, fails OPEN on a read it cannot make, and keeps the engine's one
  invariant, ONE LIVE ITEM PER TASK (a parked item is not live; whether it
  holds the task is the task's own `last-run-not-failed`); its drain
  dispatched only when something is pickable; executor RUNS as first-class
  objects (each drains until nothing is pickable, items settled serially —
  urgent-then-random pick under a seeded PRNG, the verified lease, a recorded
  trigger: scheduler-run-drain / label-event / close-drain /
  failure-redispatch, and an `actionExecutions()` accounting of every billed
  workflow run); the pick-time re-evaluation over the item's OWN facts and
  its own run history excluding it, where a `Woken`-stamped item satisfies the
  cadence terms; the work step → hand-off → converge as timed phases with
  heartbeat comments; at-most-once invocation (fired / refused / unanswered);
  the janitor's rules; and the force/re-queue levers, the force stamping
  `Woken` on what it wakes or mints. The model keeps no schedule board, no
  watermark, no first-window booking and no migration because the engine
  keeps none: what the engine WRITES is the item and the log line, never a
  rule's intent. Ad-hoc requests are modeled as their own issue store beside
  the work items: a mark, the scheduler run's adopt job, the built-in request
  task's precondition, and the two write-backs — each modeled where the
  engine will leave a mark, never where the rule merely says something
  happened.
- [`scenarios.test.mjs`](scenarios.test.mjs) — the play-throughs, one per
  named scenario. Each test schedules world events at instants
  (`sim.at('2026-08-12T09:03Z', …)`), runs the clock across a window, and
  asserts on the issue store and event log. Multi-executor contention runs
  through `sim.raceExecutorsAt(…)`, which gives two executors the same stale
  snapshot and lets the lease sort it out.
- [`coverage.test.mjs`](coverage.test.mjs) — the two-way guard between this
  suite and [`packs/claudinite-tasks/docs/PRINCIPLES.md`](../../docs/PRINCIPLES.md): every scenario
  here is cited by some claim there, and every test PRINCIPLES.md cites
  actually exists.

Run: `node --test packs/claudinite-tasks/test/sim/*.test.mjs`. Naming the folder
alone does not work: `node --test <dir>` does not recurse into it.

## Working discipline

**Write the scenario first, then the code.** A design change starts as a new
or edited scenario in `scenarios.test.mjs`, run red against the unchanged
`sim.mjs`; encode the change in `sim.mjs` until it goes green, and only then
update `docs/PRINCIPLES.md` — a claim never precedes the test that proves it.
When a change touches the real engine rather than only the model, the same
order holds one level up: the scenario names the behaviour, the engine change
makes it true, and `coverage.test.mjs` is what stops the document drifting
out of step with either side. A retired scenario's test deletes with it;
PRINCIPLES.md's guard has nothing to say about a scenario that no longer
exists, only about one that exists uncited.
