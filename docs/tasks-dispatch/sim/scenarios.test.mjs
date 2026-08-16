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
  // F1 (reopened 2026-08-15): the close-time drain picks the yielded dependent
  // in minutes — chain links no longer wait out the tick
  assert.ok(extractClaim.t <= base.closedAt + 5 * 60e3, 'picked within minutes of the upstream closing');
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
  // the starvation is invisible to the stale-READY rule (the item is blocked);
  // only F14's stuck-dependency sweep surfaces it — as a comment, days late
  assert.equal(starved.log.filter((e) => e.rule === 'stale-ready').length, 0);
  assert.ok(starved.log.some((e) => e.rule === 'stuck-dependency'),
    'F14 at least names the starvation, but the wiring is still wrong');

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

// ---- S6 — double-fire: two ticks in the same minute, one item.
test('S6 double tick: the occurrence guard holds under a duplicate fire', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.dropTicks('2026-08-12T04:00Z', '2026-08-12T05:00Z'); // replace the cron fire…
  sim.tickAt('2026-08-12T04:17:05Z');                       // …with a duplicated one
  sim.tickAt('2026-08-12T04:17:20Z');
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  const fam = sim.family('tidy/tidy-issues').filter((i) => !i.seeded);
  assert.equal(fam.length, 1, 'one item despite two ticks');
  assert.equal(closedOf(sim, 'tidy/tidy-issues').length, 1, 'and it ran once');
});

// ---- S7 — two executors race for one item: the verified lease, stale read
// and all. The loser reverts nothing and picks a different item.
test('S7 executor race: earliest claim wins, loser takes the next item', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => {
    world.issueTouchedAt = T('2026-08-12T04:00Z'); // tidy-issues has work
    world.releasePending = true;                   // store-release has work
  });
  sim.dropTicks('2026-08-12T04:00Z', '2026-08-12T05:00Z');
  sim.tickAt('2026-08-12T04:17Z'); // creates both items; the race lands just
  sim.raceExecutorsAt('2026-08-12T04:17:35Z', ['E1', 'E2']); // before its drain
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  const losses = sim.log.filter((e) => e.kind === 'claim-lost');
  assert.equal(losses.length, 1, 'exactly one loser');
  const raced = losses[0];
  assert.ok(sim.log.some((e) => e.kind === 'claim' && e.issue === raced.issue && e.t === raced.t),
    'the rival won the same item at the same instant');
  assert.equal(sim.log.filter((e) => e.kind === 'evaluate' && e.issue === raced.issue && e.t === raced.t).length,
    1, 'the raced item was executed once, by the winner');
  assert.equal(closedOf(sim, 'tidy/tidy-issues').length + closedOf(sim, 'chrome/store-release').length,
    2, 'both items converged — the loser moved on, capacity added not lost');
});

// ---- S9 — invocation is at-most-once (DESIGN §6.6 as amended 2026-08-15):
// one call per item, never retried. A REFUSED call (a status came back — no
// session exists and none will) converges needs-human immediately: the cause
// is a token, URL or routine, which no retry fixes.
test('S9a refused invocation: needs-human at once, naming the cause', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.at('2026-08-12T04:10Z', (s) => s.apiRefusedUntil('2026-08-12T05:00Z'));
  sim.run('2026-08-12T00:00Z', '2026-08-12T09:00Z');

  const it = sim.family('tidy/tidy-issues').find((i) => !i.seeded);
  assert.equal(sim.log.filter((e) => e.kind === 'handoff-refused').length, 1, 'one call, ever');
  assert.ok(it.labels.has('needs-human'), 'triage, with the refusal on record');
  assert.equal(it.sessions.length, 0, 'no session was ever started');
});

// ---- S10 — the UNANSWERED call (timeout / dropped connection): the session
// may or may not exist and nothing may guess, so the item STAYS task:agent.
// Whichever way it went is settled by rules that already exist.
test('S10a unanswered but the session started: it converges the item itself', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.at('2026-08-12T04:10Z', (s) => s.apiUnansweredOnce({ started: true }));
  sim.run('2026-08-12T00:00Z', '2026-08-12T09:00Z');

  const it = sim.family('tidy/tidy-issues').find((i) => !i.seeded);
  assert.equal(sim.log.filter((e) => e.kind === 'handoff-unanswered').length, 1);
  assert.equal(it.state, 'closed');
  assert.equal(it.outcome, 'done', 'the session that (unknowably) started converged it');
  assert.equal(it.sessions.length, 1, 'exactly one session — no retry ever fired');
});

test('S10b unanswered and no session: the agent leash brings it to triage', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.at('2026-08-12T04:10Z', (s) => s.apiUnansweredOnce({ started: false }));
  sim.run('2026-08-12T00:00Z', '2026-08-13T12:00Z');

  const it = sim.family('tidy/tidy-issues').find((i) => !i.seeded);
  assert.equal(it.sessions.length, 0, 'the call created nothing');
  assert.ok(sim.log.some((e) => e.kind === 'agent-reclaim' && e.issue === it.number),
    "the janitor's agent leash swept the silent item");
  assert.ok(it.labels.has('needs-human'), 'triage — no retry ever risked a duplicate session');
});

// ---- S11 — agent dies mid-run: the janitor's 3h agent leash converges the
// item needs-human, naming the dead session.
test('S11 dead agent: janitor leash converges needs-human, names the session', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.at('2026-08-12T04:10Z', (s) => s.crashNextAgentOf('tidy/tidy-issues'));
  sim.run('2026-08-12T00:00Z', '2026-08-13T12:00Z');

  const reclaim = sim.log.find((e) => e.kind === 'agent-reclaim');
  assert.ok(reclaim, 'the leash fired');
  assert.match(reclaim.session, /^s-\d+$/, 'the dead session is named');
  const it = sim.family('tidy/tidy-issues').find((i) => !i.seeded);
  assert.ok(it.labels.has('needs-human'));
  assert.equal(sim.family('tidy/tidy-issues').filter((i) => !i.seeded && i.state === 'open').length, 1,
    'the backlog guard held — no second item while triage sits open');
});

// ---- S12' — agent did the work, died before converging; the human re-queue
// re-evaluates, and under the standing-item model the no-go ROLLS the item
// (the §H delta from old S12's close-obsolete: the item lives on).
test("S12' re-queue after work landed: the re-ask rolls, nothing duplicates", () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.at('2026-08-12T04:10Z', (s) => s.crashNextAgentOf('tidy/tidy-issues'));
  // next day the human sees the work actually landed (signal gone), re-queues
  sim.at('2026-08-13T09:00Z', (s) => {
    s.world.issueTouchedAt = null; // the work is done; the window shows nothing
    s.requeue(s.family('tidy/tidy-issues').find((i) => !i.seeded).number);
  });
  sim.run('2026-08-12T00:00Z', '2026-08-13T18:00Z');

  const it = sim.family('tidy/tidy-issues').find((i) => !i.seeded);
  assert.equal(it.state, 'open', 'not closed obsolete — rolled (the §H delta)');
  assert.ok(it.labels.has('task:blocked'));
  assert.equal(it.rolls.length, 1, 'the re-ask found no work and rolled with the reason');
  assert.equal(closedOf(sim, 'tidy/tidy-issues').length, 0, 'no duplicate execution');
});

// ---- S15 — ad-hoc item while the scheduled twin is mid-execution: the
// same-title mutex makes it wait, not run beside it.
test('S15 force-while-executing: the mutex queues the twin', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  // 04:20: agent is mid-run (16m); an impatient operator creates a twin
  sim.at('2026-08-12T04:20Z', (s) => s.createItem('tidy/tidy-issues', { urgent: true }));
  sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  const scheduled = sim.family('tidy/tidy-issues').find((i) => !i.seeded);
  const adhoc = sim.issues.find((i) => i.origin === 'manual');
  const schedClose = scheduled.closedAt;
  const adhocEval = sim.log.find((e) => e.kind === 'evaluate' && e.issue === adhoc.number);
  assert.ok(adhocEval.t >= schedClose, 'the twin waited for the scheduled run to converge');
  assert.equal(adhoc.state, 'closed', 'then had its own verdict');
});

// ---- S16 — urgent item, lost label event: the tick drain is the guarantee;
// worst-case latency is one tick interval, not a day.
test('S16 lost label event: the poll picks it up within a tick', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T14:00Z', (s) =>
    s.createItem('sheepdog/fleet-baseline', { urgent: true, eventLost: true }));
  sim.run('2026-08-12T12:00Z', '2026-08-12T16:00Z');

  const it = sim.issues.find((i) => i.origin === 'manual');
  const evalAt = sim.log.find((e) => e.kind === 'evaluate' && e.issue === it.number);
  assert.ok(evalAt, 'picked without any event');
  assert.ok(evalAt.t >= T('2026-08-12T14:17Z') && evalAt.t <= T('2026-08-12T14:18Z'),
    'at the next tick drain — events are latency sugar, listing is the guarantee');
});

// ---- S17 — delayed validation: Blocked-by + Not-before, then the pick
// verdict decides — obsolete when the world settled, a run when it did not.
test('S17 follow-up validates on day 3, closes obsolete when all landed', () => {
  const tasks = cast().concat([{
    id: 'chrome/store-validate', frequency: 'manual', outcome: 'done',
    preworkMinutes: 1, agentMinutes: 5,
    precondition: (w) => ({ run: !!w.storeRejected, reason: 'v2.4 live — landed on its own' }),
  }]);
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  let followUp;
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.releasePending = true; });
  sim.at('2026-08-12T04:25Z', (s) => { // prework delivered; create the follow-up
    const parent = s.family('chrome/store-release').find((i) => !i.seeded);
    followUp = s.createItem('chrome/store-validate', {
      blockedBy: [parent.number], notBefore: T('2026-08-14T04:00Z'),
    });
  });
  sim.run('2026-08-12T00:00Z', '2026-08-15T00:00Z');

  const evalsOf = sim.log.filter((e) => e.kind === 'evaluate' && e.issue === followUp.number);
  assert.equal(evalsOf.length, 1, 'untouched until its day');
  assert.ok(evalsOf[0].t >= T('2026-08-14T04:00Z'), 'not before Day 3 04:00');
  assert.equal(followUp.state, 'closed');
  assert.equal(followUp.outcome, 'obsolete', 'the world settled on its own');
});

test('S17b follow-up finds the store rejected the release, and runs', () => {
  const tasks = cast().concat([{
    id: 'chrome/store-validate', frequency: 'manual', outcome: 'done',
    preworkMinutes: 1, agentMinutes: 5,
    precondition: (w) => ({ run: !!w.storeRejected, reason: 'v2.4 live' }),
  }]);
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  let followUp;
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.releasePending = true; });
  sim.at('2026-08-12T04:25Z', (s) => {
    const parent = s.family('chrome/store-release').find((i) => !i.seeded);
    followUp = s.createItem('chrome/store-validate', {
      blockedBy: [parent.number], notBefore: T('2026-08-14T04:00Z'),
    });
  });
  sim.at('2026-08-13T10:00Z', ({ world }) => { world.storeRejected = true; });
  sim.run('2026-08-12T00:00Z', '2026-08-15T00:00Z');

  assert.equal(followUp.state, 'closed');
  assert.equal(followUp.outcome, 'done', 'the agent investigated the rejection');
});

// ---- S18 — fan-out with a fan-in, one member stuck: qualifiers parallelize,
// the stale-ready rule surfaces the stuck member, the stuck-dependency rule
// (F14) surfaces the starving fan-in, and a human close unsticks everything.
test('S18 fan-out: stuck member escalates, fan-in proceeds after the human acts', () => {
  const tasks = cast().concat([{
    id: 'sheepdog/fleet-status', frequency: 'manual', outcome: 'done', preworkMinutes: 2,
  }]);
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-10T00:00Z');
  const members = [];
  let fanIn;
  sim.at('2026-08-10T09:00Z', (s) => {
    for (const m of ['repo-a', 'repo-b', 'repo-x']) {
      members.push(s.createItem('sheepdog/fleet-baseline', { qualifier: m }));
    }
    fanIn = s.createItem('sheepdog/fleet-status', { blockedBy: members.map((i) => i.number) });
    s.quarantine(members[2].number); // repo-x's executor is broken
  });
  // day 3: a human writes the stuck member off
  sim.at('2026-08-13T09:00Z', (s) => s.closeByHand(members[2].number, 'obsolete'));
  sim.run('2026-08-10T00:00Z', '2026-08-14T00:00Z');

  assert.equal(members[0].state, 'closed');
  assert.equal(members[1].state, 'closed', 'distinct qualifiers ran in parallel (no mutex)');
  assert.ok(sim.log.some((e) => e.rule === 'stale-ready' && e.issue === members[2].number),
    'the unreachable member came out of the queue as a human problem');
  assert.ok(sim.log.some((e) => e.rule === 'stuck-dependency' && e.issue === fanIn.number),
    'the starving fan-in was surfaced too (F14)');
  assert.equal(fanIn.state, 'closed');
  assert.equal(fanIn.outcome, 'done', 'and proceeded by itself once the human closed the member');
});

// ---- S19 — human re-queues after fixing the cause: F7 is the whole path
// from needs-human back to execution.
test('S19 re-queue after a fix: needs-human -> ready -> normal run', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => { world.mountBehind = true; world.mountBroken = true; });
  // Tuesday: the owner fixes the mount and re-queues via the force lever
  sim.at('2026-08-13T09:00Z', (s) => { s.world.mountBroken = false; s.force('basics/baselining', { urgent: false }); });
  sim.run('2026-08-12T00:00Z', '2026-08-13T12:00Z');

  const it = sim.family('basics/baselining').find((i) => !i.seeded);
  assert.equal(it.state, 'closed');
  assert.equal(it.outcome, 'done', 'the same item converged after the fix — no new item was ever needed');
  assert.equal(sim.family('basics/baselining').filter((i) => !i.seeded).length, 1);
});

// ---- S33 — the readiness re-check on close (F1, reopened 2026-08-15): when a
// mechanism close resolves the last Blocked-by edge, the closing side readies
// the dependent in code and a drain follows — minutes, not the next tick. (A
// HAND close runs no engine code; S18 keeps the tick as that path's backstop.)
test('S33 fan-in readies within minutes of its last blocker closing', () => {
  const tasks = cast().concat([{
    id: 'sheepdog/fleet-status', frequency: 'manual', outcome: 'done', preworkMinutes: 2,
  }]);
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  const members = [];
  let fanIn;
  sim.at('2026-08-12T09:00Z', (s) => {
    for (const m of ['repo-a', 'repo-b']) {
      members.push(s.createItem('sheepdog/fleet-baseline', { qualifier: m }));
    }
    fanIn = s.createItem('sheepdog/fleet-status', { blockedBy: members.map((i) => i.number) });
  });
  sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  const lastMemberClose = Math.max(...members.map((i) => i.closedAt));
  const readied = sim.log.find((e) => e.kind === 'ready' && e.issue === fanIn.number);
  assert.equal(readied.by, 'close', 'readied by the closing side, not the tick');
  assert.ok(readied.t - lastMemberClose < 60e3, 'readiness followed the close immediately');
  assert.equal(fanIn.state, 'closed');
  assert.equal(fanIn.outcome, 'done');
  assert.ok(fanIn.closedAt - lastMemberClose <= 10 * 60e3,
    'the fan-in ran minutes after its last blocker, not a tick later');
});

// ---- S34 — one run, one item (the executor's essence, not a configured
// value): a busy morning with several tasks' work drains ONE ITEM PER RUN,
// and what causes each next run is on the record — the tick's own drain job
// first, then self-re-dispatch (workflow_dispatch, which the default
// GITHUB_TOKEN may fire) and the close-time drain, never a wait for the cron.
test('S34 busy morning: every run settles exactly one item; re-dispatch chains the queue', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => {
    world.issueTouchedAt = T('2026-08-12T04:00Z'); // tidy-issues has work
    world.releasePending = true;                   // store-release has work
  });
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  // every completed run settled at most one item — structural, not configured
  const ends = sim.log.filter((e) => e.kind === 'run-end');
  assert.ok(ends.length >= 4, 'several runs completed');
  for (const e of ends) assert.ok(e.settled <= 1, `run ${e.run} settled ${e.settled} — more than its one item`);
  // and the busy runs settled EXACTLY one — never a second item smuggled in
  assert.ok(ends.filter((e) => e.settled === 1).length >= 3, 'the working runs each did one item');

  // both work items converged the same hour — so something OTHER than the
  // hourly cron chained the runs; name it
  const [tidy] = closedOf(sim, 'tidy/tidy-issues');
  const [store] = closedOf(sim, 'chrome/store-release');
  assert.ok(tidy && store, 'both converged');
  assert.ok(store.closedAt < T('2026-08-12T05:00Z'), 'well before the next tick could have helped');
  const triggers = sim.log.filter((e) => e.kind === 'executor-run').map((e) => e.trigger);
  assert.ok(triggers.includes('tick-drain'), 'the first run is the tick workflow\'s own drain job');
  assert.ok(triggers.includes('re-dispatch'), 'a full run re-dispatched a fresh one for the remainder');
  // each pick belongs to a named run, so occupancy is auditable per run
  const picks = sim.log.filter((e) => e.kind === 'pick');
  const perRun = new Map();
  for (const p of picks) perRun.set(p.run, (perRun.get(p.run) ?? 0) + 1);
  for (const [run, n] of perRun) assert.ok(n <= 1, `run ${run} picked ${n} items — a run performs one`);
  // and heavy items serialize ACROSS runs: two work steps never overlap
  // unless raced deliberately — here, sequential picks a re-dispatch apart
});

// ---- S36 — the broken train (owner question, 2026-08-15): five tasks with
// work, and the run executing one of them DIES mid-work. The workflow's
// failure-continuation job (needs: execute, if: failure() || cancelled(), on
// a fresh runner) re-dispatches, so the four remaining items drain within
// minutes; the crashed ITEM alone waits for the leash reclaim, and the tick
// remains the backstop behind all of it.
test('S36 dead run mid-queue: failure-redispatch keeps the train moving; the leash recovers the item', () => {
  const tasks = ['c1', 'c2', 'c3', 'c4', 'c5'].map((n) => ({
    id: `x/${n}`, frequency: 'daily', outcome: 'done', preworkMinutes: 5,
    precondition: () => ({ run: true }),
  }));
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', (s) => s.crashDuringWorkOf('x/c3', 2)); // dies 2m into its work
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  const crash = sim.log.find((e) => e.kind === 'executor-crash');
  assert.ok(crash, 'one run died mid-work');
  assert.ok(sim.log.some((e) => e.kind === 'executor-run' && e.trigger === 'failure-redispatch'),
    'the failure-continuation job re-dispatched a fresh run');
  // the four unaffected items drained within minutes of the death — no item
  // except the crashed one waited for the next cron fire
  const survivors = tasks.filter((t) => t.id !== 'x/c3');
  for (const t of survivors) {
    const [done] = closedOf(sim, t.id);
    assert.ok(done, `${t.id} converged`);
    assert.ok(done.closedAt < T('2026-08-12T05:00Z'), `${t.id} did not wait out the hour`);
  }
  // the crashed item: reclaimed by the leash (from its last activity), then
  // re-picked and converged — recovery bounded by leash + tick, not lost
  assert.equal(sim.log.filter((e) => e.kind === 'reclaim' && e.task === 'x/c3').length, 1);
  const [c3] = closedOf(sim, 'x/c3');
  assert.ok(c3, 'the crashed item converged after the reclaim');
  assert.ok(c3.closedAt > crash.t + 60 * 60e3 - 1, 'its recovery cost was the leash, nothing less');
  // and no run ever settled more than its one item, dead-run day or not
  for (const e of sim.log.filter((e) => e.kind === 'run-end')) assert.ok(e.settled <= 1);
});

// ---- S37 — the operator hold (owner, 2026-08-16): CLAUDINITE_TASKS_SUSPEND_ALL
// set mid-morning. Every workflow — tick, executor, janitor — exits at its
// first act; the re-dispatch train parks one hop later at most; items freeze
// exactly where they were, no labels touched, nothing lost.
test('S37 suspend-all: workflows exit at start, the queue freezes in place', () => {
  const tasks = ['c1', 'c2', 'c3', 'c4', 'c5'].map((n) => ({
    id: `x/${n}`, frequency: 'daily', outcome: 'done', preworkMinutes: 5,
    precondition: () => ({ run: true }),
  }));
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  const AT = T('2026-08-12T04:30Z');
  sim.at('2026-08-12T04:30Z', (s) => s.suspendAll());
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z'); // no resume in this window

  // suspension gates STARTS, not running work: an in-flight run may still
  // finish its item after the hold, but nothing NEW is ever picked
  assert.ok(sim.log.some((e) => e.kind === 'close' && e.t < AT), 'the morning had started');
  assert.equal(sim.log.filter((e) => e.kind === 'pick' && e.t >= AT).length, 0, 'no pick after the hold');
  assert.equal(sim.log.filter((e) => e.kind === 'evaluate' && e.t >= AT).length, 0, 'no evaluation after the hold');
  const pickedBefore = new Set(sim.log.filter((e) => e.kind === 'pick' && e.t < AT).map((e) => e.issue));
  for (const c of sim.log.filter((e) => e.kind === 'close')) {
    assert.ok(pickedBefore.has(c.issue), `#${c.issue} closed post-hold without a pre-hold pick`);
  }
  // the parked runs are visible, workflow by workflow: the re-dispatch that was
  // already in flight, then every hourly tick
  const skips = sim.log.filter((e) => e.kind === 'suspended-skip');
  assert.ok(skips.some((e) => e.workflow === 'executor'), 'the in-flight follow-up run parked');
  assert.ok(skips.filter((e) => e.workflow === 'tick').length >= 3, 'every cron fire exited at start');
  // and the queue is frozen, not lost: every never-picked item still sits ready
  const openReady = sim.issues.filter((i) => !i.seeded && i.state === 'open');
  assert.equal(openReady.length, 5 - pickedBefore.size, 'unpicked items all survived the hold');
  for (const it of openReady) assert.ok(it.labels.has('task:ready'), `#${it.number} froze as ready`);
});

// ---- S38 — cancel + suspend, then resume (owner, 2026-08-16): the user
// cancels a stalled run (intent 1 is the continuation's business), suspends
// the queue before the continuation lands (intent 2), and later resumes by
// clearing the variable — the next cron tick alone self-heals everything:
// reclaims the cancelled run's claim, drains the queue, converges all.
test('S38 resume after a hold: clearing the variable + the next tick recovers everything', () => {
  const tasks = [
    { id: 'x/slow', frequency: 'daily', outcome: 'done', preworkMinutes: 30,
      precondition: () => ({ run: true }) },
    { id: 'x/quick', frequency: 'daily', outcome: 'done', preworkMinutes: 3,
      precondition: () => ({ run: true }) },
  ];
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  // the user cancels x/slow's run 5 minutes into its work…
  sim.at('2026-08-12T04:00Z', (s) => s.crashDuringWorkOf('x/slow', 5));
  // …and suspends everything moments later, before the continuation job's
  // re-dispatch lands — intent 2 overrides intent 1's train
  sim.at('2026-08-12T04:23Z', (s) => s.suspendAll());
  sim.at('2026-08-12T10:00Z', (s) => s.resumeAll()); // clear the variable; no manual dispatch
  sim.run('2026-08-12T00:00Z', '2026-08-12T14:00Z');

  const hold = [T('2026-08-12T04:23Z'), T('2026-08-12T10:00Z')];
  // during the hold: the continuation's re-dispatch parked, and nothing ran
  assert.ok(sim.log.some((e) => e.kind === 'suspended-skip'
    && e.workflow === 'executor' && e.trigger === 'failure-redispatch'),
    'the cancelled run\'s continuation fired one re-dispatch, which parked at start');
  assert.equal(sim.log.filter((e) => e.kind === 'evaluate' && e.t >= hold[0] && e.t < hold[1]).length,
    0, 'the hold held');
  // after clearing the variable, the 10:17 cron tick alone recovers: it
  // reclaims the cancelled run's silent claim (leash long expired during the
  // hold) and its drain converges the whole queue — no manual dispatch needed
  const reclaim = sim.log.find((e) => e.kind === 'reclaim' && e.task === 'x/slow');
  assert.ok(reclaim && reclaim.t >= hold[1], 'the first tick back reclaimed the cancelled claim');
  for (const id of ['x/slow', 'x/quick']) {
    const [done] = closedOf(sim, id);
    assert.ok(done, `${id} converged after resume`);
    assert.ok(done.closedAt >= hold[1], `${id} converged after the hold lifted`);
  }
  assert.ok(closedOf(sim, 'x/slow')[0].closedAt < T('2026-08-12T11:30Z'),
    'recovery took the tick + the work bound, not another day');
});

// ---- S26 — the guard's second half must not over-block either: after a
// rolled item runs and closes, the NEXT period still gets a fresh item.
test('S26b the closed-at guard half releases at the next anchor', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T09:03Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T09:03Z'); });
  sim.run('2026-08-12T00:00Z', '2026-08-14T12:00Z');

  // Wednesday's item rolls, runs Thursday 04:17, closes 04:34. The closed-at
  // guard half must suppress only THURSDAY's re-creation — Friday's anchor
  // must still get a fresh item.
  const fam = sim.family('tidy/tidy-issues').filter((i) => !i.seeded);
  assert.equal(closedOf(sim, 'tidy/tidy-issues').length, 1, 'Thursday ran once, not twice');
  assert.equal(fam.length, 2, "the Wednesday item (closed Thursday) plus Friday's fresh item");
  assert.ok(fam[1].createdAt >= T('2026-08-14T04:00Z'),
    "Friday's occurrence was not eaten by Thursday's close");
});

// ---- S28 — the mechanism (or a task) changes mid-flight: items carry no
// schedule, so a declaration change applies at the very next evaluation with
// no migration and no relabeling.
test('S28 declaration change mid-flight: the standing item follows HEAD', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  // mid-day, an update lands: tidy-issues moves to the 02:00 anchor and now
  // yields to baselining; its precondition is replaced outright
  sim.at('2026-08-12T12:00Z', (s) => s.updateTask('tidy/tidy-issues', {
    frequency: 'daily-2h',
    precondition: (w) => ({ run: !!w.newSignal, reason: 'new precondition, no work' }),
  }));
  sim.at('2026-08-14T01:00Z', ({ world }) => { world.newSignal = true; });
  sim.run('2026-08-12T00:00Z', '2026-08-14T12:00Z');

  const it = sim.family('tidy/tidy-issues').find((i) => !i.seeded);
  const asks = evals(sim, 'tidy/tidy-issues');
  // day 2: the item sleeps out its ALREADY-STAMPED wake (old 04:00 anchor) —
  // the one scheduling fact it carries — and is judged there by the NEW
  // precondition; the update itself never touched the item
  assert.ok(asks[1].t >= T('2026-08-13T04:00Z') && asks[1].t < T('2026-08-13T05:00Z'),
    'second ask at the wake stamped before the update');
  assert.equal(asks[1].run, false, 'judged by the new precondition');
  assert.equal(it.rolls[1].reason, 'new precondition, no work');
  // and THAT roll targets the NEW anchor: day 3's ask lands at 02:17
  assert.ok(asks[2].t >= T('2026-08-14T02:00Z') && asks[2].t < T('2026-08-14T03:00Z'),
    'the first roll after the update adopts the new cadence');
  assert.equal(asks[2].run, true);
  assert.equal(it.state, 'closed', 'and ran under the new declaration');
});

// ---- S29 — bootstrap into a repo with old-mechanism issues: the disjoint
// title family means the tick neither reads nor touches them.
test('S29 old-vocabulary issues are invisible to the new mechanism', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  let relic;
  sim.at('2026-08-12T00:05Z', (s) => {
    relic = s.foreignIssue('[claudinite-task] basics/baselining d2026-08-11');
  });
  sim.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  assert.equal(relic.state, 'open', 'the relic is untouched');
  assert.deepEqual([...relic.labels], ['agent-dispatch'], 'no label was added or removed');
  assert.equal(relic.comments.length, 0);
  const it = sim.standingItem('basics/baselining');
  assert.ok(it && it.labels.has('task:blocked'),
    'the new mechanism ran its own item beside the relic, undisturbed');
});

// ---- S30 — a stale issue list let a duplicate standing item through (F16):
// nothing documents REST-list read-your-writes across runs, so the design
// self-heals instead of assuming — the next tick closes every open standing
// item but the oldest.
test('S30 duplicate standing item: the next tick self-heals (F16)', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  let dup;
  sim.at('2026-08-12T04:30Z', (s) => { dup = s.injectDuplicateStanding('tidy/tidy-issues'); });
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  assert.equal(dup.state, 'closed');
  assert.equal(dup.outcome, 'obsolete');
  assert.ok(sim.log.some((e) => e.kind === 'dedupe' && e.issue === dup.number));
  const openFam = sim.family('tidy/tidy-issues').filter((i) => i.state === 'open');
  assert.equal(openFam.length, 1, 'exactly one standing item survives');
  assert.ok(openFam[0].number < dup.number, 'and it is the oldest');
});

// ---- S31 — the leash under long work (F17, reframed by the work-as-work
// review 2026-08-15): the work step IS the work — long, crash-prone, often the
// whole task — so the leash must not have to exceed every task's work bound.
// Heartbeat comments during the work step keep a LIVE executor's item out of
// the reclaim however long the work runs; the wiring constraint that remains
// is heartbeat interval < leash.
test('S31 heartbeat interval >= executing leash is refused at wiring (F17 reframed)', () => {
  assert.throws(
    () => makeSim({ tasks: cast(), heartbeatMinutes: 90 }),
    /reaches the executing leash — F17/);
});

test('S31b the livelock heartbeats prevent: silent long work reclaimed alive, forever', () => {
  const tasks = [{
    id: 'x/slow', frequency: 'daily', outcome: 'done', preworkMinutes: 130, // > 1h leash
    precondition: () => ({ run: true }),
  }];
  const sim = makeSim({ tasks, heartbeatsDisabled: true }).seedSteadyState('2026-08-12T00:00Z');
  sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  // worse than one duplicate run — a LIVELOCK: every tenure is reclaimed
  // before it can finish, the work re-executes each cycle, nothing converges
  assert.ok(sim.log.filter((e) => e.kind === 'reclaim').length >= 3, 'reclaimed again and again');
  assert.ok(evals(sim, 'x/slow').length >= 3, 'the work re-executed each cycle');
  assert.equal(closedOf(sim, 'x/slow').length, 0, 'and the occurrence NEVER converges');
});

test('S31c long work with heartbeats: never reclaimed alive, converges once', () => {
  const tasks = [{
    id: 'x/slow', frequency: 'daily', outcome: 'done', preworkMinutes: 130, // > 1h leash — legal now
    precondition: () => ({ run: true }),
  }];
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  assert.equal(sim.log.filter((e) => e.kind === 'reclaim').length, 0, 'no reclaim of a live run');
  assert.ok(sim.log.filter((e) => e.kind === 'heartbeat').length >= 8,
    'the item timeline stayed live throughout (a heartbeat every 15m of a 130m run)');
  assert.equal(closedOf(sim, 'x/slow').length, 1, 'one execution, one outcome');
});

test('S31d dead executor mid-long-work: recovery is bounded by the leash, not the work', () => {
  const tasks = [{
    id: 'x/slow', frequency: 'daily', outcome: 'done', preworkMinutes: 130,
    precondition: () => ({ run: true }),
  }];
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', (s) => s.crashDuringWorkOf('x/slow', 40)); // dies 40m in
  sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  const crash = sim.log.find((e) => e.kind === 'executor-crash');
  const reclaim = sim.log.find((e) => e.kind === 'reclaim');
  assert.ok(crash && reclaim, 'died, then reclaimed');
  // last heartbeat was at +30m; the leash (1h) reclaims from there at a tick —
  // hours, not the 130m work bound plus anything
  assert.ok(reclaim.t - crash.t <= 2 * 3600e3, 'reclaimed within ~leash+tick of the death');
  assert.equal(closedOf(sim, 'x/slow').length, 1, 're-picked and converged (the work step is re-entrant)');
});

// ---- S32 — the pick-filter race (F15): two executors, same stale snapshot,
// each claims a DIFFERENT item of the same title. The per-item lease cannot
// see it; only the post-claim re-verify serializes the pair.
test('S32 twin-title race: post-claim re-verify serializes, later claim reverts', () => {
  // scoped cast: the scenario is about one title's twins racing
  const tasks = cast().filter((t) => t.id === 'tidy/tidy-issues');
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.dropTicks('2026-08-12T04:00Z', '2026-08-12T05:00Z');
  sim.tickAt('2026-08-12T04:16Z'); // scheduled item exists ready…
  sim.at('2026-08-12T04:16:20Z', (s) =>
    s.createItem('tidy/tidy-issues', { urgent: true, eventLost: true })); // …and its twin
  sim.raceExecutorsAt('2026-08-12T04:16:35Z', ['E1', 'E2'], { spread: true }); // before the drain
  sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  const reverts = sim.log.filter((e) => e.kind === 'claim-reverted');
  assert.equal(reverts.length, 1, 'exactly one of the two simultaneous claims reverted');
  // no instant ever had two same-title items in execution
  const twinEvals = sim.log.filter((e) => e.kind === 'evaluate' && e.task === 'tidy/tidy-issues');
  const times = twinEvals.map((e) => e.t);
  assert.equal(new Set(times).size, times.length, 'the twins were never evaluated at the same instant');
  // and BOTH still converged — the reverted one was re-claimed in a fresh
  // episode (F18: dead claims from the reverted tenure must not outrank the
  // next live claimant) and simply waited its turn
  for (const it of sim.issues.filter((i) => !i.seeded)) {
    assert.equal(it.state, 'closed', `#${it.number} converged`);
  }
});
