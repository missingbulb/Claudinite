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
      codeWorkMinutes: 21, agentMinutes: 30,
      precondition: (w) => ({ run: !!w.mountBehind, reason: 'mount converged, no pending notes' }),
      requestsAgent: (w) => !!w.baseliningNeedsJudgment,
      codeWorkFails: (w) => !!w.mountBroken,
    },
    {
      id: 'grow/growth-extract', frequency: 'daily-1h', after: ['basics/baselining'],
      outcome: 'done', codeWorkMinutes: 2, agentMinutes: 35,
      precondition: (w) => ({ run: !!w.extractHasLessons, reason: 'nothing new to extract' }),
    },
    {
      id: 'grow/growth-promote', frequency: 'daily', after: ['grow/growth-extract'],
      outcome: 'done', codeWorkMinutes: 1, agentMinutes: 2,
      precondition: (w) => ({ run: !!w.promoteHasCandidates, reason: 'nothing staged' }),
    },
    {
      id: 'tidy/tidy-issues', frequency: 'daily', outcome: 'done',
      codeWorkMinutes: 1, agentMinutes: 16,
      precondition: (w, now) => ({
        run: w.issueTouchedAt != null && now - w.issueTouchedAt <= 24 * 3600e3,
        reason: 'no issue touched in window',
      }),
    },
    {
      id: 'chrome/store-release', frequency: 'daily', outcome: 'done', codeWorkMinutes: 3,
      precondition: (w) => ({ run: !!w.releasePending, reason: 'nothing to release' }),
    },
    {
      id: 'gcec/create-extractor', frequency: 'hourly', outcome: 'done',
      codeWorkMinutes: 4, agentMinutes: 10,
      precondition: (w) => ({ run: !!w.pendingRequest, reason: 'no eligible requests' }),
    },
    {
      id: 'tidy/tidy-prs', frequency: 'weekly', outcome: 'done',
      codeWorkMinutes: 1, agentMinutes: 5,
      precondition: (w) => ({ run: !!w.stalePrs, reason: 'no stale PRs' }),
    },
    { id: 'sheepdog/fleet-baseline', frequency: 'manual', outcome: 'done', codeWorkMinutes: 1, agentMinutes: 5 },
  ];
}

// The triage-split cast (S41–S43), kept OUT of `cast()` on purpose: these two
// always-run tasks would add executor contention to every other scenario, and
// S15's mutex timing is sensitive to exactly that.
const SEEDS = {
  id: 'sheepdog/fleet-seeds', frequency: 'daily', outcome: 'done', codeWorkMinutes: 2,
  precondition: () => ({ run: true }),
  codeWorkFails: (w) => !!w.patScopeMissing,
  codeWorkTriage: () => 'action', // the PAT lacks Contents: write — a person grants it
};
const REGENERATE = {
  id: 'site/regenerate', frequency: 'daily', outcome: 'done', codeWorkMinutes: 2,
  precondition: () => ({ run: true }),
  deliversOpenPr: () => true,
};

const evals = (sim, task) => sim.log.filter((e) => e.kind === 'evaluate' && e.task === task);
// The anchor-side ask (#1115): the scheduler run's evaluation when the anchor
// comes — distinct from `evals`, the executor's pick-time re-evaluation.
const asks = (sim, task) => sim.log.filter((e) => e.kind === 'anchor-evaluate' && e.task === task);
const closedOf = (sim, task) =>
  sim.family(task).filter((i) => !i.seeded && i.state === 'closed' && i.outcome != null);

// ---- S1' — quiet night: one anchor-side ask per task per period, no items at
// all — a no creates nothing, and the board carries the verdicts (#1115).
test("S1' quiet night: one ask per period, no items — the board carries the verdicts", () => {
  const sim = makeSim({ tasks: cast() })
    .seedSteadyState('2026-08-12T00:00Z')
    .run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  for (const task of ['basics/baselining', 'tidy/tidy-issues', 'chrome/store-release']) {
    assert.equal(asks(sim, task).length, 1, `${task} asked once`);
    assert.equal(sim.standingItem(task), undefined, `${task} filed no item`);
    assert.equal(sim.board.rows.get(task).verdict, 'no', `${task}'s decline is a board row`);
  }
  // the hourly task asks hourly — that is its declared cadence, not a defect
  assert.equal(asks(sim, 'gcec/create-extractor').length, 23);
  // manual tasks never instantiate
  assert.equal(sim.family('sheepdog/fleet-baseline').length, 0);
  // the executor evaluated nothing: no item ever existed to pick
  assert.equal(sim.log.filter((e) => e.kind === 'evaluate').length, 0);
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

  const a = asks(sim, 'tidy/tidy-issues');
  assert.equal(a.length, 2, 'one ask per day, two days');
  assert.ok(a[0].t < T('2026-08-12T05:00Z') && a[0].run === false, 'day 1: declined — a board row, no item');
  assert.ok(a[1].t > T('2026-08-13T04:00Z') && a[1].run === true, 'day 2: found the work and filed the item');
  assert.equal(closedOf(sim, 'tidy/tidy-issues').length, 1);
});

// ---- S4 — the late-fire night: all cron fires drop, one late scheduler run at 05:41,
// and the chain still runs the same morning, in order, via the pick-time yield.
test('S4 late fire: the chain completes the same morning, ordered', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => {
    world.mountBehind = true;         // baselining has real work (no judgment needed)
    world.extractHasLessons = true;   // and so does the rest of the chain
    world.promoteHasCandidates = true;
  });
  sim.dropSchedulerRuns('2026-08-12T00:00Z', '2026-08-12T05:41Z');
  sim.schedulerRunAt('2026-08-12T05:41Z');
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
  assert.ok(baseClaim.t >= T('2026-08-12T05:41Z'), 'nothing happened before the late scheduler run');
  // F1 (reopened 2026-08-15): the close-time drain picks the yielded dependent
  // in minutes — chain links no longer wait out the scheduler run
  assert.ok(extractClaim.t <= base.closedAt + 5 * 60e3, 'picked within minutes of the upstream closing');
});

// ---- S5 — the scheduler run is down for three days: the first run back asks
// about the most recent occurrence only; exactly one catch-up ask, no backfill.
test('S5 three-day outage: one catch-up ask, no backfill', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-11T00:00Z');
  sim.dropSchedulerRuns('2026-08-11T09:00Z', '2026-08-14T10:00Z');
  sim.run('2026-08-11T00:00Z', '2026-08-14T23:00Z');

  const a = asks(sim, 'tidy/tidy-issues');
  assert.equal(a.length, 2, 'Tuesday once, Friday once — Wed/Thu gone, not backfilled');
  assert.ok(a[1].t >= T('2026-08-14T10:17Z'), 'catch-up on the first scheduler run back');
  assert.equal(sim.family('tidy/tidy-issues').filter((i) => i.state === 'open').length, 0,
    'declines file nothing — the catch-up ask is a board row');
  assert.equal(sim.board.rows.get('tidy/tidy-issues').lastAsked, T('2026-08-14T04:00Z'),
    "the board's watermark is Friday's anchor, the only occurrence asked about");
});

// ---- S13' — an ad-hoc item's no-go closes it (no anchor to roll to).
// Ad-hoc is STRUCTURAL (DESIGN §3): a qualifier is what makes this item ad-hoc —
// an unqualified item of a scheduled task would BE the standing item, and roll.
test("S13' ad-hoc no-go closes obsolete instead of rolling", () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  let adhoc;
  sim.at('2026-08-12T10:00Z', (s) => { adhoc = s.createItem('tidy/tidy-issues', { urgent: true, qualifier: 'one-off' }); });
  sim.run('2026-08-12T05:00Z', '2026-08-12T12:00Z'); // start past the 04:17 ask: the scheduled decline is a board row

  assert.equal(adhoc.state, 'closed');
  assert.equal(adhoc.outcome, 'obsolete');
  // …and the ad-hoc twin neither consumed nor disturbed the scheduled family:
  // the anchor's decline sits on the board, and no unqualified item exists.
  assert.equal(sim.family('tidy/tidy-issues').filter((i) => i.state === 'open').length, 0);
  assert.equal(sim.board.rows.get('tidy/tidy-issues')?.verdict, 'no');
});

// ---- S14'/S16' — forcing MINTS the standing item (no item exists between
// occurrences once a decline files nothing); a force that finds no work closes
// with the reason on record, a force that finds work runs.
test("S14' force mints the standing item; no-go closes with a reason", () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T15:00Z', (s) => s.force('tidy/tidy-issues'));
  sim.run('2026-08-12T00:00Z', '2026-08-12T18:00Z');

  assert.ok(sim.log.some((e) => e.kind === 'force' && e.minted), 'nothing to wake — the force minted');
  const forced = sim.family('tidy/tidy-issues').find((i) => !i.seeded);
  assert.equal(forced.state, 'closed');
  assert.equal(forced.outcome, 'obsolete', 'the forced ask found no work and said so');
  assert.equal(sim.log.find((e) => e.kind === 'decline-close' && e.issue === forced.number).reason,
    'no issue touched in window', 'the force reads its answer');
  assert.equal(evals(sim, 'tidy/tidy-issues').length, 1, 'the executor evaluated the forced item once');
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

// ---- S21 — the quiet month: no items at all, five weekly board asks, zero
// escalations. The quiet task's whole footprint is one row on the board.
test('S21 quiet weeks: no items, five board asks, no janitor noise', () => {
  const sim = makeSim({ tasks: cast() })
    .seedSteadyState('2026-08-02T05:00Z') // Sunday, past the 04:00 anchor
    .run('2026-08-02T05:00Z', '2026-09-07T00:00Z');

  assert.equal(sim.family('tidy/tidy-prs').filter((i) => !i.seeded).length, 0,
    'five quiet weeks file nothing');
  assert.equal(asks(sim, 'tidy/tidy-prs').length, 5, 'one ask per Sunday');
  assert.equal(sim.boardWrites().filter((e) => e.task === 'tidy/tidy-prs').length, 5,
    'each ask moved the row — and only an ask ever writes it');
  assert.equal(sim.log.filter((e) => e.kind === 'escalate').length, 0,
    'nothing to escalate: no item ever sat anywhere');
});

// ---- S22 — the hourly task: asks hourly while quiet (board rows, no issues),
// runs within the hour once work exists. The churn is the declared cadence.
test('S22 hourly churn on the board, then work found within the hour', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T14:40Z', ({ world }) => { world.pendingRequest = true; });
  sim.run('2026-08-12T00:00Z', '2026-08-12T16:00Z');

  const fam = sim.family('gcec/create-extractor').filter((i) => !i.seeded);
  assert.equal(fam.length, 1, 'the quiet hours filed nothing — only the working hour has an item');
  const it = fam[0];
  assert.ok(it.createdAt >= T('2026-08-12T15:00Z'), 'created at the first anchor after the work arrived');
  assert.equal(it.state, 'closed');
  assert.ok(it.closedAt <= T('2026-08-12T15:40Z'), 'ran within the hour of the work arriving');
  assert.ok(asks(sim, 'gcec/create-extractor').length >= 14, 'the quiet hours were each still asked');
});

// ---- S23 — the upstream declines (or is broken): dependents run anyway. A
// declined upstream now has NO item at all, so the yield sees nothing live.
test('S23 declined upstream leaves nothing to yield to; the dependent runs', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => { world.extractHasLessons = true; }); // baselining stays quiet
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  assert.equal(sim.standingItem('basics/baselining'), undefined,
    'the quiet upstream filed nothing — its decline is a board row');
  assert.equal(sim.board.rows.get('basics/baselining').verdict, 'no');
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

// ---- S24 — retired with the roll (#1115). The trap it demonstrated — `after`
// wired as Blocked-by starving every dependent of a quiet upstream — needed a
// standing item that rolls and never closes; a declined occurrence now files
// no item at all, so the object of the starvation no longer exists. The yield
// remains the wiring, exercised by S4 (ordering on a go-night) and S23 (a
// declined upstream holds nothing back). SCENARIOS §H keeps the record.
test('S24 three quiet-upstream days: the yield never holds the dependent', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => { world.extractHasLessons = true; });
  sim.run('2026-08-12T00:00Z', '2026-08-15T00:00Z'); // three quiet-upstream days

  assert.equal(closedOf(sim, 'grow/growth-extract').length, 3,
    'extract asked and run each of the three days');
  assert.equal(sim.family('basics/baselining').filter((i) => !i.seeded).length, 0,
    'the quiet upstream filed nothing all week');
});

// ---- S25 — adoption: a brand-new task's first item is born blocked until its
// next real anchor, so a fresh repo never fires weekly work off-anchor.
test('S25 adoption: first ask lands on the real anchor, not the first scheduler run', () => {
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

// ---- S8-flavored — a dead executor's claim is reclaimed by the scheduler run's leash
// and the item is simply re-picked; code-work re-entrancy is the contract.
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

// ---- S6 — double-fire: two scheduler runs in the same minute, one item.
test('S6 double scheduler run: the occurrence guard holds under a duplicate fire', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.dropSchedulerRuns('2026-08-12T04:00Z', '2026-08-12T05:00Z'); // replace the cron fire…
  sim.schedulerRunAt('2026-08-12T04:17:05Z');                       // …with a duplicated one
  sim.schedulerRunAt('2026-08-12T04:17:20Z');
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  const fam = sim.family('tidy/tidy-issues').filter((i) => !i.seeded);
  assert.equal(fam.length, 1, 'one item despite two scheduler runs');
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
  sim.dropSchedulerRuns('2026-08-12T04:00Z', '2026-08-12T05:00Z');
  sim.schedulerRunAt('2026-08-12T04:17Z'); // creates both items; the race lands just
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
  // day 2's window has fresh work too, so the anchor's ask says yes
  sim.at('2026-08-13T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-13T04:00Z'); });
  sim.run('2026-08-12T00:00Z', '2026-08-13T12:00Z');

  const reclaim = sim.log.find((e) => e.kind === 'agent-reclaim');
  assert.ok(reclaim, 'the leash fired');
  assert.match(reclaim.session, /^s-\d+$/, 'the dead session is named');
  const it = sim.family('tidy/tidy-issues').find((i) => !i.seeded);
  assert.ok(it.labels.has('needs-human'));
  // A dead session is a `decision` park — whether the interrupted run left
  // anything behind is the choice being handed over — and a decision is one
  // person's inbox, not a fault in the task. So it does NOT hold the lane: the
  // next day's occurrence is asked and filed beside it, which is the #1032
  // delta (before the split a park froze the task's schedule outright, and a
  // permission gap parked Shepherd's fleet-digest for two days on exactly that).
  assert.ok(it.labels.has('task:needs-human-decision'));
  const beside = sim.family('tidy/tidy-issues')
    .filter((i) => !i.seeded && i.createdAt >= T('2026-08-13T04:00Z'));
  assert.equal(beside.length, 1, "the next day's occurrence was filed around the park");
  assert.equal(beside[0].outcome, 'done', 'and ran normally while the incident waited');
  assert.equal(it.state, 'open', 'the park itself still waits for its person');
});

// ---- S12' — agent did the work, died before converging; the human re-queue
// re-evaluates, and the no-go CLOSES the item with the reason (#1115 — the
// roll's stay-open-blocked resting state is gone). The incident leaves no
// open issue behind once its person has acted.
test("S12' re-queue after work landed: the re-ask closes with the reason", () => {
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
  assert.equal(it.state, 'closed', 'the re-ask found no work and closed the incident item');
  assert.equal(it.outcome, 'obsolete');
  assert.ok(sim.log.some((e) => e.kind === 'decline-close' && e.issue === it.number),
    'with the reason on its record');
  // The 13th's own occurrence was still asked — the incident never froze the
  // schedule; its decline is a board row, not another sleeping issue.
  assert.ok(asks(sim, 'tidy/tidy-issues').some((e) => e.t >= T('2026-08-13T04:00Z')));
  assert.equal(sim.family('tidy/tidy-issues').filter((i) => i.state === 'open').length, 0,
    'nothing open remains once the person acted');
});

// ---- S15 — a same-title twin while the scheduled item is mid-execution: the
// same-title mutex makes it wait, not run beside it. Under the structural rule
// (DESIGN §3) an unqualified duplicate is an unsanctioned creation — the wake
// lever is the sanctioned impatience — but a write-gated human can always make
// one, and the mutex must still serialize it.
test('S15 force-while-executing: the mutex queues the twin', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  // 04:20: agent is mid-run (16m); an impatient operator creates a twin
  let twin;
  sim.at('2026-08-12T04:20Z', (s) => { twin = s.createItem('tidy/tidy-issues', { urgent: true }); });
  sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  const scheduled = sim.family('tidy/tidy-issues').find((i) => !i.seeded && i !== twin);
  const schedClose = scheduled.closedAt;
  const twinEval = sim.log.find((e) => e.kind === 'evaluate' && e.issue === twin.number);
  assert.ok(twinEval.t >= schedClose, 'the twin waited for the scheduled run to converge');
  assert.equal(twin.state, 'closed', 'then had its own verdict');
});

// ---- S16 — urgent item, lost label event: the scheduler run drain is the guarantee;
// worst-case latency is one scheduler run interval, not a day.
test('S16 lost label event: the poll picks it up within a scheduler run', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  let it;
  sim.at('2026-08-12T14:00Z', (s) => {
    it = s.createItem('sheepdog/fleet-baseline', { urgent: true, eventLost: true });
  });
  sim.run('2026-08-12T12:00Z', '2026-08-12T16:00Z');

  const evalAt = sim.log.find((e) => e.kind === 'evaluate' && e.issue === it.number);
  assert.ok(evalAt, 'picked without any event');
  assert.ok(evalAt.t >= T('2026-08-12T14:17Z') && evalAt.t <= T('2026-08-12T14:18Z'),
    'at the next scheduler run drain — events are latency sugar, listing is the guarantee');
});

// ---- S17 — delayed validation: Blocked-by + Not-before, then the pick
// verdict decides — obsolete when the world settled, a run when it did not.
test('S17 follow-up validates on day 3, closes obsolete when all landed', () => {
  const tasks = cast().concat([{
    id: 'chrome/store-validate', frequency: 'manual', outcome: 'done',
    codeWorkMinutes: 1, agentMinutes: 5,
    precondition: (w) => ({ run: !!w.storeRejected, reason: 'v2.4 live — landed on its own' }),
  }]);
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  let followUp;
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.releasePending = true; });
  sim.at('2026-08-12T04:25Z', (s) => { // code_work delivered; create the follow-up
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
    codeWorkMinutes: 1, agentMinutes: 5,
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
    id: 'sheepdog/fleet-status', frequency: 'manual', outcome: 'done', codeWorkMinutes: 2,
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
// the dependent in code and a drain follows — minutes, not the next scheduler run. (A
// HAND close runs no engine code; S18 keeps the scheduler run as that path's backstop.)
test('S33 fan-in readies within minutes of its last blocker closing', () => {
  const tasks = cast().concat([{
    id: 'sheepdog/fleet-status', frequency: 'manual', outcome: 'done', codeWorkMinutes: 2,
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
  assert.equal(readied.by, 'close', 'readied by the closing side, not the scheduler run');
  assert.ok(readied.t - lastMemberClose < 60e3, 'readiness followed the close immediately');
  assert.equal(fanIn.state, 'closed');
  assert.equal(fanIn.outcome, 'done');
  assert.ok(fanIn.closedAt - lastMemberClose <= 10 * 60e3,
    'the fan-in ran minutes after its last blocker, not a scheduler run later');
});

// ---- S34 — one run, one item (the executor's essence, not a configured
// value): a busy morning with several tasks' work drains ONE ITEM PER RUN,
// and what causes each next run is on the record — the scheduler run's own drain job
// first, then self-re-dispatch (workflow_dispatch, which the default
// GITHUB_TOKEN may fire) and the close-time drain, never a wait for the cron.
test('S34 busy morning: every run settles exactly one item; re-dispatch chains the queue', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => {
    world.extractHasLessons = true;                // growth-extract has work
  });
  sim.at('2026-08-12T04:00Z', ({ world }) => {
    world.issueTouchedAt = T('2026-08-12T04:00Z'); // tidy-issues has work
    world.releasePending = true;                   // store-release has work
  });
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  // every completed run settled at most one item — structural, not configured
  const ends = sim.log.filter((e) => e.kind === 'run-end');
  assert.ok(ends.length >= 3, 'several runs completed');
  for (const e of ends) assert.ok(e.settled <= 1, `run ${e.run} settled ${e.settled} — more than its one item`);
  // and the busy runs settled EXACTLY one — never a second item smuggled in
  assert.ok(ends.filter((e) => e.settled === 1).length >= 3, 'the working runs each did one item');

  // both work items converged the same hour — so something OTHER than the
  // hourly cron chained the runs; name it
  const [tidy] = closedOf(sim, 'tidy/tidy-issues');
  const [store] = closedOf(sim, 'chrome/store-release');
  assert.ok(tidy && store, 'both converged');
  assert.ok(store.closedAt < T('2026-08-12T05:00Z'), 'well before the next scheduler run could have helped');
  const triggers = sim.log.filter((e) => e.kind === 'executor-run').map((e) => e.trigger);
  assert.ok(triggers.includes('scheduler-run-drain'), 'the first run is the scheduler run workflow\'s own drain job');
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
// minutes; the crashed ITEM alone waits for the leash reclaim, and the scheduler run
// remains the backstop behind all of it.
test('S36 dead run mid-queue: failure-redispatch keeps the train moving; the leash recovers the item', () => {
  const tasks = ['c1', 'c2', 'c3', 'c4', 'c5'].map((n) => ({
    id: `x/${n}`, frequency: 'daily', outcome: 'done', codeWorkMinutes: 5,
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
  // re-picked and converged — recovery bounded by leash + scheduler run, not lost
  assert.equal(sim.log.filter((e) => e.kind === 'reclaim' && e.task === 'x/c3').length, 1);
  const [c3] = closedOf(sim, 'x/c3');
  assert.ok(c3, 'the crashed item converged after the reclaim');
  assert.ok(c3.closedAt > crash.t + 60 * 60e3 - 1, 'its recovery cost was the leash, nothing less');
  // and no run ever settled more than its one item, dead-run day or not
  for (const e of sim.log.filter((e) => e.kind === 'run-end')) assert.ok(e.settled <= 1);
});

// ---- S37 — the operator hold (owner, 2026-08-16): CLAUDINITE_TASKS_SUSPEND_ALL
// set mid-morning. Every workflow — scheduler run, executor, janitor — exits at its
// first act; the re-dispatch train parks one hop later at most; items freeze
// exactly where they were, no labels touched, nothing lost.
test('S37 suspend-all: workflows exit at start, the queue freezes in place', () => {
  const tasks = ['c1', 'c2', 'c3', 'c4', 'c5'].map((n) => ({
    id: `x/${n}`, frequency: 'daily', outcome: 'done', codeWorkMinutes: 5,
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
  // already in flight, then every hourly scheduler run
  const skips = sim.log.filter((e) => e.kind === 'suspended-skip');
  assert.ok(skips.some((e) => e.workflow === 'executor'), 'the in-flight follow-up run parked');
  assert.ok(skips.filter((e) => e.workflow === 'scheduler-run').length >= 3, 'every cron fire exited at start');
  // and the queue is frozen, not lost: every never-picked item still sits ready
  const openReady = sim.issues.filter((i) => !i.seeded && i.state === 'open');
  assert.equal(openReady.length, 5 - pickedBefore.size, 'unpicked items all survived the hold');
  for (const it of openReady) assert.ok(it.labels.has('task:ready'), `#${it.number} froze as ready`);
});

// ---- S38 — cancel + suspend, then resume (owner, 2026-08-16): the user
// cancels a stalled run (intent 1 is the continuation's business), suspends
// the queue before the continuation lands (intent 2), and later resumes by
// clearing the variable — the next cron scheduler run alone self-heals everything:
// reclaims the cancelled run's claim, drains the queue, converges all.
test('S38 resume after a hold: clearing the variable + the next scheduler run recovers everything', () => {
  const tasks = [
    { id: 'x/slow', frequency: 'daily', outcome: 'done', codeWorkMinutes: 30,
      precondition: () => ({ run: true }) },
    { id: 'x/quick', frequency: 'daily', outcome: 'done', codeWorkMinutes: 3,
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
  // after clearing the variable, the 10:17 cron scheduler run alone recovers: it
  // reclaims the cancelled run's silent claim (leash long expired during the
  // hold) and its drain converges the whole queue — no manual dispatch needed
  const reclaim = sim.log.find((e) => e.kind === 'reclaim' && e.task === 'x/slow');
  assert.ok(reclaim && reclaim.t >= hold[1], 'the first scheduler run back reclaimed the cancelled claim');
  for (const id of ['x/slow', 'x/quick']) {
    const [done] = closedOf(sim, id);
    assert.ok(done, `${id} converged after resume`);
    assert.ok(done.closedAt >= hold[1], `${id} converged after the hold lifted`);
  }
  assert.ok(closedOf(sim, 'x/slow')[0].closedAt < T('2026-08-12T11:30Z'),
    'recovery took the scheduler run + the work bound, not another day');
});

// ---- S26 — the guard's second half must not over-block either: after an
// item runs and closes, the NEXT period's ask still happens.
test('S26b the closed-at guard half releases at the next anchor', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T09:03Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T09:03Z'); });
  sim.run('2026-08-12T00:00Z', '2026-08-14T12:00Z');

  // Wednesday's ask declines (nothing touched yet at 04:17). Thursday's ask
  // finds the 09:03 touch, files the item, it runs and closes 04:34. The
  // closed-at guard half (and the board's go row) must suppress only the REST
  // OF THURSDAY — Friday's anchor must still be asked.
  const fam = sim.family('tidy/tidy-issues').filter((i) => !i.seeded);
  assert.equal(closedOf(sim, 'tidy/tidy-issues').length, 1, 'Thursday ran once, not twice');
  assert.equal(fam.length, 1, "Thursday's item is the only one — Friday's ask declined on the board");
  const friday = asks(sim, 'tidy/tidy-issues').filter((e) => e.t >= T('2026-08-14T04:00Z'));
  assert.equal(friday.length, 1, "Friday's occurrence was not eaten by Thursday's close");
  assert.equal(friday[0].run, false, 'and its verdict (stale window) is a board row');
});

// ---- S28 — the mechanism (or a task) changes mid-flight: nothing durable
// carries a schedule (a declined task holds no item at all, and the board's
// row is a watermark, not a wake), so a declaration change applies at the
// very next scheduler run with no migration and no relabeling.
test('S28 declaration change mid-flight: the next ask follows HEAD', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  // mid-day, an update lands: tidy-issues moves to the 02:00 anchor and now
  // yields to baselining; its precondition is replaced outright
  sim.at('2026-08-12T12:00Z', (s) => s.updateTask('tidy/tidy-issues', {
    frequency: 'daily-2h',
    precondition: (w) => ({ run: !!w.newSignal, reason: 'new precondition, no work' }),
  }));
  sim.at('2026-08-14T01:00Z', ({ world }) => { world.newSignal = true; });
  sim.run('2026-08-12T00:00Z', '2026-08-14T12:00Z');

  const a = asks(sim, 'tidy/tidy-issues');
  // The very next scheduler run reads the new frequency: today's NEW-calendar
  // occurrence (02:00, which the 04:00 row's watermark does not cover) is
  // asked at 12:17, judged by the NEW precondition. One extra ask on the day
  // of the change, never a double run — the occurrence guard's closed-at half
  // covers a same-period item that already ran.
  assert.ok(a[1].t >= T('2026-08-12T12:00Z') && a[1].t < T('2026-08-12T13:00Z'),
    'the first ask after the update is immediate, under the new calendar');
  assert.equal(a[1].run, false, 'judged by the new precondition');
  assert.equal(sim.board.rows.get('tidy/tidy-issues').reason, 'new precondition, no work');
  // day 2 quiet at the new 02:17; day 3, work present: asked at 02:17 and run
  assert.ok(a[2].t >= T('2026-08-13T02:00Z') && a[2].t < T('2026-08-13T03:00Z'));
  assert.ok(a[3].t >= T('2026-08-14T02:00Z') && a[3].t < T('2026-08-14T03:00Z'));
  assert.equal(a[3].run, true);
  assert.equal(closedOf(sim, 'tidy/tidy-issues').length, 1, 'and ran under the new declaration');
});

// ---- S29 — bootstrap into a repo with old-mechanism issues: the disjoint
// title family means the scheduler run neither reads nor touches them.
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
  assert.ok(asks(sim, 'basics/baselining').length >= 1,
    'the new mechanism asked its own question beside the relic, undisturbed');
  assert.equal(sim.board.rows.get('basics/baselining').verdict, 'no',
    'and recorded the decline on its own board');
});

// ---- S30 — a stale issue list let a duplicate standing item through (F16):
// nothing documents REST-list read-your-writes across runs, so the design
// self-heals instead of assuming — the next scheduler run closes every open standing
// item but the oldest.
test('S30 duplicate standing item: the next scheduler run self-heals (F16)', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  // The one open unqualified item a stale list lets through is now simply the
  // minted standing item (§8) — F16's fault needs TWO open ones, so inject two.
  let first; let dup;
  sim.at('2026-08-12T04:30Z', (s) => { first = s.injectDuplicateStanding('tidy/tidy-issues'); });
  sim.at('2026-08-12T04:31Z', (s) => { dup = s.injectDuplicateStanding('tidy/tidy-issues'); });
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  assert.equal(dup.state, 'closed');
  assert.equal(dup.outcome, 'obsolete');
  assert.ok(sim.log.some((e) => e.kind === 'dedupe' && e.issue === dup.number));
  const openFam = sim.family('tidy/tidy-issues').filter((i) => i.state === 'open');
  assert.ok(openFam.every((i) => i.number === first.number), 'only the oldest may survive');
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
    id: 'x/slow', frequency: 'daily', outcome: 'done', codeWorkMinutes: 130, // > 1h leash
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
    id: 'x/slow', frequency: 'daily', outcome: 'done', codeWorkMinutes: 130, // > 1h leash — legal now
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
    id: 'x/slow', frequency: 'daily', outcome: 'done', codeWorkMinutes: 130,
    precondition: () => ({ run: true }),
  }];
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', (s) => s.crashDuringWorkOf('x/slow', 40)); // dies 40m in
  sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  const crash = sim.log.find((e) => e.kind === 'executor-crash');
  const reclaim = sim.log.find((e) => e.kind === 'reclaim');
  assert.ok(crash && reclaim, 'died, then reclaimed');
  // last heartbeat was at +30m; the leash (1h) reclaims from there at a scheduler run —
  // hours, not the 130m work bound plus anything
  assert.ok(reclaim.t - crash.t <= 2 * 3600e3, 'reclaimed within ~leash+scheduler run of the death');
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
  sim.dropSchedulerRuns('2026-08-12T04:00Z', '2026-08-12T05:00Z');
  sim.schedulerRunAt('2026-08-12T04:16Z'); // scheduled item exists ready…
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

// ---- S39 — the episode boundary must survive an episode that ended SILENTLY
// (F24). The roll's half of this retired with the roll itself (#1115): a
// decline now CLOSES its item, and nothing re-claims a closed issue — so the
// silent-episode class narrows to the `needs-human` park, which S39b races a
// second executor across. The second attempt MUST come from a different
// executor: a single executor beats its own stale claim by identity, the same
// masking that hid F18 until S32 raced two.
test('S39b a parked item a human re-queues is claimable by another executor at once (F24)', () => {
  const tasks = cast().filter((t) => t.id === 'basics/baselining');
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:00Z', ({ world }) => { world.mountBehind = true; world.mountBroken = true; });
  sim.run('2026-08-12T00:00Z', '2026-08-12T06:00Z');

  const parked = sim.issues.find((i) => i.labels.has('needs-human'));
  assert.ok(parked, 'the work step failed, so the item parked for a human');

  // The sanctioned re-queue (F7) and nothing else: strip needs-human, apply
  // task:ready. No marker, no cleanup — the strike already happened.
  sim.at('2026-08-12T07:00Z', (s) => { s.world.mountBroken = false; s.requeue(parked.number); });
  sim.raceExecutorsAt('2026-08-12T07:00:30Z', ['E2']);
  sim.run('2026-08-12T06:00Z', '2026-08-12T14:00Z');

  assert.deepEqual(sim.log.filter((e) => e.kind === 'claim-lost'), [],
    're-queued work must be claimable — a claim standing from the parked episode livelocks it forever');
  assert.ok(sim.log.some((e) => e.kind === 'claim' && e.exec === 'E2'), 'E2 held the item');
});


// ---- S41 — the worker's own triage verdict routes the park ------------------
// The executor sees an exit code and nothing more, so it cannot tell a token
// missing a scope from a bug in the worker. A worker that knows says so, and the
// park lands in the lane whose remedy actually matches (DESIGN §4, §6.5).
test('S41 a worker that names its failure class parks there, not at failure', () => {
  const sim = makeSim({ tasks: [SEEDS] });
  sim.at('2026-08-12T00:00Z', ({ world }) => { world.patScopeMissing = true; });
  sim.run('2026-08-12T00:00Z', '2026-08-13T12:00Z');

  const parked = sim.issues.find((i) => i.taskId === 'sheepdog/fleet-seeds' && i.labels.has('needs-human'));
  assert.ok(parked, 'the failing run parked');
  assert.ok(parked.labels.has('task:needs-human-action'), "the worker's verdict, not the default");
  assert.equal(parked.labels.has('task:needs-human-failure'), false, 'and only one sub-label');
  assert.ok(sim.log.some((e) => e.kind === 'work-failed' && e.triage === 'action'));
});

// A worker that says nothing is the compatibility case — every worker written
// before the marker existed, in every run. An unexplained break is a break.
test('S41b a worker that says nothing parks at failure, and holds the lane', () => {
  const sim = makeSim({ tasks: [{ ...SEEDS, codeWorkTriage: undefined }] });
  sim.at('2026-08-12T00:00Z', ({ world }) => { world.patScopeMissing = true; });
  sim.run('2026-08-12T00:00Z', '2026-08-14T12:00Z');

  const fam = sim.family('sheepdog/fleet-seeds');
  const parked = fam.find((i) => i.labels.has('needs-human'));
  assert.ok(parked.labels.has('task:needs-human-failure'));
  assert.equal(fam.filter((i) => i.state === 'open').length, 1,
    'the lane is held — two days of anchors passed and nothing was filed behind it');
});

// ---- S42 — the approval park: succeeded, and waiting on a reviewer ----------
// The one park that is not a fault. It stays OPEN, because closing it would hide
// an unreviewed PR from every surface that counts open work — and it does NOT
// hold the lane, because the reviewer's silence must delay only the review.
test('S42 a run that left an unmerged PR parks open for approval and keeps its schedule', () => {
  const sim = makeSim({ tasks: [REGENERATE] });
  sim.run('2026-08-12T00:00Z', '2026-08-14T12:00Z');

  const fam = sim.family('site/regenerate');
  const parked = fam.filter((i) => i.labels.has('task:needs-human-approval'));
  assert.ok(parked.length >= 1, 'the delivering run parked for approval');
  assert.ok(parked.every((i) => i.state === 'open'), 'open — a waiting reviewer is not a closed item');
  // Two anchors passed and each filed its own item, around the ones still parked.
  assert.ok(fam.length >= 2, 'the schedule went on around the unreviewed PR');
  assert.ok(sim.log.filter((e) => e.kind === 'delivered-open-pr').length >= 2);
});

// ---- S43 — the road back clears BOTH labels --------------------------------
// A re-queue that stripped only the state would leave a live item still wearing
// a triage sub-label: a shape no rule defines, and one the janitor's stateless
// repair would not catch either, since the item does wear `task:ready`.
test('S43 the human re-queue leaves no triage label behind', () => {
  const sim = makeSim({ tasks: [SEEDS] });
  sim.at('2026-08-12T00:00Z', ({ world }) => { world.patScopeMissing = true; });
  // A task's first-ever item is born BLOCKED until its next real anchor (S25),
  // so nothing can park before the 13th — re-queue after that, or this asserts
  // over an item that never failed.
  // Asserted AT the re-queue, not at the end of the run: the invariant is about
  // the item's state the moment the lever is pulled, and by the end the re-queued
  // item has run and closed, taking every label with it.
  let after = null;
  sim.at('2026-08-13T09:00Z', (s) => {
    s.world.patScopeMissing = false; // the scope was granted
    const parked = s.issues.find((i) => i.labels.has('needs-human'));
    assert.ok(parked, 'precondition of this scenario: something is parked to re-queue');
    s.requeue(parked.number);
    after = [...parked.labels];
  });
  sim.run('2026-08-12T00:00Z', '2026-08-13T18:00Z');

  assert.ok(after, 'the re-queue ran');
  assert.deepEqual(after.filter((l) => l.startsWith('task:needs-human-')), [],
    'no sub-label survived the re-queue');
  assert.equal(after.includes('needs-human'), false);
  assert.ok(after.includes('task:ready'), 'and it went back into the queue');
});

// ---- K. Ad-hoc requests (DESIGN §16, owner 2026-08-18) --------------------
// "A way to mark an issue as 'let claude do this task', and the next executor
// run picks it up." The mark is a label on an ORDINARY issue; the scheduler run adopts it
// into a work item; the built-in request task's precondition is the security
// check; there is no code-work at all. These play the paths that decide whether
// the mechanism is safe: who may ask, what a refusal does, and what a request
// that changed its mind between adoption and pickup does.

const REQ = 'engine/implement-request';
const adopts = (sim) => sim.log.filter((e) => e.kind === 'adopt');
const parked = (it, kind) => it.labels.has('needs-human') && it.labels.has(`task:needs-human-${kind}`);

test('S44 a marked issue becomes exactly one run, parked for the reviewer', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let req;
  sim.at('2026-08-18T09:03Z', (s) => { req = s.markIssue({ author: 'owner' }); });
  sim.run('2026-08-18T09:00Z', '2026-08-19T09:00Z');

  // One adoption, one item, however many scheduler runs ran across the day.
  assert.equal(adopts(sim).length, 1);
  const items = sim.requestItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].request, req.number);
  assert.equal(items[0].model, 'opus');               // no model label ⇒ the default
  // Structurally ad-hoc — a manual task, a qualified title — so it consumes no
  // scheduled occurrence and needs no marker to say so (DESIGN §3).
  assert.ok(items[0].title.endsWith(` #${req.number}`));
  // The run succeeded and left a PR, so it parks for approval rather than
  // closing — and that park is not a fault, so it holds nobody's lane.
  assert.ok(parked(items[0], 'approval'));
  assert.equal(items[0].state, 'open');
  // …and the issue says what is true of it: a change is written, awaiting review.
  assert.deepEqual([...req.labels].sort(), ['claude-in-review']);
  assert.equal(sim.log.filter((e) => e.kind === 'handoff' && e.task === REQ).length, 1);
});

test('S45 an unauthorized mark is refused once, disarmed, and never re-adopted', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let req;
  sim.at('2026-08-18T09:03Z', (s) => { req = s.markIssue({ author: 'passer-by' }); });
  sim.run('2026-08-18T09:00Z', '2026-08-19T09:00Z');

  const items = sim.requestItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].outcome, 'obsolete');         // declined: no anchor to roll to
  assert.equal(sim.log.filter((e) => e.kind === 'handoff' && e.task === REQ).length, 0);
  // A refusal is not a park: nothing here is anybody's inbox, so it closes rather
  // than joining a triage lane.
  assert.equal(items[0].labels.has('needs-human'), false);
  // The issue is told and disarmed — the label that would re-trigger is gone, so a
  // day of further scheduler runs adopts nothing. Without the disarm this is an hourly
  // refusal loop on somebody else's issue.
  assert.equal(sim.log.filter((e) => e.kind === 'request-declined').length, 1);
  assert.deepEqual([...req.labels], []);
  assert.equal(adopts(sim).length, 1);
});

test('S46 an outsider\'s issue runs only on an approval comment from someone with push', () => {
  const approved = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  approved.at('2026-08-18T09:03Z', (s) => s.markIssue({
    author: 'stranger',
    comments: [{ login: 'owner', body: '/claude go' }],
  }));
  approved.run('2026-08-18T09:00Z', '2026-08-19T09:00Z');
  assert.ok(parked(approved.requestItems()[0], 'approval'));

  // The same phrase from someone without push access decides nothing.
  const not = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  not.at('2026-08-18T09:03Z', (s) => s.markIssue({
    author: 'stranger',
    comments: [{ login: 'passer-by', body: '/claude go' }],
  }));
  not.run('2026-08-18T09:00Z', '2026-08-19T09:00Z');
  assert.equal(not.requestItems()[0].outcome, 'obsolete');

  // Permission, not association, decides (F30): a read-only collaborator would
  // ride the payload as COLLABORATOR, but the permission read says no push —
  // their own issue is refused just like a stranger's.
  const readOnly = makeSim({ tasks: cast(), collaborators: { owner: 'admin', reader: 'read' } })
    .seedSteadyState('2026-08-18T00:00Z');
  readOnly.at('2026-08-18T09:03Z', (s) => s.markIssue({ author: 'reader' }));
  readOnly.run('2026-08-18T09:00Z', '2026-08-19T09:00Z');
  assert.equal(readOnly.requestItems()[0].outcome, 'obsolete');
});

test('S47 the model label routes the run; an unknown family falls back to the default', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  sim.at('2026-08-18T09:03Z', (s) => {
    s.markIssue({ author: 'owner', model: 'sonnet' });
    s.markIssue({ author: 'owner', model: 'gpt-9' });
  });
  sim.run('2026-08-18T09:00Z', '2026-08-19T09:00Z');
  assert.deepEqual(sim.requestItems().map((i) => i.model), ['sonnet', 'opus']);
  // Two requests, two items — they are separate work, not one batch. Two
  // approval parks, and neither delays the other.
  assert.equal(sim.requestItems().length, 2);
  assert.ok(sim.requestItems().every((i) => parked(i, 'approval')));
  // The model labels are consumed with the mark (F29): each ask names its model
  // afresh, so a label left from an earlier ask can never outrank a new one.
  assert.ok(sim.requests.every((r) => ![...r.labels].some((l) => l.startsWith('claude-model:'))),
    'adoption consumed the model labels');
});

test('S48 a request withdrawn after adoption never reaches an agent', () => {
  const withdrawn = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let req;
  withdrawn.at('2026-08-18T09:03Z', (s) => { req = s.markIssue({ author: 'owner' }); });
  // …between the scheduler run that adopted it and the executor picking it up.
  withdrawn.at('2026-08-18T09:17:20Z', (s) => s.withdrawRequest(req.number));
  withdrawn.run('2026-08-18T09:00Z', '2026-08-18T18:00Z');
  assert.equal(withdrawn.requestItems()[0].outcome, 'obsolete');
  assert.equal(withdrawn.log.filter((e) => e.kind === 'handoff' && e.task === REQ).length, 0);

  // Closing the issue is the same answer by a different route.
  const closed = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let req2;
  closed.at('2026-08-18T09:03Z', (s) => { req2 = s.markIssue({ author: 'owner' }); });
  closed.at('2026-08-18T09:17:20Z', (s) => s.closeRequestIssue(req2.number));
  closed.run('2026-08-18T09:00Z', '2026-08-18T18:00Z');
  assert.equal(closed.requestItems()[0].outcome, 'obsolete');
});

test('S49 a failed request parks as a fault; re-marking supersedes the park and runs once more', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let req;
  sim.at('2026-08-18T09:03Z', (s) => {
    s.updateTask(REQ, { agentFails: () => true });
    req = s.markIssue({ author: 'owner' });
  });
  sim.run('2026-08-18T09:00Z', '2026-08-18T11:00Z');

  // A broken run is a `failure` — someone reads the trace — and the ISSUE keeps
  // `claude-queued`: nothing mechanical re-arms work that writes code, and the
  // standing label is what stops the next scheduler run adopting a second run.
  assert.ok(parked(sim.requestItems()[0], 'failure'));
  assert.deepEqual([...req.labels], ['claude-queued']);
  assert.equal(adopts(sim).length, 1);

  // The human fixes the cause and re-marks the issue — the phone-sized retry.
  // Adoption SUPERSEDES the parked item (F28): the retry closes its predecessor
  // rather than leaving it parked forever beside the run that replaced it.
  sim.at('2026-08-18T12:00Z', (s) => {
    s.updateTask(REQ, { agentFails: () => false });
    s.remarkIssue(req.number, { model: 'haiku' });
  });
  sim.run('2026-08-18T11:00Z', '2026-08-19T09:00Z');

  const [first, second] = sim.requestItems();
  assert.equal(adopts(sim).length, 2);
  assert.equal(first.state, 'closed');
  assert.equal(first.outcome, 'obsolete');
  assert.equal(sim.log.filter((e) => e.kind === 'supersede' && e.issue === first.number).length, 1);
  // The new ask's model rides the new mark — the old ask's labels were consumed
  // at its own adoption, so nothing stale outranks haiku (F29).
  assert.equal(second.model, 'haiku');
  assert.ok(parked(second, 'approval'));
  assert.deepEqual([...req.labels], ['claude-in-review']);
});

test('S50 a request issue that is GONE declines; one that cannot be READ fails the run', () => {
  // Definitively gone — the API answers that the issue does not exist: a plain
  // decline, exactly like a withdrawal (there is nothing left to write back to).
  const gone = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let g;
  gone.at('2026-08-18T09:03Z', (s) => { g = s.markIssue({}); });
  gone.at('2026-08-18T09:17:20Z', (s) => s.deleteRequestIssue(g.number));
  gone.run('2026-08-18T09:00Z', '2026-08-18T18:00Z');
  assert.equal(gone.requestItems()[0].outcome, 'obsolete');
  assert.equal(gone.log.filter((e) => e.kind === 'handoff' && e.task === REQ).length, 0);

  // Transiently unreadable — a rate limit, a 500 — is NOT a verdict (F27):
  // declining would eat the request permanently (the decline's write-back cannot
  // reach an issue it cannot read, so `claude-queued` would stand forever over
  // nothing). It is a run failure: the item parks in the failure lane, open and
  // visible, and the ordinary re-queue lever retries once the API recovers.
  const flaky = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let f;
  flaky.at('2026-08-18T09:03Z', (s) => { f = s.markIssue({}); });
  flaky.at('2026-08-18T09:17:20Z', (s) => s.setRequestUnreadable(f.number, true));
  flaky.run('2026-08-18T09:00Z', '2026-08-18T11:00Z');

  const item = flaky.requestItems()[0];
  assert.ok(flaky.log.some((e) => e.kind === 'evaluate-failed' && e.issue === item.number));
  assert.ok(parked(item, 'failure'));
  assert.equal(flaky.log.filter((e) => e.kind === 'request-declined').length, 0);
  assert.ok(f.labels.has('claude-queued'), 'the request issue is untouched — still armed');

  // The API recovers; the human re-queues the parked item; the run completes.
  flaky.at('2026-08-18T12:00Z', (s) => {
    s.setRequestUnreadable(f.number, false);
    s.requeue(item.number);
  });
  flaky.run('2026-08-18T11:00Z', '2026-08-19T09:00Z');
  assert.ok(parked(item, 'approval'));
  assert.deepEqual([...f.labels], ['claude-in-review']);
  assert.equal(adopts(flaky).length, 1, 'the retry rode the SAME item — nothing re-adopted');
});

test('S51 re-marking while the item is live waits, unconsumed, until the run settles', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let req;
  sim.at('2026-08-18T09:03Z', (s) => {
    s.updateTask(REQ, { agentMinutes: 150 });    // a long run: live across two scheduler runs
    req = s.markIssue({});
  });
  // An impatient re-ask in mid-run must not put a second session onto the same
  // issue: while the prior item is LIVE the mark waits on the issue, unconsumed,
  // and the scheduler run that finds the run settled takes it — superseding the park the
  // settle left behind.
  sim.at('2026-08-18T09:30Z', (s) => s.remarkIssue(req.number));
  sim.run('2026-08-18T09:00Z', '2026-08-19T09:00Z');

  assert.equal(adopts(sim).length, 2);
  assert.ok(adopts(sim)[1].t >= T('2026-08-18T12:00Z'),
    'the second adoption waited out the live run');
  const [first, second] = sim.requestItems();
  assert.equal(first.state, 'closed');
  assert.equal(first.outcome, 'obsolete');
  assert.equal(sim.log.filter((e) => e.kind === 'supersede' && e.issue === first.number).length, 1);
  assert.ok(parked(second, 'approval'));
});

// ---- L. No work, no item — the schedule board (owner, 2026-08-20, #1115) ----
// The scheduler run evaluates the precondition when the anchor comes and files
// a work item only on a yes; a no is a row on the per-repo schedule board. The
// board is the watermark ("have I asked this task about this anchor?") and a
// FIRST authority only for "asked and declined" — every other column derives
// fresh. It fails toward evaluating, never toward skipping, and the executor
// still re-evaluates at pick: the board carries no verdict forward.

// ---- S52 — a decline at the anchor: no item, a board row, and the board
// itself created lazily by the first row that needs writing.
test('S52 a decline files no item; the board is created lazily and records it', () => {
  const sim = makeSim({ tasks: cast() })
    .seedSteadyState('2026-08-12T00:00Z')
    .run('2026-08-12T00:00Z', '2026-08-12T06:00Z');

  assert.equal(sim.log.filter((e) => e.kind === 'board-create').length, 1,
    'one board, created by the first decline — never ahead of one');
  assert.equal(sim.family('tidy/tidy-issues').filter((i) => !i.seeded).length, 0, 'no item');
  const row = sim.board.rows.get('tidy/tidy-issues');
  assert.equal(row.verdict, 'no');
  assert.equal(row.lastAsked, T('2026-08-12T04:00Z'), 'the row names the anchor asked about');
  assert.equal(row.frequency, 'daily');
  assert.equal(row.reason, 'no issue touched in window');
});

// ---- S53 — the watermark: the hourly scheduler runs between anchors re-ask
// nothing; the next anchor asks again.
test('S53 the board watermark stops re-asks until the next anchor', () => {
  const sim = makeSim({ tasks: cast() })
    .seedSteadyState('2026-08-12T00:00Z')
    .run('2026-08-12T00:00Z', '2026-08-13T06:00Z');

  const a = asks(sim, 'tidy/tidy-issues');
  assert.equal(a.length, 2, 'two days, two asks — ~28 hourly scheduler runs asked nothing extra');
  assert.ok(a[0].t < T('2026-08-12T05:00Z'));
  assert.ok(a[1].t >= T('2026-08-13T04:17Z'), "the next day's anchor is asked again");
  assert.ok(sim.log.filter((e) => e.kind === 'scheduler-run').length >= 28,
    'the scheduler kept running hourly throughout');
});

// ---- S54 — the board is deleted mid-window: absent reads fail toward
// evaluating. Cost: at most ONE redundant evaluation per task; never a double
// run — the occurrence guard's closed-at half still covers a completed one.
test('S54 a deleted board costs one redundant ask, never a double run', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => { world.releasePending = true; }); // store-release has work
  sim.at('2026-08-12T12:00Z', (s) => s.deleteBoard());
  sim.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  // the declining task: asked at 04:17, re-asked once at 12:17 (row gone),
  // then the rewritten row holds every later run back
  assert.equal(asks(sim, 'tidy/tidy-issues').length, 2, 'exactly one redundant ask');
  assert.equal(sim.family('tidy/tidy-issues').filter((i) => !i.seeded).length, 0);
  // the task that RAN: its item closed this period, so the closed-at guard —
  // not the board — is what prevents a second run
  assert.equal(asks(sim, 'chrome/store-release').length, 1, 'not even re-asked');
  assert.equal(closedOf(sim, 'chrome/store-release').length, 1, 'and certainly not re-run');
});

test('S54b a corrupt board degrades to absent per-row, and the next write repairs it', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T12:00Z', (s) => s.corruptBoard());
  sim.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  assert.equal(asks(sim, 'tidy/tidy-issues').length, 2, 'one redundant ask, same as deletion');
  assert.equal(sim.board.corrupt, false, 'the redundant ask\'s write replaced the mangled body');
  assert.equal(sim.board.rows.get('tidy/tidy-issues').verdict, 'no');
  assert.equal(sim.family('tidy/tidy-issues').filter((i) => !i.seeded).length, 0, 'still no items');
});

// ---- S55 — fail-open: signal collection fails for ONE task (the scheduler
// stub holds no fleet credential); its item is created exactly as the
// calendar-only model created it, and the executor — which holds the
// credentials — decides at pick. The other tasks are untouched. Never fewer
// runs because a read failed.
test('S55 signals unavailable for one task: fail-open item, executor decides; others unaffected', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.setSignalsUnavailable('basics/baselining');
  // day 2 the executor-side read finds real work
  sim.at('2026-08-13T00:01Z', ({ world }) => { world.mountBehind = true; });
  sim.run('2026-08-12T00:00Z', '2026-08-14T00:00Z');

  const fam = sim.family('basics/baselining').filter((i) => !i.seeded);
  assert.equal(fam.length, 2, 'an item per occurrence — fail-open never files fewer');
  assert.equal(sim.board.rows.get('basics/baselining').verdict, 'fail-open');
  // day 1: the executor's own evaluation declined, and the item closed
  assert.equal(fam[0].outcome, 'obsolete');
  assert.ok(sim.log.some((e) => e.kind === 'decline-close' && e.issue === fam[0].number));
  // day 2: the executor's evaluation found the work and ran it
  assert.equal(fam[1].outcome, 'done');
  // the other tasks still decided at the anchor and filed nothing
  assert.equal(sim.family('tidy/tidy-issues').filter((i) => !i.seeded).length, 0);
});

// ---- S56 — the one-time migration: the roll model's sleeping items close,
// their last verdict seeds the board, and the pass is idempotent. Items
// waiting on a blocker, and first-ever/adoption Not-befores, are untouched.
test('S56 the migration closes sleeping items once, seeds the board, and spares the waiting', () => {
  const sim = makeSim({ tasks: cast() });
  // a weekly item the old engine left sleeping: rolled Sunday, wakes next Sunday
  const sleeping = sim.seedSleepingItem('tidy/tidy-prs',
    { rolledAtIso: '2026-08-09T04:18Z', notBeforeIso: '2026-08-16T04:00Z', reason: 'no stale PRs' });
  // a rolled-looking item that also waits on a BLOCKER: not the migration's
  let blocker; let waiting;
  sim.at('2026-08-12T00:05Z', (s) => {
    blocker = s.createItem('sheepdog/fleet-baseline', { qualifier: 'blocker', eventLost: true });
    s.quarantine(blocker.number); // keep it open across the window
    waiting = s.seedSleepingItem('chrome/store-release',
      { rolledAtIso: '2026-08-11T04:18Z', notBeforeIso: '2026-08-20T04:00Z', blockedBy: [blocker.number] });
  });
  // several scheduler runs = the pass runs "twice"; the window ends before the
  // 04:00 anchor so the first-ever assertion below sees the item still waiting
  sim.run('2026-08-12T00:00Z', '2026-08-12T03:00Z');

  assert.equal(sleeping.state, 'closed');
  assert.equal(sleeping.outcome, 'obsolete');
  assert.equal(sim.log.filter((e) => e.kind === 'migrate-sleeping').length, 1,
    'closed exactly once across repeated runs — idempotent');
  const row = sim.board.rows.get('tidy/tidy-prs');
  assert.equal(row.verdict, 'no');
  assert.equal(row.reason, 'no stale PRs', "the item's last verdict became its row");
  assert.equal(waiting.state, 'open', 'an item waiting on a blocker is not the migration\'s');
  // first-ever items (fresh repo, no history): born blocked with a future
  // Not-before and NO roll on record — the migration must not eat them
  const firstEver = sim.standingItem('tidy/tidy-issues');
  assert.ok(firstEver && firstEver.labels.has('task:blocked'), 'the first-ever item still waits');
});

// ---- S57 — a decline racing a hand-created item. An open unqualified item
// IS the standing item (§3), so the ask is skipped entirely — the scheduler
// neither writes a row nor files a second item beside the minted one.
test('S57 a hand-minted item preempts the anchor ask; no row, no duplicate', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:10Z', (s) => s.createItem('tidy/tidy-issues', { eventLost: true }));
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  assert.equal(asks(sim, 'tidy/tidy-issues').length, 0,
    'the open minted item held the lane — the anchor never asked');
  const fam = sim.family('tidy/tidy-issues').filter((i) => !i.seeded);
  assert.equal(fam.length, 1, 'no second item was ever filed beside it');
  assert.equal(fam[0].outcome, 'obsolete', 'the executor evaluated the minted item and declined');
  assert.equal(sim.log.filter((e) => e.kind === 'dedupe').length, 0);
  // and the other race order: the anchor declines FIRST, a mint follows —
  // covered by S14' (the forced item is evaluated on its own; the closed-at
  // guard and the watermark keep the occurrence single)
});

// ---- S58 — write only what changed (F31): an hourly task declining all day
// moves only its own row, once per ask; a scheduler run that asked nothing
// writes nothing — the "record changes, never scans" rule, artifact-side.
// F31, caught here: a change test over the RENDERED body would count the
// derived next-window column, whose recomputation differs on every run, and
// quietly turn every scheduler run into a board rewrite. The change test must
// compare the authoritative columns only.
test('S58 only rows that changed are written; a quiet run writes nothing', () => {
  const sim = makeSim({ tasks: cast() })
    .seedSteadyState('2026-08-12T00:00Z')
    .run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  const writes = sim.boardWrites();
  // every write coincides with an ask of the same task at the same instant —
  // no write was ever caused by anything but a verdict moving
  for (const w of writes) {
    assert.ok(sim.log.some((e) => e.kind === 'anchor-evaluate' && e.task === w.task && e.t === w.t),
      `board write for ${w.task} at ${w.at} has no ask beside it`);
  }
  // the daily tasks wrote once; the hourly task once per ask; nothing else
  assert.equal(writes.filter((w) => w.task === 'tidy/tidy-issues').length, 1);
  assert.equal(writes.filter((w) => w.task === 'gcec/create-extractor').length,
    asks(sim, 'gcec/create-extractor').length);
});

// ---- S59 — the verdict flips between the anchor's yes and the pick: the
// executor re-evaluates and closes. The board's verdict is a watermark, never
// a verdict carried forward (trap three of #1115).
test('S59 a go at the anchor, a no at pick: the executor\'s verdict wins, once', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  // the world changes in the seconds between the scheduler run and its drain
  sim.at('2026-08-12T04:17:20Z', ({ world }) => { world.issueTouchedAt = null; });
  sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  assert.equal(asks(sim, 'tidy/tidy-issues')[0].run, true, 'the anchor said go and filed the item');
  const it = sim.family('tidy/tidy-issues').find((i) => !i.seeded);
  assert.equal(it.outcome, 'obsolete', 'the pick re-derived the world and declined');
  assert.ok(sim.log.some((e) => e.kind === 'decline-close' && e.issue === it.number));
  assert.equal(evals(sim, 'tidy/tidy-issues').length, 1, 'one pick-time evaluation');
  // and the rest of the day re-runs nothing: the closed item covers the
  // occurrence, and the board's go row covers the watermark
  assert.equal(asks(sim, 'tidy/tidy-issues').length, 1);
  assert.equal(sim.family('tidy/tidy-issues').filter((i) => !i.seeded).length, 1);
});

// ---- S60 — F31, found by this simulator: the go row must not be a watermark.
// A go verdict's row lands beside an item CREATE that can fail (a refused
// POST); if the watermark honored go rows, the row would then say "asked"
// while nothing exists to run — the occurrence silently eaten, fewer runs
// because a WRITE failed, the exact inversion of fail-open. So the watermark
// is scoped to DECLINED rows only: for a go (and a fail-open) the created
// item is the occurrence's own cover, and the row is record, never a gate.
test('S60 a go row outliving a failed create must not eat the occurrence (F31)', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.at('2026-08-12T04:01Z', (s) => s.failNextCreateOf('tidy/tidy-issues'));
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  assert.ok(sim.log.some((e) => e.kind === 'create-failed'), 'the 04:17 POST was refused');
  // the next scheduler run must re-ask and re-create — the go row is not a gate
  const a = asks(sim, 'tidy/tidy-issues');
  assert.ok(a.length >= 2, 'the occurrence was re-asked after the refused write');
  const [done] = closedOf(sim, 'tidy/tidy-issues');
  assert.ok(done, 'and the work ran within the hour — never fewer runs because a write failed');
});
