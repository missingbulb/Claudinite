// SCENARIOS.md, executable. Each test is a timed play-through against the
// simulator in sim.mjs: "at time X, Y happens", then run the virtual clock and
// assert on the issue store and the event log. Scenario numbers match the
// prose document (§H's standing-item replay + the stable earlier scenarios);
// a test here going red means the DESIGN.md mechanism, as modeled, breaks.
//
// The cast mirrors SCENARIOS.md's "Cast and constants" table. Preconditions
// read `world`, the scenario-owned signal state — task questions only, never
// calendar ones (DESIGN §6.4).

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, T } from './sim.mjs';

function cast() {
  return [
    {
      id: 'basics/baselining', frequency: 'daily-2h', outcome: 'done',
      preworkMinutes: 21, agentMinutes: 30,
      precondition: (w) => ({ run: !!w.mountBehind, reason: 'mount converged, no pending notes' }),
      requestsAgent: (w) => !!w.baseliningNeedsJudgment,
      preworkFails: (w) => !!w.mountBroken,
    },
    {
      id: 'grow/growth-extract', frequency: 'daily-1h', after: ['basics/baselining'],
      outcome: 'done', preworkMinutes: 2, agentMinutes: 35,
      precondition: (w) => ({ run: !!w.extractHasLessons, reason: 'nothing new to extract' }),
    },
    {
      id: 'grow/growth-promote', frequency: 'daily', after: ['grow/growth-extract'],
      outcome: 'done', preworkMinutes: 1, agentMinutes: 2,
      precondition: (w) => ({ run: !!w.promoteHasCandidates, reason: 'nothing staged' }),
    },
    {
      id: 'tidy/tidy-issues', frequency: 'daily', outcome: 'done',
      preworkMinutes: 1, agentMinutes: 16,
      precondition: (w, now) => ({
        run: w.issueTouchedAt != null && now - w.issueTouchedAt <= 24 * 3600e3,
        reason: 'no issue touched in window',
      }),
    },
    {
      id: 'chrome/store-release', frequency: 'daily', outcome: 'done', preworkMinutes: 3,
      precondition: (w) => ({ run: !!w.releasePending, reason: 'nothing to release' }),
    },
    {
      id: 'gcec/create-extractor', frequency: 'hourly', outcome: 'done',
      preworkMinutes: 4, agentMinutes: 10,
      precondition: (w) => ({ run: !!w.pendingRequest, reason: 'no eligible requests' }),
    },
    {
      id: 'tidy/tidy-prs', frequency: 'weekly', outcome: 'done',
      preworkMinutes: 1, agentMinutes: 5,
      precondition: (w) => ({ run: !!w.stalePrs, reason: 'no stale PRs' }),
    },
    { id: 'sheepdog/fleet-baseline', frequency: 'manual', outcome: 'done', preworkMinutes: 1, agentMinutes: 5 },
  ];
}

const evals = (sim, task) => sim.log.filter((e) => e.kind === 'evaluate' && e.task === task);
const closedOf = (sim, task) =>
  sim.family(task).filter((i) => !i.seeded && i.state === 'closed' && i.outcome != null);

// ---- S1' — quiet night: one evaluation per task per period, then everything
// sleeps as a blocked standing item wearing its next wake time.
test("S1' quiet night: one ask per period, items roll and sleep", () => {
  const sim = makeSim({ tasks: cast() })
    .seedSteadyState('2026-08-12T00:00Z')
    .run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  for (const task of ['basics/baselining', 'tidy/tidy-issues', 'chrome/store-release']) {
    assert.equal(evals(sim, task).length, 1, `${task} asked once`);
    const it = sim.standingItem(task);
    assert.ok(it.labels.has('task:blocked'), `${task} sleeps`);
    assert.ok(it.notBefore > T('2026-08-12T23:59Z'), `${task} wakes tomorrow`);
    assert.equal(it.rolls.length, 1);
  }
  // the hourly task asks hourly — that is its declared cadence, not a defect
  assert.equal(evals(sim, 'gcec/create-extractor').length, 23);
  // manual tasks never instantiate
  assert.equal(sim.family('sheepdog/fleet-baseline').length, 0);
  // nothing ran, nothing escalated, nothing closed
  assert.equal(sim.log.filter((e) => e.kind === 'handoff' || e.kind === 'escalate').length, 0);
});

// ---- S2 — happy path: work exists, the item runs to a closed outcome.
test('S2 happy path: touched issues -> item runs, closes done', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:02Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:02Z'); });
  sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  const [done] = closedOf(sim, 'tidy/tidy-issues');
  assert.ok(done, 'tidy-issues converged');
  assert.equal(done.outcome, 'done');
  // claimed at the 04:17 drain, agent 16m: closed ~04:34
  assert.ok(done.closedAt <= T('2026-08-12T04:40Z'));
  assert.equal(evals(sim, 'tidy/tidy-issues').length, 1);
});

// ---- S3' — work appears mid-window: nothing wakes until the next anchor;
// the ask happens once per period, and tomorrow's ask finds the work.
test("S3' mid-window work waits for the next anchor, then runs", () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T09:03Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T09:03Z'); });
  sim.run('2026-08-12T00:00Z', '2026-08-13T12:00Z');

  const asks = evals(sim, 'tidy/tidy-issues');
  assert.equal(asks.length, 2, 'one ask per day, two days');
  assert.ok(asks[0].t < T('2026-08-12T05:00Z') && asks[0].run === false, 'day 1: declined');
  assert.ok(asks[1].t > T('2026-08-13T04:00Z') && asks[1].run === true, 'day 2: found the work');
  assert.equal(closedOf(sim, 'tidy/tidy-issues').length, 1);
});

// ---- S4 — the late-fire night: all cron fires drop, one late tick at 05:41,
// and the chain still runs the same morning, in order, via the pick-time yield.
test('S4 late fire: the chain completes the same morning, ordered', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => {
    world.mountBehind = true;         // baselining has real work (no judgment needed)
    world.extractHasLessons = true;   // and so does the rest of the chain
    world.promoteHasCandidates = true;
  });
  sim.dropTicks('2026-08-12T00:00Z', '2026-08-12T05:41Z');
  sim.tickAt('2026-08-12T05:41Z');
  sim.run('2026-08-12T00:00Z', '2026-08-12T09:00Z');

  const [base] = closedOf(sim, 'basics/baselining');
  const [extract] = closedOf(sim, 'grow/growth-extract');
  const [promote] = closedOf(sim, 'grow/growth-promote');
  assert.ok(base && extract && promote, 'all three converged');
  assert.ok(base.closedAt < extract.closedAt, 'baselining before extract');
  assert.ok(extract.closedAt < promote.closedAt, 'extract before promote');
  assert.ok(promote.closedAt < T('2026-08-12T09:00Z'), 'same morning, not tomorrow');
  // extract was never picked while baselining was live
  const baseClaim = sim.log.find((e) => e.kind === 'evaluate' && e.task === 'basics/baselining');
  const extractClaim = sim.log.find((e) => e.kind === 'evaluate' && e.task === 'grow/growth-extract');
  assert.ok(extractClaim.t >= base.closedAt, 'yield held while upstream ran');
  assert.ok(baseClaim.t >= T('2026-08-12T05:41Z'), 'nothing happened before the late tick');
});

// ---- S5 — the tick is down for three days: rolled items simply wake on the
// first tick back; exactly one catch-up ask per task, no backfill.
test('S5 three-day outage: one catch-up ask, no backfill', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-11T00:00Z');
  sim.dropTicks('2026-08-11T09:00Z', '2026-08-14T10:00Z');
  sim.run('2026-08-11T00:00Z', '2026-08-14T23:00Z');

  const asks = evals(sim, 'tidy/tidy-issues');
  assert.equal(asks.length, 2, 'Tuesday once, Friday once — Wed/Thu gone, not backfilled');
  assert.ok(asks[1].t >= T('2026-08-14T10:17Z'), 'catch-up on the first tick back');
  const it = sim.standingItem('tidy/tidy-issues');
  assert.equal(sim.family('tidy/tidy-issues').filter((i) => i.state === 'open').length, 1,
    'still exactly one standing item');
  assert.ok(it.notBefore > T('2026-08-14T23:00Z') - 24 * 3600e3, 'rolled to the next real anchor');
});

// ---- S13' — an ad-hoc item's no-go closes it (no anchor to roll to).
test("S13' ad-hoc no-go closes obsolete instead of rolling", () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T10:00Z', (s) => s.createItem('tidy/tidy-issues', { urgent: true }));
  sim.run('2026-08-12T05:00Z', '2026-08-12T12:00Z'); // start past the 04:17 tick: scheduled item exists rolled

  const adhoc = sim.issues.find((i) => i.origin === 'manual');
  assert.equal(adhoc.state, 'closed');
  assert.equal(adhoc.outcome, 'obsolete');
  assert.equal(adhoc.rolls.length, 0, 'ad-hoc items never roll');
});

// ---- S14'/S16' — forcing is waking the standing item; a force that finds no
// work rolls again with the reason on record, a force that finds work runs.
test("S14' force wakes the standing item; no-go rolls with a reason", () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T15:00Z', (s) => s.force('tidy/tidy-issues'));
  sim.run('2026-08-12T00:00Z', '2026-08-12T18:00Z');

  const it = sim.standingItem('tidy/tidy-issues');
  assert.equal(it.rolls.length, 2, 'morning roll + forced-ask roll');
  assert.equal(it.rolls[1].reason, 'no issue touched in window', 'the force reads its answer');
  assert.equal(evals(sim, 'tidy/tidy-issues').length, 2);
});

test("S16' force with work present runs immediately, mid-day", () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T14:50Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T14:50Z'); });
  sim.at('2026-08-12T15:00Z', (s) => s.force('tidy/tidy-issues'));
  sim.run('2026-08-12T00:00Z', '2026-08-12T18:00Z');

  const [done] = closedOf(sim, 'tidy/tidy-issues');
  assert.ok(done && done.closedAt < T('2026-08-12T15:30Z'), 'ran within minutes of the force');
});

// ---- S20 — the task file disappears: validate-in-code closes the item.
test('S20 removed task: standing item closes obsolete at next pick', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T10:00Z', (s) => { s.removeTask('tidy/tidy-issues'); s.force('tidy/tidy-issues'); });
  sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  const it = sim.family('tidy/tidy-issues').find((i) => i.createdAt >= T('2026-08-12T00:00Z'));
  assert.equal(it.state, 'closed');
  assert.equal(it.outcome, 'obsolete');
});

// ---- S21 — the quiet month: one item, five weekly rolls, zero escalations.
test('S21 quiet weeks: one rolling item, no janitor noise', () => {
  const sim = makeSim({ tasks: cast() })
    .seedSteadyState('2026-08-02T05:00Z') // Sunday, past the 04:00 anchor
    .run('2026-08-02T05:00Z', '2026-09-07T00:00Z');

  const fam = sim.family('tidy/tidy-prs').filter((i) => !i.seeded);
  assert.equal(fam.length, 1, 'one item across five quiet weeks');
  assert.equal(fam[0].rolls.length, 5, 'one roll per Sunday');
  assert.equal(sim.log.filter((e) => e.kind === 'escalate').length, 0,
    'a properly rolling item never trips the stale rule');
});

// ---- S22 — the hourly task: rolls hourly while quiet, runs within the hour
// once work exists. The churn is the declared cadence.
test('S22 hourly churn, then work found within the hour', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T14:40Z', ({ world }) => { world.pendingRequest = true; });
  sim.run('2026-08-12T00:00Z', '2026-08-12T16:00Z');

  const it = sim.family('gcec/create-extractor')
    .find((i) => i.createdAt >= T('2026-08-12T01:00Z'));
  assert.equal(it.rolls.length, 14, 'one roll per quiet hour, all on one issue');
  assert.equal(it.state, 'closed');
  assert.ok(it.closedAt <= T('2026-08-12T15:40Z'), 'ran within the hour of the work arriving');
});

// ---- S23 — the upstream declines (or is broken): dependents run anyway.
test('S23 rolled upstream unblocks the dependent the same cycle', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => { world.extractHasLessons = true; }); // baselining stays quiet
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  assert.ok(sim.standingItem('basics/baselining').labels.has('task:blocked'), 'upstream rolled');
  const [extract] = closedOf(sim, 'grow/growth-extract');
  assert.ok(extract && extract.closedAt < T('2026-08-12T05:00Z'),
    'extract ran the same morning — a declined upstream is not a blocker');
});

test('S23b needs-human upstream does not halt the chain', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => {
    world.mountBehind = true; world.mountBroken = true; // baselining runs and fails
    world.extractHasLessons = true;
  });
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  assert.ok(sim.standingItem('basics/baselining').labels.has('needs-human'), 'upstream broke');
  assert.equal(closedOf(sim, 'grow/growth-extract').length, 1, 'extract still ran');
});

// ---- S24 — the trap, demonstrated: wiring `after` as Blocked-by starves the
// dependent of a quiet upstream forever, because a rolling item never closes.
// This test is the executable form of the argument in DESIGN §9.
test('S24 blocked-by wiring starves the chain; the yield does not', () => {
  const play = (afterMode) => {
    const sim = makeSim({ tasks: cast(), afterMode }).seedSteadyState('2026-08-12T00:00Z');
    sim.at('2026-08-12T00:01Z', ({ world }) => { world.extractHasLessons = true; });
    return sim.run('2026-08-12T00:00Z', '2026-08-15T00:00Z'); // three quiet-upstream days
  };

  const starved = play('blocked-by');
  assert.equal(evals(starved, 'grow/growth-extract').length, 0,
    'blocked-by: extract is never even asked, for as long as baselining is quiet');
  assert.equal(starved.log.filter((e) => e.kind === 'escalate').length, 0,
    'and the starvation is silent — the item is blocked, not stale-ready');

  const yielded = play('yield');
  assert.equal(closedOf(yielded, 'grow/growth-extract').length, 3,
    'yield: extract asked and run each of the three days');
});

// ---- S25 — adoption: a brand-new task's first item is born blocked until its
// next real anchor, so a fresh repo never fires weekly work off-anchor.
test('S25 adoption: first ask lands on the real anchor, not the first tick', () => {
  const sim = makeSim({ tasks: cast() }) // no seeded history — a fresh repo
    .run('2026-08-12T00:00Z', '2026-08-13T00:00Z'); // Wednesday

  assert.equal(evals(sim, 'tidy/tidy-prs').length, 0, 'weekly task not asked mid-week');
  const weekly = sim.standingItem('tidy/tidy-prs');
  assert.equal(new Date(weekly.notBefore).getUTCDay(), 0, 'sleeps until Sunday');
  // daily tasks still get their first ask the same day — at their anchor
  const asks = evals(sim, 'tidy/tidy-issues');
  assert.equal(asks.length, 1);
  assert.ok(asks[0].t >= T('2026-08-12T04:00Z'), 'not before the 04:00 anchor');
});

// ---- S8-flavored — a dead executor's claim is reclaimed by the tick's leash
// and the item is simply re-picked; prework re-entrancy is the contract.
test('S8 dead executor: leash reclaim, re-pick, converge', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.at('2026-08-12T04:01Z', (s) => s.crashNextExecutionOf('tidy/tidy-issues'));
  sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  assert.equal(sim.log.filter((e) => e.kind === 'reclaim' && e.task === 'tidy/tidy-issues').length, 1);
  const [done] = closedOf(sim, 'tidy/tidy-issues');
  assert.ok(done, 'converged after the reclaim');
  assert.ok(done.closedAt > T('2026-08-12T05:17Z'), 'recovery cost is the leash, not a day');
});

// ---- backlog guard — a needs-human item suppresses new occurrences until a
// human acts; one broken task, one triage item, however many days pass.
test('backlog guard: a failed run blocks new occurrences until re-queued', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => { world.mountBehind = true; world.mountBroken = true; });
  sim.run('2026-08-12T00:00Z', '2026-08-14T00:00Z');

  const fam = sim.family('basics/baselining').filter((i) => i.createdAt >= T('2026-08-12T00:00Z'));
  assert.equal(fam.length, 1, 'no second item while needs-human sits open');
  assert.ok(fam[0].labels.has('needs-human'));
  assert.equal(evals(sim, 'basics/baselining').length, 1, 'not re-asked while broken');
});
