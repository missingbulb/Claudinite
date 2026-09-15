# The scenario harness — the mechanism, executable

A discrete-event harness that runs the REAL queue against a fake world, so the
mechanism's claims run as tests instead of living only as prose. Owner request,
2026-08-13: *"add the 'at time x — y happens' to the tests, and then execute the
simulator — this will help us make the design more robust."*

It began as a model — a second implementation of the dispatch mechanism beside
`queue/` — and that model caught real spec bugs prose replay missed (**F13**,
the occurrence guard's missing closed-at half; **F14**, the stale rule that can
never see a stuck *blocked* item; **F31**, the board's go rows eating an
occurrence; **F32**, the stateless `due:` term reading an unpicked deduped twin
as this period's run). Once the design shipped, the model stopped running ahead
of the code and started drifting behind it, so the model was deleted and the
scenarios were pointed at the engine itself. The first pass of that port found
three more, this time in the CODE rather than in the spec: an executor that
converges an item it was reclaimed off, a session park that leaves no episode
boundary, and a queue membership test a requester can fail by taking their own
label off.

- [`sim.mjs`](sim.mjs) — the harness: the wiring between the fake world and the
  real entry points, plus the scenario DSL. It holds no answer of its own —
  `schedulerRun`, `runExecutor`, `sweepQueue`, `continueOrEscalate`,
  `convergeOps`, the precondition engine and the anchor arithmetic are imported
  and run. Its own header says what it owns.
- [`world/`](world/) — the fake world: one module per port under
  [`packs/claudinite-tasks/src/world/`](../../src/world), in memory, plus
  `agents.mjs` and `humans.mjs`, which stand in for no port because neither is
  an edge the engine calls. Each module's header says what it models and what
  it does not. [`world/parity.test.mjs`](world/parity.test.mjs) is what stops a
  fake drifting from the port it stands in for, and
  [`world/world.test.mjs`](world/world.test.mjs) proves the behaviours the fake
  OWNS — the orderings the clock guarantees, the GitHub limitations the
  mechanism is designed around, the shape of a session's life.
- [`scenarios.test.mjs`](scenarios.test.mjs) — the play-throughs, one per named
  scenario. Each schedules world events at instants
  (`sim.at('2026-08-12T09:03Z', …)`), runs the virtual clock across a window,
  and asserts on the issue store the engine wrote and on the harness's log of
  what it drove.
- [`coverage.test.mjs`](coverage.test.mjs) — the two-way guard between this
  suite and [`packs/claudinite-tasks/docs/PRINCIPLES.md`](../../docs/PRINCIPLES.md):
  every scenario here is cited by some claim there, and every test PRINCIPLES.md
  cites actually exists.

Run: `node --test packs/claudinite-tasks/test/sim/*.test.mjs
packs/claudinite-tasks/test/sim/world/*.test.mjs`. Naming a folder alone does
not work: `node --test <dir>` does not recurse into it, which is also why the
`world/` glob is spelled out beside the first.

## What a scenario states, and what it may not

A scenario's task is a DECLARATION, in the same fields a real one uses: a
cadence term, a `schedule_after`, whether it has a work step and how long that
step takes. Its `precondition` function stands for every other condition a real
declaration would name in terms of its own signals, and is loaded as a
task-local TERM — so the real precondition engine evaluates it, in the real
expression, in the real two passes.

**A scenario may not state an answer.** Whether the item is filed, who wins the
claim, which park it lands in and what the day cost are all read back off the
world afterwards. Where a scenario and the engine disagree, the disagreement is
the finding: decide it by the claim the scenario cites in `PRINCIPLES.md` —
either the code is wrong and the fix is the change, or the claim is wrong and
correcting it is. Never weaken a scenario to make it pass.

**Write the scenario first.** A design change starts as a new or edited scenario
here, run red against the unchanged engine; the engine change makes it true; and
`coverage.test.mjs` is what stops `docs/PRINCIPLES.md` drifting out of step with
either side. A retired scenario's test deletes with it — PRINCIPLES.md's guard
has nothing to say about a scenario that no longer exists, only about one that
exists uncited.

**Everything waits on virtual time.** The clock is the only source of "later":
a real timer never fires here, and a promise that resolves from outside the
clock's own accounting is invisible to the pump that advances it. A scenario
that needs real time is a scenario written wrong (`S80`).
