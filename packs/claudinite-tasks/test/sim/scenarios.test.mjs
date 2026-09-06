// SCENARIOS.md, executable. Each test is a timed play-through against the
// simulator in sim.mjs: "at time X, Y happens", then run the virtual clock and
// assert on the issue store and the event log. Scenario numbers match the
// prose document (§H's standing-item replay + the stable earlier scenarios);
// a test here going red means the DESIGN.md mechanism, as modeled, breaks.
//
// The cast mirrors SCENARIOS.md's "Cast and constants" table. A task's
// `preconditions` carries its run-history terms — the cadence it keeps — and
// its `precondition` function stands for every other condition, reading
// `world`, the scenario-owned signal state, and `window`, the since-last-run
// window the engine collects every movement signal over (DESIGN §5, §6.4).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeSim, T, NH, READY, ORIGIN_AD_HOC, ORIGIN_PLANNED, statusOf, periodMs,
} from './sim.mjs';

// `makeSim`'s default, restated once so the cadence scenarios can derive tick
// instants instead of transcribing the delays a run happened to produce.
const SCHEDULER_RUN_MINUTE = 17;

// a park is one status label now; these read it the way the machine does
const isParked = (it) => (statusOf(it) ?? '').startsWith(NH(''));

function cast() {
  return [
    {
      // The one task in the cast that declares it does not run past its own
      // failure: a broken mount is not something to re-run every morning.
      id: 'basics/baselining', preconditions: ['due:daily', 'last-run-not-failed'], outcome: 'done',
      codeWorkMinutes: 21, agentMinutes: 30,
      precondition: (w) => ({ run: !!w.mountBehind, reason: 'mount converged, no pending notes' }),
      requestsAgent: (w) => !!w.baseliningNeedsJudgment,
      codeWorkFails: (w) => !!w.mountBroken,
    },
    {
      id: 'grow/growth-extract', preconditions: ['due:daily'], schedule_after: ['basics/baselining'],
      outcome: 'done', codeWorkMinutes: 2, agentMinutes: 35,
      precondition: (w) => ({ run: !!w.extractHasLessons, reason: 'nothing new to extract' }),
    },
    {
      id: 'grow/growth-promote', preconditions: ['due:daily'], schedule_after: ['grow/growth-extract'],
      outcome: 'done', codeWorkMinutes: 1, agentMinutes: 2,
      precondition: (w) => ({ run: !!w.promoteHasCandidates, reason: 'nothing staged' }),
    },
    {
      // A movement-gated task: its signal is windowed the way the engine's
      // collectors window it — since this task's newest run started.
      id: 'tidy/tidy-issues', preconditions: ['due:daily'], outcome: 'done',
      codeWorkMinutes: 1, agentMinutes: 16,
      precondition: (w, _now, _item, window) => ({
        run: w.issueTouchedAt != null && w.issueTouchedAt >= window.since,
        reason: 'no issue touched in window',
      }),
    },
    {
      id: 'chrome/store-release', preconditions: ['due:daily'], outcome: 'done', codeWorkMinutes: 3,
      precondition: (w) => ({ run: !!w.releasePending, reason: 'nothing to release' }),
    },
    {
      id: 'gcec/create-extractor', preconditions: ['due:daily'], outcome: 'done',
      codeWorkMinutes: 4, agentMinutes: 10,
      precondition: (w, _now, _item, window) => ({
        run: w.requestAt != null && w.requestAt >= window.since,
        reason: 'no eligible requests',
      }),
    },
    {
      id: 'tidy/tidy-prs', preconditions: ['due:weekly'], outcome: 'done',
      codeWorkMinutes: 1, agentMinutes: 5,
      precondition: (w) => ({ run: !!w.stalePrs, reason: 'no stale PRs' }),
    },
    // no preconditions: off the schedule — a fan-out target, run only from items somebody creates
    { id: 'sheepdog/fleet-baseline', outcome: 'done', codeWorkMinutes: 1, agentMinutes: 5 },
  ];
}

// The triage-split cast (S41–S43), kept OUT of `cast()` on purpose: these two
// always-run tasks would add executor contention to every other scenario, and
// S15's mutex timing is sensitive to exactly that.
const SEEDS = {
  id: 'sheepdog/fleet-seeds', preconditions: ['due:daily'], outcome: 'done', codeWorkMinutes: 2,
  precondition: () => ({ run: true }),
  codeWorkFails: (w) => !!w.patScopeMissing,
  codeWorkTriage: () => 'action', // the PAT lacks Contents: write — a person grants it
};
const REGENERATE = {
  id: 'site/regenerate', preconditions: ['due:daily'], outcome: 'done', codeWorkMinutes: 2,
  precondition: () => ({ run: true }),
  deliversOpenPr: () => true,
};

const evals = (sim, task) => sim.log.filter((e) => e.kind === 'evaluate' && e.task === task);
// The scheduler's ask (DESIGN §5, §15.33): one `ask` entry per tick per task
// asked, `verdict` go | no | fail-open — distinct from `evals`, the executor's
// pick-time re-evaluation. A decline is this entry and nothing else.
const asks = (sim, task) => sim.log.filter((e) => e.kind === 'ask' && e.task === task);
const goes = (sim, task) => asks(sim, task).filter((e) => e.verdict === 'go');
const closedOf = (sim, task) =>
  sim.family(task).filter((i) => !i.seeded && i.state === 'closed' && i.outcome != null);
const ticks = (sim) => sim.log.filter((e) => e.kind === 'scheduler-run');

// ---- S1' — quiet night: every tick asks every scheduled task, every ask
// declines, and a decline is a log line — no item, no board, nothing durable.
test("S1' quiet night: asked at every tick, no items, nothing recorded", () => {
  const sim = makeSim({ tasks: cast() })
    .seedSteadyState('2026-08-12T00:00Z')
    .run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  assert.equal(ticks(sim).length, 24, 'the hourly cron ran all day');
  for (const task of ['basics/baselining', 'tidy/tidy-issues', 'chrome/store-release', 'gcec/create-extractor']) {
    assert.equal(asks(sim, task).length, 24, `${task} asked at every tick`);
    assert.ok(asks(sim, task).every((e) => e.verdict === 'no'), `${task} declined every time`);
    assert.equal(sim.standingItem(task), undefined, `${task} filed no item`);
  }
  // The ticks before the day's anchor decline on the cadence — yesterday's run
  // is still the current period's — the ones after it on the task's own
  // condition. Both are the same nothing.
  const early = asks(sim, 'tidy/tidy-issues').filter((e) => e.t < T('2026-08-12T04:00Z'));
  assert.ok(early.length === 4 && early.every((e) => /already ran since the daily anchor/.test(e.reason)));
  assert.equal(asks(sim, 'tidy/tidy-issues').find((e) => e.t > T('2026-08-12T04:00Z')).reason, 'no issue touched in window');
  // a task stating no condition is off the schedule: never asked, never instantiated
  assert.equal(asks(sim, 'sheepdog/fleet-baseline').length, 0);
  assert.equal(sim.family('sheepdog/fleet-baseline').length, 0);
  // the executor evaluated nothing: no item ever existed to pick
  assert.equal(sim.log.filter((e) => e.kind === 'evaluate').length, 0);
  assert.equal(sim.log.filter((e) => e.kind === 'create').length, 0);
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
  assert.equal(goes(sim, 'tidy/tidy-issues').length, 1, 'the one go was the 04:17 tick');
});

// ---- S3' — work appears mid-window: the NEXT TICK finds it, not the next
// anchor. The scheduler keeps no memory of the morning's decline (§15.33), so
// every tick asks again; `due:daily` still holds — nothing ran since 04:00 —
// and the window, since the last run, contains the touch.
test("S3' mid-window work runs at the next tick, not the next anchor", () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T09:03Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T09:03Z'); });
  sim.run('2026-08-12T00:00Z', '2026-08-13T12:00Z');

  const g = goes(sim, 'tidy/tidy-issues');
  assert.equal(g.length, 1, 'one go across two days');
  assert.equal(g[0].t, T('2026-08-12T09:17Z'), 'the tick after the touch, the same day');
  const [done] = closedOf(sim, 'tidy/tidy-issues');
  assert.ok(done && done.outcome === 'done' && done.closedAt < T('2026-08-12T10:00Z'));
  // Tomorrow's anchor is asked again — and declines: the window is since the
  // 09:17 run started, and the 09:03 touch sits before it. Once a touch, once a run.
  const tomorrow = asks(sim, 'tidy/tidy-issues').filter((e) => e.t >= T('2026-08-13T04:00Z'));
  assert.ok(tomorrow.length >= 8 && tomorrow.every((e) => e.verdict === 'no'));
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

// ---- S5 — the scheduler run is down for three days: the first tick back asks
// about NOW — `due:daily` against the current anchor, the window since the last
// run — so a touch from the outage is found once. No backfill of the missed
// days, and nothing to catch up on but the present.
test('S5 three-day outage: the first tick back finds the work once, no backfill', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-11T00:00Z');
  sim.at('2026-08-12T12:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T12:00Z'); });
  sim.dropSchedulerRuns('2026-08-11T09:00Z', '2026-08-14T10:00Z');
  sim.run('2026-08-11T00:00Z', '2026-08-15T12:00Z');

  const a = asks(sim, 'tidy/tidy-issues');
  assert.equal(a.filter((e) => e.t >= T('2026-08-11T09:00Z') && e.t < T('2026-08-14T10:00Z')).length, 0,
    'no ask while the cron was down — nothing durable was owed');
  const g = goes(sim, 'tidy/tidy-issues');
  assert.equal(g.length, 1, 'exactly one go: the first tick back');
  assert.equal(g[0].t, T('2026-08-14T10:17Z'));
  assert.equal(closedOf(sim, 'tidy/tidy-issues').length, 1, 'one run for the outage, not one per missed day');
  // Saturday's anchor asks again and declines: the window is since Friday's run.
  assert.ok(a.filter((e) => e.t >= T('2026-08-15T04:00Z')).every((e) => e.verdict === 'no'));
});

// ---- S13' — an ad-hoc item's no-go closes it. Ad-hoc is STRUCTURAL (DESIGN §3):
// a qualifier is what makes this item ad-hoc — an unqualified item of a
// scheduled task would BE the standing item.
test("S13' ad-hoc no-go closes obsolete; the scheduled family is undisturbed", () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  let adhoc;
  sim.at('2026-08-12T10:00Z', (s) => { adhoc = s.createItem('tidy/tidy-issues', { urgent: true, qualifier: 'one-off' }); });
  sim.run('2026-08-12T05:00Z', '2026-08-12T12:00Z');

  assert.equal(adhoc.state, 'closed');
  assert.equal(adhoc.outcome, 'rejected');
  // …and the ad-hoc twin neither consumed nor disturbed the scheduled family:
  // the ticks kept asking and declining, and no unqualified item exists.
  assert.equal(sim.family('tidy/tidy-issues').filter((i) => !i.seeded).length, 0);
  assert.ok(asks(sim, 'tidy/tidy-issues').length >= 6 && asks(sim, 'tidy/tidy-issues').every((e) => e.verdict === 'no'));
});

// ---- S14'/S16' — forcing MINTS the standing item (no item exists between
// occurrences once a decline files nothing), stamped `Woken`; a force that finds
// no work closes with the reason on record, a force that finds work runs.
test("S14' force mints the standing item, stamped Woken; no-go closes with a reason", () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T15:00Z', (s) => s.force('tidy/tidy-issues'));
  sim.run('2026-08-12T00:00Z', '2026-08-12T18:00Z');

  assert.ok(sim.log.some((e) => e.kind === 'force' && e.minted), 'nothing to wake — the force minted');
  const forced = sim.family('tidy/tidy-issues').find((i) => !i.seeded);
  assert.equal(forced.woken, T('2026-08-12T15:00Z'), 'the mint is stamped with the wake');
  assert.equal(forced.state, 'closed');
  assert.equal(forced.outcome, 'rejected', 'the forced ask found no work and said so');
  assert.equal(sim.log.find((e) => e.kind === 'decline-close' && e.issue === forced.number).reason,
    'no issue touched in window', 'the force reads its answer — the cadence held, the work did not');
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

// ---- S20 — the task file disappears while its item is open: validate-in-code
// closes the item at the next pick, and a force naming the gone task wakes
// nothing (planWake's `unmatched`) rather than minting for a task that is not at HEAD.
test('S20 removed task: its open item closes obsolete at the next pick; a force finds no owner', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.at('2026-08-12T04:17:10Z', (s) => s.removeTask('tidy/tidy-issues')); // filed at 04:17, gone before the 04:17:40 drain
  sim.at('2026-08-12T10:00Z', (s) => s.force('tidy/tidy-issues'));
  sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  const it = sim.family('tidy/tidy-issues').find((i) => !i.seeded);
  assert.equal(it.state, 'closed');
  assert.equal(it.outcome, 'rejected');
  assert.equal(evals(sim, 'tidy/tidy-issues').length, 0, 'validate closed it before any evaluation');
  assert.ok(sim.log.some((e) => e.kind === 'force' && e.unmatched), 'the force matched no declared task');
  assert.equal(sim.family('tidy/tidy-issues').filter((i) => !i.seeded).length, 1, 'and minted nothing');
});

// ---- S21 — the quiet month: no items at all, an ask at every tick, zero
// escalations. The quiet task's whole footprint is the scheduler's log lines.
test('S21 quiet weeks: no items, an ask per tick, no janitor noise', () => {
  const sim = makeSim({ tasks: cast() })
    .seedSteadyState('2026-08-02T05:00Z') // Sunday, past the 04:00 anchor
    .run('2026-08-02T05:00Z', '2026-09-07T00:00Z');

  assert.equal(sim.family('tidy/tidy-prs').filter((i) => !i.seeded).length, 0,
    'five quiet weeks file nothing');
  assert.equal(asks(sim, 'tidy/tidy-prs').length, ticks(sim).length, 'asked at every tick, nothing skipped');
  assert.ok(asks(sim, 'tidy/tidy-prs').every((e) => e.verdict === 'no'));
  // Between Sundays the cadence declines; on a Sunday, past its anchor, the
  // task's own condition does — no run is ever recorded anywhere but here.
  assert.ok(asks(sim, 'tidy/tidy-prs').some((e) => /already ran since the weekly anchor/.test(e.reason)));
  assert.ok(asks(sim, 'tidy/tidy-prs').some((e) => e.reason === 'no stale PRs'));
  assert.equal(sim.log.filter((e) => e.kind === 'escalate').length, 0,
    'nothing to escalate: no item ever sat anywhere');
});

// ---- S22 — the task asked every tick: quiet ticks are log lines, and the tick
// that finds the work runs it — the churn is the declared cadence, and the
// window since the last run is what keeps the next anchor from running it twice.
test('S22 asked every tick; the tick that finds work runs it, the next anchor does not repeat it', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  // Work arrives on the second day, after a quiet first one.
  sim.at('2026-08-13T01:40Z', ({ world }) => { world.requestAt = T('2026-08-13T01:40Z'); });
  sim.run('2026-08-12T00:00Z', '2026-08-14T00:00Z');

  const fam = sim.family('gcec/create-extractor').filter((i) => !i.seeded);
  assert.equal(fam.length, 1, 'the quiet period filed nothing — only the working one has an item');
  const it = fam[0];
  assert.equal(it.createdAt, T('2026-08-13T02:17Z'), 'created at the first tick after the work arrived');
  assert.equal(it.state, 'closed');
  assert.ok(it.closedAt <= T('2026-08-13T03:00Z'), 'ran at the tick that found it');
  assert.equal(asks(sim, 'gcec/create-extractor').length, ticks(sim).length,
    'every tick asked — the item ran and closed between two of them, so none found it live');
  // Thursday's 04:17 anchor asks again — `due:daily` holds, the 02:17 run was
  // Wednesday's period — and the window since that run holds no request.
  const anchor = asks(sim, 'gcec/create-extractor').find((e) => e.t === T('2026-08-13T04:17Z'));
  assert.equal(anchor.verdict, 'no');
  assert.equal(anchor.reason, 'no eligible requests');
});

// ---- S23 — the upstream declines (or is broken): dependents run anyway. A
// declined upstream has NO item at all, so the yield sees nothing live.
test('S23 declined upstream leaves nothing to yield to; the dependent runs', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => { world.extractHasLessons = true; }); // baselining stays quiet
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  assert.equal(sim.standingItem('basics/baselining'), undefined,
    'the quiet upstream filed nothing — its declines are log lines');
  assert.ok(asks(sim, 'basics/baselining').every((e) => e.verdict === 'no'));
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

  assert.ok(isParked(sim.standingItem('basics/baselining')), 'upstream broke');
  assert.equal(closedOf(sim, 'grow/growth-extract').length, 1, 'extract still ran');
});

// ---- S24 — retired with the roll (#1115). The trap it demonstrated — `schedule_after`
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

// ---- S25 — RETIRED (§15.33): the first-window booking is gone with the
// board. A brand-new task is asked at its first tick like any other — S78.

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

// ---- backlog guard — a failure park holds the task's lane ONLY where the task
// says so: `last-run-not-failed` is the task's own declaration, never the
// engine's. Both sides: baselining declares it and stays at one item however
// many days pass; the same task without it is filed beside its own park.
test('backlog guard: a failure park holds the lane only for a task declaring last-run-not-failed', () => {
  const held = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  held.at('2026-08-12T00:01Z', ({ world }) => { world.mountBehind = true; world.mountBroken = true; });
  held.run('2026-08-12T00:00Z', '2026-08-14T00:00Z');

  const fam = held.family('basics/baselining').filter((i) => !i.seeded);
  assert.equal(fam.length, 1, 'no second item while the failure park sits open');
  assert.ok(isParked(fam[0]) && fam[0].labels.has(NH('failure')));
  assert.equal(evals(held, 'basics/baselining').length, 1, 'not re-run while broken');
  // The park does not silence the ask: every later tick still asks. For the
  // rest of Wednesday `due:daily` declines first — the parked item IS this
  // period's run — and from Thursday's anchor on it is the task's own
  // `last-run-not-failed` that declines, reading the park.
  const after = asks(held, 'basics/baselining').filter((e) => e.t > T('2026-08-12T05:00Z'));
  assert.ok(after.length >= 40 && after.every((e) => e.verdict === 'no'));
  assert.ok(after.filter((e) => e.t < T('2026-08-13T04:00Z')).every((e) => /already ran since the daily anchor/.test(e.reason)));
  const thursday = after.filter((e) => e.t >= T('2026-08-13T04:00Z'));
  assert.ok(thursday.length >= 19 && thursday.every((e) => /failure park/.test(e.reason)));

  // The contrast: strip the term and the next anchor files beside the park —
  // a parked item is not live, and nothing in the engine holds a lane by itself.
  const open = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  open.at('2026-08-12T00:01Z', (s) => {
    s.updateTask('basics/baselining', { preconditions: ['due:daily'] });
    s.world.mountBehind = true; s.world.mountBroken = true;
  });
  open.run('2026-08-12T00:00Z', '2026-08-14T00:00Z');
  const beside = open.family('basics/baselining').filter((i) => !i.seeded);
  assert.equal(beside.length, 2, "Thursday's occurrence was filed beside Wednesday's park");
  assert.ok(beside.every((i) => isParked(i)), 'and broke the same way — two parks, one cause');
});

// ---- S6 — double-fire: two scheduler runs in the same minute, one item. The
// second run sees the first's LIVE item and does not ask — the one invariant.
test('S6 double scheduler run: the live-item invariant holds under a duplicate fire', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.dropSchedulerRuns('2026-08-12T04:00Z', '2026-08-12T05:00Z'); // replace the cron fire…
  sim.schedulerRunAt('2026-08-12T04:17:05Z');                       // …with a duplicated one
  sim.schedulerRunAt('2026-08-12T04:17:20Z');
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  const fam = sim.family('tidy/tidy-issues').filter((i) => !i.seeded);
  assert.equal(fam.length, 1, 'one item despite two scheduler runs');
  assert.equal(closedOf(sim, 'tidy/tidy-issues').length, 1, 'and it ran once');
  assert.equal(asks(sim, 'tidy/tidy-issues').filter((e) => e.t >= T('2026-08-12T04:17Z') && e.t < T('2026-08-12T04:18Z')).length,
    1, 'the second run did not ask — the live item held the lane');
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
  assert.ok(isParked(it), 'triage, with the refusal on record');
  assert.equal(it.sessions.length, 0, 'no session was ever started');
});

// ---- S10 — the UNANSWERED call (timeout / dropped connection): the session
// may or may not exist and nothing may guess, so the item STAYS task:status:running-agent.
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
  assert.ok(isParked(it), 'triage — no retry ever risked a duplicate session');
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
  assert.ok(isParked(it));
  // A dead session is a `decision` park — whether the interrupted run left
  // anything behind is the choice being handed over — and a park is not LIVE:
  // nothing in the engine holds a lane on its own (§15.33), so the next day's
  // occurrence is asked and filed beside it (the #1032 delta — before the split
  // a park froze the task's schedule outright, and a permission gap parked
  // Shepherd's fleet-digest for two days on exactly that).
  assert.ok(it.labels.has('task:status:needs-human-decision'));
  const beside = sim.family('tidy/tidy-issues')
    .filter((i) => !i.seeded && i.createdAt >= T('2026-08-13T04:00Z'));
  assert.equal(beside.length, 1, "the next day's occurrence was filed around the park");
  assert.equal(beside[0].outcome, 'done', 'and ran normally while the incident waited');
  assert.equal(it.state, 'open', 'the park itself still waits for its person');
});

// ---- S12' — agent did the work, died before converging; the human re-queue
// re-evaluates, and the no-go CLOSES the item with the reason. The re-queue is
// a label edit — no `Woken` stamp — so at pick the cadence terms are judged over
// the task's OTHER runs, and hold; the task's own condition is what declines.
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
  assert.equal(it.woken, null, 'the human re-queue stamps nothing');
  assert.equal(it.state, 'closed', 'the re-ask found no work and closed the incident item');
  assert.equal(it.outcome, 'rejected');
  assert.equal(sim.log.find((e) => e.kind === 'decline-close' && e.issue === it.number).reason,
    'no issue touched in window', "the task's own condition declined, not the cadence");
  // The 13th's own occurrence was still asked — the incident never froze the
  // schedule — and, after the re-queued item closed, the rest of the day
  // declines on the cadence: that close is this period's run.
  assert.ok(asks(sim, 'tidy/tidy-issues').some((e) => e.t >= T('2026-08-13T04:00Z')));
  const afterClose = asks(sim, 'tidy/tidy-issues').filter((e) => e.t > it.closedAt);
  assert.ok(afterClose.length >= 5 && afterClose.every((e) => /already ran since the daily anchor/.test(e.reason)));
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
  // An unstamped hand-made twin is judged on the cadence over the task's other
  // runs, and the scheduled item IS this period's run.
  assert.equal(twin.outcome, 'rejected');
  assert.match(sim.log.find((e) => e.kind === 'decline-close' && e.issue === twin.number).reason,
    /already ran since the daily anchor/);
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
  assert.equal(it.outcome, 'done', 'an ad-hoc item of a task off the schedule runs — its empty expression holds at pick');
});

// ---- S17 — delayed validation: Blocked-by + Not-before, then the pick
// verdict decides — obsolete when the world settled, a run when it did not.
test('S17 follow-up validates on day 3, closes obsolete when all landed', () => {
  const tasks = cast().concat([{
    id: 'chrome/store-validate', outcome: 'done',
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
  assert.equal(followUp.outcome, 'rejected', 'the world settled on its own');
});

test('S17b follow-up finds the store rejected the release, and runs', () => {
  const tasks = cast().concat([{
    id: 'chrome/store-validate', outcome: 'done',
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
    id: 'sheepdog/fleet-status', outcome: 'done', codeWorkMinutes: 2,
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
  sim.at('2026-08-13T09:00Z', (s) => s.closeByHand(members[2].number, 'rejected'));
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
// from needs-human back to execution. The force wakes the parked item —
// stamped `Woken`, so the cadence holds at pick — and `last-run-not-failed`
// reads the task's OTHER runs, none of which failed.
test('S19 re-queue after a fix: needs-human -> ready -> normal run', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => { world.mountBehind = true; world.mountBroken = true; });
  // Tuesday: the owner fixes the mount and re-queues via the force lever
  sim.at('2026-08-13T09:00Z', (s) => { s.world.mountBroken = false; s.force('basics/baselining', { urgent: false }); });
  sim.run('2026-08-12T00:00Z', '2026-08-13T12:00Z');

  const it = sim.family('basics/baselining').find((i) => !i.seeded);
  assert.equal(it.woken, T('2026-08-13T09:00Z'), 'the wake is stamped on the item it woke');
  assert.equal(it.state, 'closed');
  assert.equal(it.outcome, 'done', 'the same item converged after the fix — no new item was ever needed');
  assert.equal(sim.family('basics/baselining').filter((i) => !i.seeded).length, 1);
});

// ---- S33 — a converge writes only to the item it holds (§15.19, reversed by
// §15.31 / #1373): resolving the fan-in's last Blocked-by edge is not the
// closing side's business. The scheduler run's own readiness job (job 2) is the
// only thing that ever readies it, at its next hourly pass — never sooner, and
// never a HAND close's business either (S18 already covers that path).
test('S33 fan-in waits for the scheduler run to ready it, not the closing side', () => {
  const tasks = cast().concat([{
    id: 'sheepdog/fleet-status', outcome: 'done', codeWorkMinutes: 2,
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
  assert.equal(readied.by, undefined, 'no closing side readied it — the scheduler run\'s job 2 did');
  // the next scheduler tick at or after the last blocker closed, never sooner
  const nextTick = Math.ceil((lastMemberClose - SCHEDULER_RUN_MINUTE * 60_000) / 3_600_000) * 3_600_000
    + SCHEDULER_RUN_MINUTE * 60_000;
  assert.equal(readied.t, nextTick, 'readied at the scheduler run\'s own next pass, not the close');
  assert.equal(fanIn.state, 'closed');
  assert.equal(fanIn.outcome, 'done');
});

// ---- S34 — the batched drain (#1212, the owner reversing §15.22's one-item
// runs): Actions bills each job's minutes rounded up, so a day's cost is the
// RUN count — a busy morning with several tasks' work drains in the scheduler
// run's own drain run, items settled serially in the SAME run, and what
// caused each run is still on the record.
test('S34 busy morning: one drain run settles all its hour\'s items; every run\'s cause is recorded', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => {
    world.extractHasLessons = true;                // growth-extract has work
  });
  sim.at('2026-08-12T04:00Z', ({ world }) => {
    world.issueTouchedAt = T('2026-08-12T04:00Z'); // tidy-issues has work
    world.releasePending = true;                   // store-release has work
  });
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  // ONE drain all morning. The staggered anchor hours retired with the twice-daily cron
  // (DESIGN §17.1), so extract no longer has an 03:00 hour of its own — the whole morning is one
  // 04:17 batch, which is the cadence change paying for itself in a scenario that predates it.
  const runs = sim.log.filter((e) => e.kind === 'executor-run');
  assert.equal(runs.length, 1, 'exactly one executor invocation all morning');
  for (const e of runs) assert.equal(e.trigger, 'scheduler-run-drain');
  // the 04:17 run settled its hour's items in one invocation — the
  // batch, not a chain: no run was ever caused by a re-dispatch
  const ends = sim.log.filter((e) => e.kind === 'run-end');
  assert.ok(ends.some((e) => e.settled === 3), 'the batch run settled all three items');
  // picks stay auditable per run — the batch run's picks all name it
  const picks = sim.log.filter((e) => e.kind === 'pick');
  const perRun = new Map();
  for (const p of picks) perRun.set(p.run, (perRun.get(p.run) ?? 0) + 1);
  assert.ok([...perRun.values()].includes(3), 'one run picked all three items');
  // work stays SERIAL inside the run — the occupancy model is unchanged, only
  // the run boundary moved — and both items converged the same hour
  const [tidy] = closedOf(sim, 'tidy/tidy-issues');
  const [store] = closedOf(sim, 'chrome/store-release');
  assert.ok(tidy && store, 'both converged');
  assert.ok(store.closedAt < T('2026-08-12T05:00Z'), 'well before the next scheduler run could have helped');
  // and the quiet hours cost nothing: their scheduler runs skipped the drain
  assert.ok(sim.log.filter((e) => e.kind === 'drain-skipped').length >= 5,
    'an hour with nothing pickable dispatched no executor');
});

// ---- S36 — the broken train (owner question, 2026-08-15; replayed under the
// batched drain, #1212): five tasks with work, and the one drain run DIES
// mid-work partway through its batch. The items it already settled stay
// settled, its run-end is never written (the record died with the runner),
// and the workflow's failure-continuation job (needs: execute, if: failure()
// || cancelled(), on a fresh runner) re-dispatches — the remainder drains in
// one fresh run within minutes; the crashed ITEM alone waits for the leash
// reclaim, and the scheduler run remains the backstop behind all of it.
test('S36 dead run mid-queue: failure-redispatch keeps the train moving; the leash recovers the item', () => {
  const tasks = ['c1', 'c2', 'c3', 'c4', 'c5'].map((n) => ({
    id: `x/${n}`, preconditions: ['due:daily'], outcome: 'done', codeWorkMinutes: 5,
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
  // the dead run wrote no run-end — the record died with the runner — so
  // completed runs outnumber run-ends by exactly the one death
  const runs = sim.log.filter((e) => e.kind === 'executor-run');
  const ends = sim.log.filter((e) => e.kind === 'run-end');
  assert.equal(runs.length - ends.length, 1, 'exactly one run died recordless');
  // and the whole dead-run day cost three executor invocations: the drain
  // that died mid-batch, the continuation, and the reclaim hour's drain
  assert.equal(sim.actionExecutions().executor, 3);
});

// ---- S37 — the operator hold (owner, 2026-08-16): CLAUDINITE_TASKS_SUSPEND_ALL
// set mid-morning. Every workflow — scheduler run, executor, janitor — exits at its
// first act; a live drain finishes its current item and parks between items
// (the hold is re-read via the API at each pick, #1212); items freeze
// exactly where they were, no labels touched, nothing lost.
test('S37 suspend-all: workflows exit at start, the queue freezes in place', () => {
  const tasks = ['c1', 'c2', 'c3', 'c4', 'c5'].map((n) => ({
    id: `x/${n}`, preconditions: ['due:daily'], outcome: 'done', codeWorkMinutes: 5,
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
  assert.ok(skips.some((e) => e.workflow === 'executor'), 'the in-flight drain parked between items');
  assert.ok(skips.filter((e) => e.workflow === 'scheduler-run').length >= 3, 'every cron fire exited at start');
  // and the queue is frozen, not lost: every never-picked item still sits ready
  const openReady = sim.issues.filter((i) => !i.seeded && i.state === 'open');
  assert.equal(openReady.length, 5 - pickedBefore.size, 'unpicked items all survived the hold');
  for (const it of openReady) assert.ok(it.labels.has('task:status:waiting-for-executor'), `#${it.number} froze as ready`);
});

// ---- S38 — cancel + suspend, then resume (owner, 2026-08-16): the user
// cancels a stalled run (intent 1 is the continuation's business), suspends
// the queue before the continuation lands (intent 2), and later resumes by
// clearing the variable — the next cron scheduler run alone self-heals everything:
// reclaims the cancelled run's claim, drains the queue, converges all.
test('S38 resume after a hold: clearing the variable + the next scheduler run recovers everything', () => {
  const tasks = [
    { id: 'x/slow', preconditions: ['due:daily'], outcome: 'done', codeWorkMinutes: 30,
      precondition: () => ({ run: true }) },
    { id: 'x/quick', preconditions: ['due:daily'], outcome: 'done', codeWorkMinutes: 3,
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

// ---- S26b — the `due:` term's second half (F13): an item CREATED before the
// anchor that CLOSES after it consumed this period, or the tick after its close
// would run the task twice. A forced mint at 03:00 doing two hours of work is
// exactly that shape; and the next day's anchor must still be asked.
test("S26b the closed-at half covers the rest of the day; the next anchor is asked again", () => {
  const tasks = [{
    id: 'x/long', preconditions: ['due:daily'], outcome: 'done', codeWorkMinutes: 120,
    precondition: () => ({ run: true }),
  }];
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T03:00Z', (s) => s.force('x/long'));
  sim.run('2026-08-12T00:00Z', '2026-08-13T12:00Z');

  const [forced, next, ...rest] = sim.family('x/long').filter((i) => !i.seeded);
  assert.ok(forced.createdAt < T('2026-08-12T04:00Z') && forced.closedAt > T('2026-08-12T04:00Z'),
    'the scenario\'s premise: created before the anchor, closed after it');
  // Every tick after the close, for the rest of Wednesday, declines on the
  // closed-at half — the created-at half alone would have filed a second run.
  const afterClose = asks(sim, 'x/long').filter((e) => e.t > forced.closedAt && e.t < T('2026-08-13T04:00Z'));
  assert.ok(afterClose.length >= 20, 'asked every remaining tick');
  assert.ok(afterClose.every((e) => e.verdict === 'no' && new RegExp(`#${forced.number} already ran since the daily anchor`).test(e.reason)));
  // Thursday's anchor is not eaten by Wednesday's close.
  assert.ok(next && next.createdAt === T('2026-08-13T04:17Z') && next.outcome === 'done');
  assert.equal(rest.length, 0, 'two days, two runs — never a double execution');
});

// ---- S28 — the mechanism (or a task) changes mid-flight: nothing durable
// carries a schedule (a declined task holds no item, and the scheduler
// remembers nothing — §15.33), so a declaration change applies at the very
// next tick with no migration and no relabeling.
test('S28 declaration change mid-flight: the next tick follows HEAD', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  // Mid-day, an update lands: tidy-prs moves from the weekly cadence to the daily one, and its
  // precondition is replaced outright.
  sim.at('2026-08-12T12:00Z', (s) => s.updateTask('tidy/tidy-prs', {
    preconditions: ['due:daily'],
    precondition: (w, _now, _item, window) => ({
      run: w.newSignalAt != null && w.newSignalAt >= window.since,
      reason: 'new precondition, no work',
    }),
  }));
  sim.at('2026-08-14T01:00Z', ({ world }) => { world.newSignalAt = T('2026-08-14T01:00Z'); });
  sim.run('2026-08-12T00:00Z', '2026-08-15T12:00Z');

  const a = asks(sim, 'tidy/tidy-prs');
  // Under the weekly cadence every Wednesday-morning tick declined on Sunday's run.
  assert.ok(a.filter((e) => e.t < T('2026-08-12T12:00Z')).every((e) => /weekly anchor/.test(e.reason)));
  // The very next tick reads the new cadence — daily, so Wednesday's occurrence
  // is open — and judges it by the NEW precondition.
  const first = a.find((e) => e.t >= T('2026-08-12T12:00Z'));
  assert.equal(first.t, T('2026-08-12T12:17Z'), 'the first ask after the update is immediate');
  assert.equal(first.verdict, 'no');
  assert.equal(first.reason, 'new precondition, no work', 'judged by the new precondition');
  // Day 3, work present at 01:00: the 01:17 tick runs it — the next TICK, not the
  // next anchor, because the scheduler carries nothing forward from its declines.
  const g = goes(sim, 'tidy/tidy-prs');
  assert.equal(g.length, 1);
  assert.equal(g[0].t, T('2026-08-14T01:17Z'));
  assert.equal(closedOf(sim, 'tidy/tidy-prs').length, 1, 'and ran under the new declaration');
  // Friday's own anchor asks again under the daily cadence — the 01:17 run was
  // Thursday's period — and the window, since that run, holds nothing new.
  const anchor = a.find((e) => e.t === T('2026-08-14T04:17Z'));
  assert.equal(anchor.verdict, 'no');
  assert.equal(anchor.reason, 'new precondition, no work');
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
  assert.ok(asks(sim, 'basics/baselining').every((e) => e.verdict === 'no'), 'and the relic is not a run of it');
});

// ---- S30 — a stale issue list let a duplicate standing item through (F16):
// nothing documents REST-list read-your-writes across runs, so the design
// self-heals instead of assuming — the next scheduler run closes every LIVE standing
// item but the oldest.
test('S30 duplicate standing item: the next scheduler run self-heals (F16)', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  // The one open unqualified item a stale list lets through is now simply the
  // minted standing item (§8) — F16's fault needs TWO open ones, so inject two.
  // Work appears AFTER the 04:17 tick declined, so nothing else runs today: the
  // survivor's own precondition passes at pick and the only thing that could
  // decline it is its run history.
  let first; let dup;
  sim.at('2026-08-12T04:29Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:29Z'); });
  sim.at('2026-08-12T04:30Z', (s) => { first = s.injectDuplicateStanding('tidy/tidy-issues'); });
  sim.at('2026-08-12T04:31Z', (s) => { dup = s.injectDuplicateStanding('tidy/tidy-issues'); });
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  assert.equal(dup.state, 'closed');
  assert.equal(dup.outcome, 'rejected');
  assert.ok(sim.log.some((e) => e.kind === 'dedupe' && e.issue === dup.number));
  // The dedupe is the scheduler's own close: it adds the terminal label and the
  // status the twin waited in stays on — the shape the run history reads as
  // "never picked".
  assert.ok(dup.labels.has(READY) && dup.labels.has('task:status:rejected'), 'the deduped twin wears both');
  // F32 (found by this port, fixed): the survivor is judged at pick over its run
  // history, and the deduped twin — closed since the anchor but never picked —
  // is NOT a run there, so the survivor is the period's one run and runs.
  assert.equal(first.state, 'closed');
  assert.equal(first.outcome, 'done');
  assert.ok(!sim.log.some((e) => e.kind === 'decline-close' && e.issue === first.number), 'the survivor never declined');
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
    id: 'x/slow', preconditions: ['due:daily'], outcome: 'done', codeWorkMinutes: 130, // > 1h leash
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
    id: 'x/slow', preconditions: ['due:daily'], outcome: 'done', codeWorkMinutes: 130, // > 1h leash — legal now
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
    id: 'x/slow', preconditions: ['due:daily'], outcome: 'done', codeWorkMinutes: 130,
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
// The twins are two hand-created items of a task off the schedule: the race is a
// claim-protocol question, and it needs twins that both PASS at pick — under
// the stateless model a scheduled task's picked twin is this period's run to
// its sibling (S15), which declines the instant it is picked and closes before
// the second executor's re-verify has anything to see.
test('S32 twin-title race: post-claim re-verify serializes, later claim reverts', () => {
  // scoped cast: the scenario is about one title's twins racing
  const tasks = cast().filter((t) => t.id === 'sheepdog/fleet-baseline');
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:16:20Z', (s) => {
    s.createItem('sheepdog/fleet-baseline', { urgent: true, eventLost: true });
    s.createItem('sheepdog/fleet-baseline', { urgent: true, eventLost: true }); // the twin
  });
  sim.raceExecutorsAt('2026-08-12T04:16:35Z', ['E1', 'E2'], { spread: true }); // before the 04:17 drain
  sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  const reverts = sim.log.filter((e) => e.kind === 'claim-reverted');
  assert.equal(reverts.length, 1, 'exactly one of the two simultaneous claims reverted');
  // no instant ever had two same-title items in execution
  const twinEvals = sim.log.filter((e) => e.kind === 'evaluate' && e.task === 'sheepdog/fleet-baseline');
  const times = twinEvals.map((e) => e.t);
  assert.equal(new Set(times).size, times.length, 'the twins were never evaluated at the same instant');
  // and BOTH still converged — the reverted one was re-claimed in a fresh
  // episode (F18: dead claims from the reverted tenure must not outrank the
  // next live claimant) and simply waited its turn
  for (const it of sim.issues.filter((i) => !i.seeded)) {
    assert.equal(it.state, 'closed', `#${it.number} converged`);
    assert.equal(it.outcome, 'done', `#${it.number} ran — an empty expression holds at pick`);
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

  const parked = sim.issues.find((i) => isParked(i));
  assert.ok(parked, 'the work step failed, so the item parked for a human');

  // The sanctioned re-queue (F7) and nothing else: strip needs-human, apply
  // task:status:waiting-for-executor. No marker, no cleanup — the strike already happened.
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

  const parked = sim.issues.find((i) => i.taskId === 'sheepdog/fleet-seeds' && isParked(i));
  assert.ok(parked, 'the failing run parked');
  assert.ok(parked.labels.has('task:status:needs-human-action'), "the worker's verdict, not the default");
  assert.equal(parked.labels.has('task:status:needs-human-failure'), false, 'and only one sub-label');
  assert.ok(sim.log.some((e) => e.kind === 'work-failed' && e.triage === 'action'));
});

// A worker that says nothing is the compatibility case — every worker written
// before the marker existed, in every run. An unexplained break is a break —
// and whether it holds the task's lane is the task's own declaration.
test('S41b a worker that says nothing parks at failure; the lane is held only where the task says so', () => {
  const holding = makeSim({ tasks: [{ ...SEEDS, codeWorkTriage: undefined, preconditions: ['due:daily', 'last-run-not-failed'] }] });
  holding.at('2026-08-12T00:00Z', ({ world }) => { world.patScopeMissing = true; });
  holding.run('2026-08-12T00:00Z', '2026-08-14T12:00Z');

  const fam = holding.family('sheepdog/fleet-seeds');
  const parked = fam.find((i) => isParked(i));
  assert.ok(parked.labels.has('task:status:needs-human-failure'));
  assert.equal(fam.length, 1,
    'the lane is held — two days of anchors passed and nothing was filed behind it');

  // Without the term the same failure parks the same way, and every anchor
  // files the next occurrence beside it: the engine holds no lane by itself.
  const open = makeSim({ tasks: [{ ...SEEDS, codeWorkTriage: undefined }] });
  open.at('2026-08-12T00:00Z', ({ world }) => { world.patScopeMissing = true; });
  open.run('2026-08-12T00:00Z', '2026-08-14T12:00Z');
  assert.ok(open.family('sheepdog/fleet-seeds').length >= 3, 'one park per anchor, none holding the next');
});

// ---- S42 — the approval park: succeeded, and waiting on a reviewer ----------
// The one park that is not a fault. It stays OPEN, because closing it would hide
// an unreviewed PR from every surface that counts open work — and it does NOT
// hold the lane, because the reviewer's silence must delay only the review.
test('S42 a run that left an unmerged PR parks open for approval and keeps its schedule', () => {
  const sim = makeSim({ tasks: [REGENERATE] });
  sim.run('2026-08-12T00:00Z', '2026-08-14T12:00Z');

  const fam = sim.family('site/regenerate');
  const parked = fam.filter((i) => i.labels.has('task:status:needs-human-approval'));
  assert.ok(parked.length >= 1, 'the delivering run parked for approval');
  assert.ok(parked.every((i) => i.state === 'open'), 'open — a waiting reviewer is not a closed item');
  // Two anchors passed and each filed its own item, around the ones still parked.
  assert.ok(fam.length >= 2, 'the schedule went on around the unreviewed PR');
  assert.ok(sim.log.filter((e) => e.kind === 'delivered-open-pr').length >= 2);

  // Even a task that does not run past its own FAILURE runs past its own
  // review: `last-run-not-failed` reads the failure park and no other kind.
  const strict = makeSim({ tasks: [{ ...REGENERATE, preconditions: ['due:daily', 'last-run-not-failed'] }] });
  strict.run('2026-08-12T00:00Z', '2026-08-14T12:00Z');
  assert.ok(strict.family('site/regenerate').length >= 2, 'an approval park is not a failure — the lane is open');
  assert.ok(asks(strict, 'site/regenerate').every((e) => !/failure park/.test(e.reason)));
});

// ---- S43 — the road back clears BOTH labels --------------------------------
// A re-queue that stripped only the state would leave a live item still wearing
// a triage sub-label: a shape no rule defines, and one the janitor's stateless
// repair would not catch either, since the item does wear `task:status:waiting-for-executor`.
test('S43 the human re-queue leaves no triage label behind', () => {
  const sim = makeSim({ tasks: [SEEDS] });
  sim.at('2026-08-12T00:00Z', ({ world }) => { world.patScopeMissing = true; });
  // A new task is asked at its first tick (S78), so the first park lands at
  // 00:20 — re-queue after that, or this asserts over an item that never failed.
  // Asserted AT the re-queue, not at the end of the run: the invariant is about
  // the item's state the moment the lever is pulled, and by the end the re-queued
  // item has run and closed, taking every label with it.
  let after = null;
  sim.at('2026-08-12T02:00Z', (s) => {
    s.world.patScopeMissing = false; // the scope was granted
    const parked = s.issues.find((i) => isParked(i));
    assert.ok(parked, 'precondition of this scenario: something is parked to re-queue');
    s.requeue(parked.number);
    after = [...parked.labels];
  });
  sim.run('2026-08-12T00:00Z', '2026-08-12T18:00Z');

  assert.ok(after, 'the re-queue ran');
  assert.deepEqual(after.filter((l) => l.startsWith('task:status:needs-human-')), [],
    'no sub-label survived the re-queue');
  assert.equal(after.some((l) => l.startsWith(NH(''))), false);
  assert.ok(after.includes('task:status:waiting-for-executor'), 'and it went back into the queue');
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
const parked = (it, kind) => isParked(it) && it.labels.has(`task:status:needs-human-${kind}`);

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
  // ONE issue: the marked issue IS the item — same number, shared labels —
  // wearing the ad-hoc origin that keeps it out of every scheduled family.
  assert.equal(items[0].number, req.number);
  assert.ok(items[0].labels === req.labels, 'the item labels ARE the issue labels');
  // The run succeeded and left a PR, so it parks for approval rather than
  // closing — and that park is not a fault, so it holds nobody's lane.
  assert.ok(parked(items[0], 'approval'));
  assert.equal(items[0].state, 'open');
  // …and the issue says what is true of it — the approval park IS the
  // in-review state, on the same labels, beside the lifelong mark.
  assert.deepEqual([...req.labels].sort(), [ORIGIN_AD_HOC, NH('approval')].sort());
  assert.equal(sim.log.filter((e) => e.kind === 'handoff' && e.task === REQ).length, 1);
  // The request task's one condition reads the item it is about, so it is off
  // the schedule: the tick never asked it, and its item exists only because
  // somebody marked the issue.
  assert.equal(asks(sim, REQ).length, 0);
});

test('S45 an unauthorized mark is refused once, disarmed, and never re-adopted', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let req;
  sim.at('2026-08-18T09:03Z', (s) => { req = s.markIssue({ author: 'passer-by' }); });
  sim.run('2026-08-18T09:00Z', '2026-08-19T09:00Z');

  const items = sim.requestItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].outcome, 'rejected');         // declined: no anchor to roll to
  assert.equal(sim.log.filter((e) => e.kind === 'handoff' && e.task === REQ).length, 0);
  // A refusal is not a park: nothing here is anybody's inbox. The terminal
  // status stands on the STILL-OPEN issue — the run's verdict is not the
  // issue's validity — and that standing status is the disarm: a day of
  // further scheduler runs adopts nothing. Without it this is an hourly
  // refusal loop on somebody else's issue.
  assert.equal(isParked(items[0]), false);
  assert.equal(req.state, 'open');
  assert.equal(sim.log.filter((e) => e.kind === 'request-declined').length, 1);
  assert.deepEqual([...req.labels].sort(), [ORIGIN_AD_HOC, 'task:status:rejected'].sort());
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
  assert.equal(not.requestItems()[0].outcome, 'rejected');

  // Permission, not association, decides (F30): a read-only collaborator would
  // ride the payload as COLLABORATOR, but the permission read says no push —
  // their own issue is refused just like a stranger's.
  const readOnly = makeSim({ tasks: cast(), collaborators: { owner: 'admin', reader: 'read' } })
    .seedSteadyState('2026-08-18T00:00Z');
  readOnly.at('2026-08-18T09:03Z', (s) => s.markIssue({ author: 'reader' }));
  readOnly.run('2026-08-18T09:00Z', '2026-08-19T09:00Z');
  assert.equal(readOnly.requestItems()[0].outcome, 'rejected');
});

test('S47 the body model routes the run; an unknown family falls back to the default', () => {
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
  // The model is a BODY parameter now, gated on the author's push access and
  // re-read at every adoption — nothing stale to consume, and the lifelong
  // mark stays on both issues.
  assert.ok(sim.requests.every((r) => r.labels.has(ORIGIN_AD_HOC)));
});

test('S48 a request withdrawn after adoption never reaches an agent', () => {
  const withdrawn = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let req;
  withdrawn.at('2026-08-18T09:03Z', (s) => { req = s.markIssue({ author: 'owner' }); });
  // …between the scheduler run that adopted it and the executor picking it up.
  withdrawn.at('2026-08-18T09:17:20Z', (s) => s.withdrawRequest(req.number));
  withdrawn.run('2026-08-18T09:00Z', '2026-08-18T18:00Z');
  assert.equal(withdrawn.requestItems()[0].outcome, 'rejected');
  assert.equal(withdrawn.log.filter((e) => e.kind === 'handoff' && e.task === REQ).length, 0);

  // Closing the issue is the same answer with no run at all: one issue means
  // closing it closes the item, so there is nothing left to pick or decline.
  const closed = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let req2;
  closed.at('2026-08-18T09:03Z', (s) => { req2 = s.markIssue({ author: 'owner' }); });
  closed.at('2026-08-18T09:17:20Z', (s) => s.closeRequestIssue(req2.number));
  closed.run('2026-08-18T09:00Z', '2026-08-18T18:00Z');
  assert.equal(closed.requestItems()[0].state, 'closed');
  assert.equal(closed.log.filter((e) => e.kind === 'handoff' && e.task === REQ).length, 0);
});

test('S49 a failed request parks as a fault; clearing the status re-runs the same record', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let req;
  sim.at('2026-08-18T09:03Z', (s) => {
    s.updateTask(REQ, { agentFails: () => true });
    req = s.markIssue({ author: 'owner' });
  });
  sim.run('2026-08-18T09:00Z', '2026-08-18T11:00Z');

  // A broken run is a `failure` — someone reads the trace — and the standing
  // park status is what stops the next scheduler run re-adopting: nothing
  // mechanical re-arms work that writes code.
  assert.ok(parked(sim.requestItems()[0], 'failure'));
  assert.equal(adopts(sim).length, 1);

  // The human fixes the cause and clears the status — the phone-sized retry,
  // and the ONE lever (the old model's re-mark and re-queue collapse into it).
  // The same record re-enters the queue; there is no predecessor to supersede
  // because there is only one issue to begin with.
  sim.at('2026-08-18T12:00Z', (s) => {
    s.updateTask(REQ, { agentFails: () => false });
    s.remarkIssue(req.number, { model: 'haiku' });
  });
  sim.run('2026-08-18T11:00Z', '2026-08-19T09:00Z');

  assert.equal(sim.requestItems().length, 1, 'one issue, one record — re-asked, not re-filed');
  const item = sim.requestItems()[0];
  assert.equal(adopts(sim).length, 2);
  assert.ok(adopts(sim)[1].readopt);
  // The new ask's model is re-gated from the body as it stands now — nothing
  // stale outranks haiku (F29's guarantee, with no label to consume).
  assert.equal(item.model, 'haiku');
  assert.ok(parked(item, 'approval'));
  assert.deepEqual([...req.labels].sort(), [ORIGIN_AD_HOC, NH('approval')].sort());
});

test('S50 a request issue that is GONE declines; one that cannot be READ fails the run', () => {
  // Definitively gone — the API answers that the issue does not exist. One
  // issue means the item went with it: nothing to pick, nothing to decline,
  // and no write-back to strand.
  const gone = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let g;
  gone.at('2026-08-18T09:03Z', (s) => { g = s.markIssue({}); });
  gone.at('2026-08-18T09:17:20Z', (s) => s.deleteRequestIssue(g.number));
  gone.run('2026-08-18T09:00Z', '2026-08-18T18:00Z');
  assert.notEqual(gone.requestItems()[0].state, 'open');
  assert.equal(gone.log.filter((e) => e.kind === 'handoff' && e.task === REQ).length, 0);

  // Transiently unreadable — a rate limit, a 500 — is NOT a verdict (F27):
  // declining would eat the request permanently over nothing. It is a run
  // failure: the item parks in the failure lane, open and visible, and the
  // one re-ask lever retries once the API recovers.
  const flaky = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let f;
  flaky.at('2026-08-18T09:03Z', (s) => { f = s.markIssue({}); });
  flaky.at('2026-08-18T09:17:20Z', (s) => s.setRequestUnreadable(f.number, true));
  flaky.run('2026-08-18T09:00Z', '2026-08-18T11:00Z');

  const item = flaky.requestItems()[0];
  assert.ok(flaky.log.some((e) => e.kind === 'evaluate-failed' && e.issue === item.number));
  assert.ok(parked(item, 'failure'));
  assert.equal(flaky.log.filter((e) => e.kind === 'request-declined').length, 0);
  assert.ok(f.labels.has(ORIGIN_AD_HOC), 'the mark stands — still armed');

  // The API recovers; the human re-queues the parked item; the run completes.
  flaky.at('2026-08-18T12:00Z', (s) => {
    s.setRequestUnreadable(f.number, false);
    s.requeue(item.number);
  });
  flaky.run('2026-08-18T11:00Z', '2026-08-19T09:00Z');
  assert.ok(parked(item, 'approval'));
  assert.deepEqual([...f.labels].sort(), [ORIGIN_AD_HOC, NH('approval')].sort());
  assert.equal(adopts(flaky).length, 1, 'the retry rode the SAME item — nothing re-adopted');
});

test('S51 an impatient re-ask mid-run changes nothing; after the park it re-runs the record', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let req;
  sim.at('2026-08-18T09:03Z', (s) => {
    s.updateTask(REQ, { agentMinutes: 150 });    // a long run: live across two scheduler runs
    req = s.markIssue({});
  });
  // An impatient re-ask in mid-run must not put a second session onto the same
  // issue — and under one issue it structurally CANNOT: the mark already
  // stands, the status says a run owns it, and there is nothing to apply. The
  // re-ask lever bites only once the run has settled into a park.
  sim.at('2026-08-18T09:30Z', (s) => s.remarkIssue(req.number));
  sim.run('2026-08-18T09:00Z', '2026-08-19T09:00Z');

  assert.equal(sim.log.filter((e) => e.kind === 'mark' && e.refused === 'live').length, 1,
    'the mid-run re-ask was a no-op');
  assert.equal(adopts(sim).length, 1, 'one adoption, one session — nothing raced the live run');
  assert.equal(sim.log.filter((e) => e.kind === 'handoff' && e.task === REQ).length, 1);
  const item = sim.requestItems()[0];
  assert.ok(parked(item, 'approval'));

  // Now the run has settled: the same lever re-runs the same record.
  sim.at('2026-08-19T10:00Z', (s) => s.remarkIssue(req.number));
  sim.run('2026-08-19T09:00Z', '2026-08-19T15:00Z');
  assert.equal(adopts(sim).length, 2);
  assert.ok(adopts(sim)[1].readopt);
});

// ---- L. No work, no item — the stateless ask (owner, 2026-08-20, #1115;
// stateless since #1725, DESIGN §15.33) -------------------------------------
// The scheduler run asks every task at every tick and files a work item only
// on a yes. There is no board and no watermark: a no is a log line, the next
// tick asks again, and the cadence a task keeps is one of its own conditions,
// read off its run history. The executor still re-evaluates at pick — nothing
// is carried forward from the tick's answer.
//
// RETIRED with the board (§15.33): S52 (the board created lazily by a decline),
// S53 (the watermark between anchors — S74 is its replacement), S54/S54b (a
// deleted or corrupt board), S56 (the sleeping-item migration), S58 (write only
// the rows that changed) and the board-closing S61. Their intent, where it
// survives, lives in S1' (a decline files nothing), S74 and S75.

// ---- S55 — fail-open: signal collection fails for ONE task (the scheduler
// stub holds no fleet credential); its item is created and the executor —
// which holds the credentials — decides at pick. The other tasks are untouched.
// Never fewer runs because a read failed — and never MORE asks than the
// cadence allows: the run-history terms are judged first, off the queue the
// run already holds, so a tick the cadence declines needs no signal at all.
test('S55 signals unavailable for one task: fail-open item, executor decides; the cadence still gates', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.setSignalsUnavailable('basics/baselining');
  // day 2 the executor-side read finds real work
  sim.at('2026-08-13T00:01Z', ({ world }) => { world.mountBehind = true; });
  sim.run('2026-08-12T00:00Z', '2026-08-14T00:00Z');

  const fam = sim.family('basics/baselining').filter((i) => !i.seeded);
  assert.equal(fam.length, 2, 'an item per occurrence — fail-open never files fewer');
  const a = asks(sim, 'basics/baselining');
  assert.deepEqual(a.filter((e) => e.verdict === 'fail-open').map((e) => e.t),
    [T('2026-08-12T04:17Z'), T('2026-08-13T04:17Z')],
    'failed open exactly where the cadence held — every other tick declined on the run history alone');
  assert.ok(a.filter((e) => e.verdict !== 'fail-open').every((e) => e.verdict === 'no'));
  // day 1: the executor's own evaluation declined, and the item closed
  assert.equal(fam[0].outcome, 'rejected');
  assert.ok(sim.log.some((e) => e.kind === 'decline-close' && e.issue === fam[0].number));
  // day 2: the executor's evaluation found the work and ran it
  assert.equal(fam[1].outcome, 'done');
  // the other tasks still decided at every tick and filed nothing
  assert.equal(sim.family('tidy/tidy-issues').filter((i) => !i.seeded).length, 0);
});

// ---- S57 — a hand-created item racing the tick. An open unqualified item
// IS the standing item (§3) and it is LIVE, so the tick does not ask — the
// scheduler neither files a second item beside it nor dedupes it.
test('S57 a hand-minted item preempts the tick\'s ask; no duplicate, no dedupe', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:10Z', (s) => s.createItem('tidy/tidy-issues', { eventLost: true }));
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  assert.equal(asks(sim, 'tidy/tidy-issues').filter((e) => e.t === T('2026-08-12T04:17Z')).length, 0,
    'the open minted item held the lane — the 04:17 tick never asked');
  const fam = sim.family('tidy/tidy-issues').filter((i) => !i.seeded);
  assert.equal(fam.length, 1, 'no second item was ever filed beside it');
  assert.equal(fam[0].outcome, 'rejected', 'the executor evaluated the minted item and declined');
  assert.equal(sim.log.filter((e) => e.kind === 'dedupe').length, 0);
  // Once it closed, the later ticks ask again — and the closed item is this
  // period's run, so they decline on the cadence.
  const later = asks(sim, 'tidy/tidy-issues').filter((e) => e.t > fam[0].closedAt);
  assert.ok(later.length === 3 && later.every((e) => /already ran since the daily anchor/.test(e.reason)));
});

// ---- S59 — the verdict flips between the tick's yes and the pick: the
// executor re-evaluates and closes. The tick's answer is never carried
// forward, and the closed item — rejected or not — is this period's run.
test('S59 a go at the tick, a no at pick: the executor\'s verdict wins, once', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  // the world changes in the seconds between the scheduler run and its drain
  sim.at('2026-08-12T04:17:20Z', ({ world }) => { world.issueTouchedAt = null; });
  sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  assert.equal(goes(sim, 'tidy/tidy-issues').length, 1, 'the tick said go and filed the item');
  const it = sim.family('tidy/tidy-issues').find((i) => !i.seeded);
  assert.equal(it.outcome, 'rejected', 'the pick re-derived the world and declined');
  assert.ok(sim.log.some((e) => e.kind === 'decline-close' && e.issue === it.number));
  assert.equal(evals(sim, 'tidy/tidy-issues').length, 1, 'one pick-time evaluation');
  // and the rest of the day re-runs nothing: every later tick asks, and the
  // closed item covers the occurrence — a rejected run is still a run for `due:`
  const later = asks(sim, 'tidy/tidy-issues').filter((e) => e.t > it.closedAt && e.t < T('2026-08-13T00:00Z'));
  assert.ok(later.length >= 7 && later.every((e) => e.verdict === 'no'));
  assert.equal(sim.family('tidy/tidy-issues').filter((i) => !i.seeded).length, 1);

  // …but a rejected item did nothing, so it does NOT move the window: the
  // touch it (transiently) could not see is still inside tomorrow's window,
  // which reaches back to the last run that actually ran — Tuesday's.
  sim.at('2026-08-12T05:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.run('2026-08-12T12:00Z', '2026-08-13T12:00Z');
  const [tomorrow] = goes(sim, 'tidy/tidy-issues').filter((e) => e.t >= T('2026-08-13T04:00Z'));
  assert.equal(tomorrow?.t, T('2026-08-13T04:17Z'), 'found at the next anchor, over a window the rejected item did not shorten');
  assert.equal(closedOf(sim, 'tidy/tidy-issues').filter((i) => i.outcome === 'done').length, 1);
});

// ---- S60 — F31, restated without the board: a go whose item CREATE fails
// (a refused POST) leaves nothing behind — and because nothing durable records
// the go, the next tick simply asks again and creates. A refused write costs
// one tick of latency, never the occurrence: the inversion of fail-open cannot
// happen when there is no row to honour.
test('S60 a refused create costs one tick, never the occurrence (F31)', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.at('2026-08-12T04:01Z', (s) => s.failNextCreateOf('tidy/tidy-issues'));
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  assert.ok(sim.log.some((e) => e.kind === 'create-failed'), 'the 04:17 POST was refused');
  const g = goes(sim, 'tidy/tidy-issues');
  assert.deepEqual(g.map((e) => e.t), [T('2026-08-12T04:17Z'), T('2026-08-12T05:17Z')],
    'the go was re-asked at the very next tick, and not again once the item existed');
  const [done] = closedOf(sim, 'tidy/tidy-issues');
  assert.ok(done && done.createdAt === T('2026-08-12T05:17Z') && done.outcome === 'done',
    'the work ran one tick late — never fewer runs because a write failed');
});

// ---- M. The label vocabulary (owner, 2026-08-20, #1119): the sim writes the
// canonical `task:status:`/`task:origin:` spellings and decodes every spelling
// a fielded engine ever wrote. Two directions, both artifact-level: the labels
// the mechanism EMITS at each transition, and its REACTION to labels that
// already exist — including the old vocabulary on open items.

const labelsOf = (it) => [...it.labels].sort();

// ---- S61 — one item's whole life, read off the label artifact: the origin at
// birth, one mutually-exclusive status per phase, the terminal status AND the
// origin on the closed issue. Nothing else, at any point.
test('S61 the emitted labels: origin at birth, one status per phase, terminal + origin at close', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  const seen = [];
  const it = () => sim.family('tidy/tidy-issues').find((i) => !i.seeded);
  sim.at('2026-08-12T04:17:10Z', () => seen.push(labelsOf(it())));  // filed at the tick's ask
  sim.at('2026-08-12T04:17:50Z', () => seen.push(labelsOf(it())));  // claimed by the drain
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  assert.deepEqual(seen[0], ['task:origin:planned', 'task:status:waiting-for-executor'],
    'born ready, wearing the planned origin — the generator says what it filed');
  assert.deepEqual(seen[1], ['task:origin:planned', 'task:status:running-executor'],
    'the claim swaps the one status; the origin never moves');
  const closed = it();
  assert.equal(closed.state, 'closed');
  assert.deepEqual(labelsOf(closed), ['task:origin:planned', 'task:status:done'],
    'the terminal status goes ON at close, and the closed issue keeps its origin');
  assert.equal(closed.woken, null, 'the scheduler\'s own item carries no Woken stamp');
});

// ---- S62 — the decode direction: open items a FIELDED engine left behind,
// wearing the old vocabulary. The scheduler and executor must react to them as
// to their own — and the first transition the new engine writes comes out
// canonical, which is how the fleet converges with no mass relabel.
test('S62 legacy-labeled items drain; the first write canonicalizes; a legacy pair still routes', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  let legacy;
  sim.at('2026-08-12T05:00Z', (s) => {
    legacy = s.legacyIssue('sheepdog/fleet-baseline', ['task:ready'], { qualifier: 'o/member' });
  });
  sim.schedulerRunAt('2026-08-12T05:30Z'); // nothing watches a legacy label event; the drain finds it
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  assert.equal(legacy.state, 'closed', 'the old-vocabulary item was picked and driven to its end');
  assert.ok(!legacy.labels.has('task:ready'), 'the first transition cleared the legacy spelling');
  assert.ok(legacy.labels.has('task:status:done'), 'and every write after it is canonical');
});

// ---- S62b — the legacy park PAIR routes by its sub-label: an approval park
// from the old engine holds nobody's lane (the next occurrence still files),
// while a BARE legacy `needs-human` — kind unknown — decodes as failure, which
// holds the lane of a task declaring `last-run-not-failed`: the conservative
// direction the decode must preserve, for the one term that reads it.
test('S62b a legacy approval pair spares the lane; a bare legacy park reads as failure and holds it', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:30Z', (s) => {
    s.updateTask('gcec/create-extractor', { preconditions: ['due:daily', 'last-run-not-failed'] });
    s.legacyIssue('tidy/tidy-issues', ['needs-human', 'task:needs-human-approval']);
    s.legacyIssue('gcec/create-extractor', ['needs-human']);
    s.world.issueTouchedAt = T('2026-08-12T04:00Z');
    s.world.requestAt = T('2026-08-12T04:00Z');
  });
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  const tidy = sim.family('tidy/tidy-issues').filter((i) => !i.seeded);
  assert.equal(tidy.length, 2, 'the approval pair did not consume the lane — the 04:17 occurrence filed beside it');
  assert.ok(tidy.some((i) => i.state === 'closed' && i.labels.has('task:status:done')), 'and it ran');
  assert.ok(tidy.some((i) => i.state === 'open'), 'while the legacy park sat untouched, its PR still in review');
  assert.equal(sim.family('gcec/create-extractor').filter((i) => !i.seeded).length, 1,
    'the bare park holds the lane: no occurrence files behind it');
  assert.ok(asks(sim, 'gcec/create-extractor').filter((e) => e.t > T('2026-08-12T04:00Z'))
    .every((e) => /failure park/.test(e.reason)), 'declined by the task\'s own term, reading the decoded kind');
});

// ---- S63 — a kind this engine does not know (a future writer, a typo) reads
// as failure — the unclassifiable park must not silently join an inbox lane
// nobody treats as urgent, so a task that does not run past its own failure
// does not run past this either.
test('S63 an unknown park kind decodes as failure and holds the lane of a task that declares it', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:30Z', (s) => {
    s.updateTask('tidy/tidy-issues', { preconditions: ['due:daily', 'last-run-not-failed'] });
    s.legacyIssue('tidy/tidy-issues', ['needs-human', 'task:needs-human-shrugged']);
    s.world.issueTouchedAt = T('2026-08-12T04:00Z');
  });
  sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');
  assert.equal(sim.family('tidy/tidy-issues').filter((i) => !i.seeded).length, 1,
    'the unknown kind blocked the lane — no new occurrence behind an unread trace');
});

// ---- S64 — the request's whole life on ONE issue, read off the labels: the
// bare mark, the adopted shape, the running shape, and the approval park that
// IS the in-review state — the lifelong mark beside exactly one status.
test('S64 the request labels: bare mark, adopted, running, in review — one issue throughout', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let req; const seen = [];
  sim.at('2026-08-18T09:03Z', (s) => { req = s.markIssue({ author: 'owner' }); });
  sim.at('2026-08-18T09:10Z', () => seen.push(labelsOf(req)));      // marked, awaiting adoption
  sim.at('2026-08-18T09:17:30Z', () => seen.push(labelsOf(req)));   // adopted by the 09:17 scheduler run
  sim.at('2026-08-18T09:20Z', () => seen.push(labelsOf(req)));      // handed to the session
  sim.run('2026-08-18T09:00Z', '2026-08-18T18:00Z');

  assert.deepEqual(seen[0], ['task:origin:ad-hoc'], 'the mark alone — no status is what adoption keys on');
  assert.deepEqual(seen[1], ['task:origin:ad-hoc', 'task:status:waiting-for-executor']);
  assert.deepEqual(seen[2], ['task:origin:ad-hoc', 'task:status:running-agent']);
  assert.deepEqual(labelsOf(req), ['task:origin:ad-hoc', 'task:status:needs-human-approval'],
    'the approval park is the in-review state, beside the mark that never comes off');
});

// ---- S65 — a working day's Action invocations (#1212): Actions bills each
// job's minutes rounded UP, so the day's cost is the invocation count, not
// the minutes worked — the accounting the model must keep low. A full day of
// scheduled work (the morning chain, tidy, a release) plus ad-hoc work (a
// marked request, a hand-created item of a task off the schedule) converges on the
// hourly cron's 24 scheduler runs plus FOUR executor runs: one drain per
// hour that had work — each settling its whole hour in one invocation — the
// close-drain that chains the tail of the morning, and one label event. Every
// quiet hour skips its drain and costs the cron's one run alone. Under the
// stateless ask (§15.33) the quiet hours are still ASKED — 24 asks per task —
// and cost nothing beyond that run: a decline files nothing.
test('S65 a working day: 7 pieces of work cost 28 invocations, and each is accounted', () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => {
    world.mountBehind = true;                      // baselining has work
    world.extractHasLessons = true;                // growth-extract has work
    world.promoteHasCandidates = true;             // growth-promote has work
  });
  sim.at('2026-08-12T04:00Z', ({ world }) => {
    world.issueTouchedAt = T('2026-08-12T04:00Z'); // tidy-issues has work
    world.releasePending = true;                   // store-release has work
  });
  sim.at('2026-08-12T09:40Z', (s) => s.markIssue({ author: 'owner' }));          // ad-hoc request
  sim.at('2026-08-12T14:03Z', (s) => s.createItem('sheepdog/fleet-baseline'));   // ad-hoc item of a task off the schedule
  sim.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  // the whole day's work converged…
  for (const id of ['basics/baselining', 'grow/growth-extract', 'grow/growth-promote',
    'tidy/tidy-issues', 'chrome/store-release', 'sheepdog/fleet-baseline']) {
    const [done] = closedOf(sim, id);
    assert.ok(done && done.outcome === 'done', `${id} converged`);
  }
  const [reqItem] = sim.requestItems();
  assert.equal(statusOf(reqItem), NH('approval'), 'the request delivered its PR and parks for review');

  // …for exactly this invocation bill: the cron's 24 scheduler runs, the
  // drains of the two hours that had work, the close-drain behind the chain,
  // and the hand-created item's one label event. Nothing else ever started a runner.
  const acct = sim.actionExecutions();
  assert.equal(acct.scheduler, 24, 'the hourly cron is the floor');
  // Two drains, not four: the morning chain's three tasks all anchor at 04:00, so one drain
  // takes what it can and the close that releases the next one chains a close-drain rather than
  // waiting for a fresh hour's tick (DESIGN §17.1, §17.3).
  assert.deepEqual(acct.executorByTrigger,
    { 'scheduler-run-drain': 2, 'close-drain': 1, 'label-event': 1 });
  assert.equal(acct.total, 28, 'the whole day, accounted');
  // The 04:00 tick's drain settles FOUR — baselining, tidy, store, and extract, which baselining's
  // own close released back into the run it was already in. That is the batch and the chain in
  // one invocation; only promote, released by extract's close after the drain had run dry, needs
  // the close-drain behind it.
  assert.ok(sim.log.filter((e) => e.kind === 'run-end').some((e) => e.settled === 4),
    'the busiest tick settled four items in one run');
  // and the hours with nothing pickable dispatched no executor at all
  assert.equal(sim.log.filter((e) => e.kind === 'drain-skipped').length, 22);
  // the ticks before the anchor asked and declined on the cadence: yesterday's
  // run was still this period's; the ticks after the morning's runs, the same
  assert.equal(asks(sim, 'chrome/store-release').length, 24, 'every tick — its three-minute run never spanned one');
  assert.equal(goes(sim, 'chrome/store-release').length, 1);
});

// ---- S66 — the quiet day's floor (#1212): no signals, no items — the cron's
// 24 scheduler runs are the day's entire invocation bill, because a scheduler
// run that leaves nothing pickable dispatches no drain.
test('S66 a quiet day costs the cron floor alone: 24 invocations, zero executor runs', () => {
  const sim = makeSim({ tasks: cast() })
    .seedSteadyState('2026-08-12T00:00Z')
    .run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  const acct = sim.actionExecutions();
  assert.equal(acct.scheduler, 24);
  assert.equal(acct.executor, 0, 'no executor ever started');
  assert.equal(acct.total, 24);
  assert.equal(sim.log.filter((e) => e.kind === 'drain-skipped').length, 24);
  assert.equal(sim.log.filter((e) => e.kind === 'executor-run').length, 0);
});

// ---- S67-S70 — the cron's CADENCE (DESIGN §17). Actions bills each job's
// minutes rounded up, so a day's cost is the RUN COUNT and an idle hourly tick
// costs a full billed minute to find nothing. These four ask what a twice-daily
// cron — the 04:xx anchor tick plus a 16:xx tick — actually trades away.

// ---- S67 — a full day's scheduled work: the same completions on a twelfth of
// the runs. The `schedule_after:` chain is what makes this safe — one drain settles the
// whole chain back to back, so collapsing three anchor hours into one tick
// costs ordering nothing.
test('S67 twice-daily cron: a full day of work completes on 4 billed runs, not 26', () => {
  const arm = (s) => s.at('2026-08-12T00:05Z', ({ world }) => {
    world.mountBehind = true;
    world.extractHasLessons = true;
    world.promoteHasCandidates = true;
    world.issueTouchedAt = T('2026-08-12T00:05Z');
    world.releasePending = true;
  });
  const day = (opts) => {
    const s = makeSim({ tasks: cast(), ...opts }).seedSteadyState('2026-08-12T00:00Z');
    arm(s);
    return s.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');
  };
  const DAILY = ['basics/baselining', 'grow/growth-extract', 'grow/growth-promote',
    'tidy/tidy-issues', 'chrome/store-release'];

  const hourly = day({});
  const twice = day({ cronHours: [4, 16] });

  // Every task that ran under the hourly grid still runs, and still closes done.
  for (const task of DAILY) {
    assert.equal(closedOf(hourly, task).length, 1, `${task} closed under hourly`);
    assert.equal(closedOf(twice, task).length, 1, `${task} closed under twice-daily`);
    assert.equal(closedOf(twice, task)[0].outcome, 'done', `${task} closed done`);
  }

  // The cost. 24 scheduler runs become 2 — the whole saving, and the reason
  // this design exists. The executor count is work, not cadence: it falls only
  // because one drain now settles what three separate ticks used to start.
  assert.equal(hourly.actionExecutions().scheduler, 24);
  assert.equal(twice.actionExecutions().scheduler, 2);
  assert.equal(hourly.actionExecutions().total, 26);
  assert.equal(twice.actionExecutions().total, 4);

  // ORDERING SURVIVES THE COLLAPSE. All three chained tasks are instantiated by
  // the SAME 04:17 tick — their staggered anchor hours no longer separate them —
  // and `schedule_after:` alone still settles them in declaration order. This is why the
  // daily-Nh offsets can retire: they were never what enforced this.
  const closeAt = (s, task) => closedOf(s, task)[0].closedAt;
  assert.ok(closeAt(twice, 'basics/baselining') < closeAt(twice, 'grow/growth-extract'));
  assert.ok(closeAt(twice, 'grow/growth-extract') < closeAt(twice, 'grow/growth-promote'));
  for (const task of ['basics/baselining', 'grow/growth-extract', 'grow/growth-promote']) {
    assert.equal(new Date(closedOf(twice, task)[0].createdAt).toISOString().slice(11, 16), '04:17');
  }

  // WHAT IT COSTS SCHEDULED WORK: nothing. The hourly grid's ticks before 04:00
  // ask and decline on `due:daily` — yesterday's run is still this period's —
  // so both cadences start the same chain at the same 04:17 tick and finish the
  // day at the same instant; the 22 extra runs an hourly cron bills were buying
  // latency for ad-hoc work (S68) and nothing at all for the schedule. The bound
  // is kept rather than asserting a bare 0, so a future task whose anchor moves
  // shows up as a slip instead of a crash.
  const lastClose = (s) => Math.max(...DAILY.map((t) => closeAt(s, t)));
  const slip = (lastClose(twice) - lastClose(hourly)) / 60_000;
  assert.equal(slip, 0, 'the collapsed vocabulary leaves scheduled work no later than hourly did');
  assert.ok(slip <= 60, `the day's work slips ${slip} min, within the hour`);
  assert.ok(asks(hourly, 'tidy/tidy-issues').filter((e) => e.t < T('2026-08-12T04:00Z'))
    .every((e) => e.verdict === 'no'), 'the pre-anchor ticks asked and declined on the cadence');
});

// ---- S68 — the ad-hoc mark is what the second tick is FOR. A mark is adopted
// by a scheduler run and nothing else, so its latency is exactly the wait for
// the next tick — which is what picks the cadence.
test('S68 ad-hoc latency is the wait for the next tick: 0.2h hourly, 7.2h twice-daily, 19.2h once', () => {
  const marked = (opts) => {
    const s = makeSim({ tasks: cast(), ...opts }).seedSteadyState('2026-08-12T00:00Z');
    s.at('2026-08-12T09:03Z', (x) => x.markIssue({ author: 'owner' }));
    s.run('2026-08-12T00:00Z', '2026-08-13T12:00Z');
    const adopt = s.log.find((e) => e.kind === 'adopt');
    return { s, delayH: (adopt.t - T('2026-08-12T09:03Z')) / 3_600_000 };
  };

  const hourly = marked({});
  const twice = marked({ cronHours: [4, 16] });
  const once = marked({ cronHours: [4] });

  // Adopted exactly once in every cadence — the wait is latency, never loss.
  for (const { s } of [hourly, twice, once]) assert.equal(adopts(s).length, 1);

  // Derived from the tick grid, not transcribed from a run: the wait is exactly
  // "the first tick at or after the mark", so each expectation is computed from
  // the cadence and `schedulerRunMinute` rather than pinned to a number that
  // silently re-encodes both. The headline figures stay in the names as
  // documentation; these are what actually hold them honest.
  const firstTickAfter = (markIso, hours) => {
    const mark = T(markIso);
    for (let t = Math.floor(mark / 3_600_000) * 3_600_000; ; t += 3_600_000) {
      const at = t + SCHEDULER_RUN_MINUTE * 60_000;
      if (at >= mark && hours.includes(new Date(at).getUTCHours())) return at;
    }
  };
  const EVERY_HOUR = [...Array(24).keys()];
  const expect = (cadence, hours) =>
    (firstTickAfter('2026-08-12T09:03Z', hours) - T('2026-08-12T09:03Z')) / 3_600_000;

  assert.equal(hourly.delayH, expect('hourly', EVERY_HOUR));
  assert.equal(twice.delayH, expect('twice', [4, 16]));
  assert.equal(once.delayH, expect('once', [4]));
  // …and the derivation agrees with the figures the design quotes.
  assert.ok(Math.abs(hourly.delayH - 0.2) < 0.05, `hourly ${hourly.delayH}h`);
  assert.ok(Math.abs(twice.delayH - 7.2) < 0.05, `twice-daily ${twice.delayH}h`);
  assert.ok(Math.abs(once.delayH - 19.2) < 0.05, `once-daily ${once.delayH}h`);

  // The second tick is what keeps the worst case inside a working day: it
  // roughly halves the wait for one extra billed minute a day.
  assert.ok(twice.delayH < once.delayH / 2);
  assert.equal(twice.s.actionExecutions().scheduler - once.s.actionExecutions().scheduler, 1);
});

// ---- S69 — THE CONTINUATION DOES NOT CATCH A MARK. A drain re-reads the queue
// between items and picks up the dependents its own closes release — but a
// freshly marked issue is nobody's dependent, and adoption is the scheduler
// run's job. So a mark landing mid-drain waits for the next TICK, not for the
// drain it landed in. This is the whole case for an `issues: [labeled]` trigger.
test('S69 a mark landing mid-drain waits for the next tick — continuations chain dependents, not marks', () => {
  const slow = [{
    id: 'tidy/tidy-issues', preconditions: ['due:daily'], outcome: 'done',
    codeWorkMinutes: 90, agentMinutes: 60, precondition: () => ({ run: true }),
  }];
  const sim = makeSim({ tasks: slow, cronHours: [4, 16] }).seedSteadyState('2026-08-12T00:00Z');
  // 04:30 — the 04:17 tick's drain is in flight on a two-and-a-half-hour item.
  sim.at('2026-08-12T04:30Z', (s) => s.markIssue({ author: 'owner' }));
  sim.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  const adopt = sim.log.find((e) => e.kind === 'adopt');
  assert.ok(adopt, 'the mark is adopted eventually — this is latency, not loss');
  // Not at 04:30+, and not by the running drain: at the NEXT scheduler tick.
  assert.equal(new Date(adopt.t).toISOString().slice(11, 16), '16:17');
  assert.ok((adopt.t - T('2026-08-12T04:30Z')) / 3_600_000 > 11);

  // The contrast that makes this a mechanism and not an accident: the same
  // drain DOES chain a dependent released by its own close (S67), and the run
  // it eventually takes the mark on is an ordinary scheduler-run drain.
  assert.equal(sim.log.filter((e) => e.kind === 'executor-run' && e.trigger === 'scheduler-run-drain').length, 2);
});

// ---- S70 — THE DOOR, for a retired FIELD now (#1725). `frequency` is retired:
// a task's cadence is one of its own preconditions. A member's task file is its
// own data that no vendoring pass rewrites, so a declaration still carrying the
// field must keep working — it reads, where it LOADS, as the cadence term it
// always meant (`manual` meant no schedule and adds none), first in the
// expression, and a `none` beside it drops; nothing downstream ever sees the
// field. The retired SPELLINGS stay shut (#1234): a
// `frequency` no calendar understands is refused at the door, never given an anchor.
test('S70 the door: a retired `frequency` field reads as its cadence term at load; a retired spelling is refused', () => {
  const sim = makeSim({ tasks: [
    { id: 'x/daily', frequency: 'daily', outcome: 'done', codeWorkMinutes: 1, precondition: () => ({ run: true }) },
    { id: 'x/weekly', frequency: 'weekly', preconditions: ['none', 'last-run-not-failed'], outcome: 'done', codeWorkMinutes: 1 },
    { id: 'x/manual', frequency: 'manual', outcome: 'done', codeWorkMinutes: 1 },
    { id: 'x/stated', frequency: 'daily', preconditions: ['due:daily'], outcome: 'done', codeWorkMinutes: 1 },
  ] }).seedSteadyState('2026-08-12T00:00Z');
  sim.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  // what passed the door: the term first, the empty `none` gone, the field gone
  assert.deepEqual(sim.task('x/daily').preconditions, ['due:daily']);
  assert.deepEqual(sim.task('x/weekly').preconditions, ['due:weekly', 'last-run-not-failed']);
  assert.deepEqual(sim.task('x/manual').preconditions, [], '`manual` meant no schedule and adds no term');
  assert.deepEqual(sim.task('x/stated').preconditions, ['due:daily'], 'a term already stated is not doubled');
  for (const id of ['x/daily', 'x/weekly', 'x/manual', 'x/stated']) assert.equal(sim.task(id).frequency, undefined);
  // and the loaded declaration behaves as its term: a daily task asked at every
  // tick and run once at its anchor, a `manual` one — stating nothing — never asked
  assert.equal(goes(sim, 'x/daily').length, 1);
  assert.equal(closedOf(sim, 'x/daily').length, 1);
  assert.equal(asks(sim, 'x/manual').length, 0);
  assert.equal(sim.family('x/manual').length, 0);

  // The door passes no retired spelling: the legacy map is empty, and a token
  // the calendar has no anchor for is refused where the declaration loads.
  for (const retired of ['hourly', 'daily-2h', 'daily-1h', 'daily+1h']) {
    assert.throws(() => makeSim({ tasks: [{ id: 'x/r', frequency: retired, outcome: 'done' }] }),
      new RegExp(retired.replace('+', '\\+')), `${retired} is refused`);
  }
  // `periodMs` answers the cadence words alone — the janitor's stale-ready bound
  // and the default signal window count in it, so a token it does not know is a
  // throw rather than an hour-scale bound that parks a task on every sweep.
  assert.equal(periodMs('daily'), 24 * 3_600_000);
  assert.equal(periodMs('weekly'), 7 * periodMs('daily'));
  assert.throws(() => periodMs('hourly'), /hourly/);
});

// ---- S71 — a DROPPED tick. GitHub drops scheduled runs under load, and the
// cadence sets what that costs: an hourly grid absorbs it in an hour, two ticks
// a day absorb it in twelve, and one tick a day loses the occurrence for the
// whole day. Nothing is stranded either way — `due:daily` is decided from the
// ANCHOR and the run history, never from whether the cron fired, which is the
// invariant this pins.
test('S71 a dropped anchor tick is caught by the next one — the cost is latency, never the occurrence', () => {
  const armed = (opts) => {
    const s = makeSim({ tasks: cast(), ...opts }).seedSteadyState('2026-08-12T00:00Z');
    s.at('2026-08-12T00:05Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T00:05Z'); });
    // the 04:17 tick never fires
    s.dropSchedulerRuns('2026-08-12T04:00Z', '2026-08-12T05:00Z');
    return s.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');
  };

  const twice = armed({ cronHours: [4, 16] });
  const once = armed({ cronHours: [4] });
  const hourly = armed({});

  // Two ticks: the 16:17 tick still instantiates the day's occurrence. The task
  // is late, not lost — and the anchor it covers is still the 04:00 one.
  const t = closedOf(twice, 'tidy/tidy-issues');
  assert.equal(t.length, 1, 'the dropped tick did not cost the occurrence');
  assert.equal(new Date(t[0].createdAt).toISOString().slice(11, 16), '16:17');

  // One tick: nothing else comes, so the day is genuinely lost. This is the
  // second tick's real job, and the reason it is not optional.
  assert.equal(closedOf(once, 'tidy/tidy-issues').length, 0);

  // The hourly grid absorbs the same drop in an hour — the twelvefold latency
  // amplification the cadence trades for its cost, stated as a number.
  assert.equal(new Date(closedOf(hourly, 'tidy/tidy-issues')[0].createdAt).toISOString().slice(11, 16), '05:17');
});

// ---- S72 — a `Not-before` releasing BETWEEN ticks. Deferred work (`/do-later`,
// verify-in-production) is stamped with an instant, not an anchor, so it can fall
// anywhere in the gap. It waits for the next tick — and must not be escalated for
// waiting, since the janitor's stale bounds count in the task's own periods.
test('S72 a Not-before falling between ticks waits for the next tick, and is not escalated for it', () => {
  const sim = makeSim({ tasks: cast(), cronHours: [4, 16] }).seedSteadyState('2026-08-12T00:00Z');
  let deferred;
  // released at 09:00 — six hours after one tick, seven before the next. An
  // item of a task off the schedule: its empty expression holds at pick, so the wait is the
  // only thing the pick has to say about it.
  sim.at('2026-08-12T04:30Z', (s) => {
    deferred = s.createItem('sheepdog/fleet-baseline', { notBefore: T('2026-08-12T09:00Z'), qualifier: 'deferred' });
  });
  sim.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  // `createItem` returns the stored item, and a qualified item does not share the
  // standing family's title — so read it back through the object, not `family()`.
  const item = deferred;
  assert.equal(item.state, 'closed', 'the deferred item ran');
  assert.equal(item.outcome, 'done');
  // Readied by the 16:17 tick, not at 09:00 and not by a drain that happened to be
  // running: releasing a Not-before is the scheduler run's job, like adoption.
  assert.equal(sim.log.find((e) => e.kind === 'ready' && e.issue === item.number).t, T('2026-08-12T16:17Z'));
  assert.ok(item.closedAt >= T('2026-08-12T16:17Z'), 'it waited for the tick, not the instant');
  // Seven hours blocked is normal under this cadence and must read as normal —
  // an escalation here would park every deferred item the queue holds.
  assert.equal(item.escalated, false);
  assert.equal(sim.log.filter((e) => e.kind === 'escalate').length, 0);
});

// ---- S73 — the weekly anchor under a coarse cron, INCLUDING one whose hours do
// not contain the anchor hour at all. `due:weekly` is decided from the anchor
// and the run history, so a weekly task must fire exactly once a week whatever
// hours the cron names — never twice for being looked at twice a day, and never
// never for being looked at late.
test('S73 a weekly task fires exactly once a week, even when no tick lands on its anchor hour', () => {
  const week = (opts) => {
    const s = makeSim({ tasks: cast(), ...opts }).seedSteadyState('2026-08-09T00:00Z');
    s.at('2026-08-09T00:05Z', ({ world }) => { world.stalePrs = true; });
    // Sun 2026-08-09 through the following Sunday — two weekly anchors in range
    return s.run('2026-08-09T00:00Z', '2026-08-16T12:00Z');
  };

  const onAnchor = week({ cronHours: [4, 16] });   // a tick lands on the 04:00 anchor
  const offAnchor = week({ cronHours: [6, 18] });  // no tick does
  const hourly = week({});

  // One occurrence per week in all three — the cadence changes WHEN it is seen,
  // never how many there are. Every other tick asked and declined: on the run
  // since the anchor, since `stalePrs` stands all week.
  for (const s of [onAnchor, offAnchor, hourly]) {
    assert.equal(goes(s, 'tidy/tidy-prs').length, 2, 'two weekly anchors in the window');
    assert.equal(closedOf(s, 'tidy/tidy-prs').length, 2);
    assert.ok(asks(s, 'tidy/tidy-prs').filter((e) => e.verdict === 'no')
      .every((e) => /already ran since the weekly anchor/.test(e.reason)));
  }

  // …and each is picked up by the FIRST tick at or after its anchor, which is
  // what "the anchor decides dueness" means operationally.
  const createdHours = (s) => closedOf(s, 'tidy/tidy-prs')
    .map((i) => new Date(i.createdAt).toISOString().slice(11, 16));
  assert.deepEqual(createdHours(onAnchor), ['04:17', '04:17']);
  assert.deepEqual(createdHours(offAnchor), ['06:17', '06:17']);
});

// ---- O. The stateless scheduler (owner, 2026-09-05, #1725 — DESIGN §15.33) --
// The engine keeps no calendar and no memory of an ask: every tick asks every
// scheduled task, and a task's cadence is a term in its own preconditions, read
// off its run history. These pin the terms one at a time, from the side the
// board used to hide.

// ---- S74 — `due:daily` under the twice-daily cron: BOTH ticks ask. The 04:17
// tick finds no run since the anchor and files; the 16:17 tick finds that run
// and declines. Once a day is the term's doing, not a watermark's.
test('S74 due:daily is asked at both daily ticks; the second declines on the run since the anchor', () => {
  const tasks = [{
    id: 'x/daily', preconditions: ['due:daily'], outcome: 'done', codeWorkMinutes: 2,
    precondition: () => ({ run: true }),
  }];
  const sim = makeSim({ tasks, cronHours: [4, 16] }).seedSteadyState('2026-08-12T00:00Z');
  sim.run('2026-08-12T00:00Z', '2026-08-14T00:00Z');

  const a = asks(sim, 'x/daily');
  assert.deepEqual(a.map((e) => [e.at, e.verdict]), [
    ['2026-08-12T04:17Z', 'go'], ['2026-08-12T16:17Z', 'no'],
    ['2026-08-13T04:17Z', 'go'], ['2026-08-13T16:17Z', 'no'],
  ]);
  const [wed] = closedOf(sim, 'x/daily');
  assert.equal(a[1].reason, `#${wed.number} already ran since the daily anchor at 2026-08-12T04:00Z`);
  assert.equal(closedOf(sim, 'x/daily').length, 2, 'one run per day, two days');
});

// ---- S75 — `last-run-over:1d` keeps no anchor: it measures from the newest
// run's START, strictly more than the duration ago. A task that runs at the
// first tick of the day then drifts one tick later each day — the tick exactly
// 24h after the last start is "not over 1d", the one after it is.
test('S75 last-run-over:1d drifts one tick a day: strictly over, measured from the last start', () => {
  const tasks = [{
    id: 'x/drift', preconditions: ['last-run-over:1d'], outcome: 'done', codeWorkMinutes: 2,
    precondition: () => ({ run: true }),
  }];
  const sim = makeSim({ tasks }); // no history at all: "no run in the horizon" holds
  sim.run('2026-08-12T00:00Z', '2026-08-15T00:00Z');

  assert.equal(asks(sim, 'x/drift')[0].reason, 'no run of this task in the last 40 days');
  assert.deepEqual(closedOf(sim, 'x/drift').map((i) => i.createdAt),
    [T('2026-08-12T00:17Z'), T('2026-08-13T01:17Z'), T('2026-08-14T02:17Z')],
    'the first tick, then one tick later each day');
  // the tick exactly 24h after a start declines — `>` not `>=` — and names the run
  const [first] = closedOf(sim, 'x/drift');
  const exact = asks(sim, 'x/drift').find((e) => e.t === first.createdAt + 24 * 3_600_000);
  assert.equal(exact.verdict, 'no');
  assert.equal(exact.reason, `the newest run, #${first.number}, started inside 1d`);
  assert.ok(asks(sim, 'x/drift').every((e) => e.verdict !== 'fail-open'));
});

// ---- S76 — a task stating no condition is off the schedule: the scheduler never
// asks it, and its item exists only because somebody created one — at whose pick
// the empty expression holds. The force lever reaches such a task only through
// its open items: it wakes them, stamped `Woken`, and mints nothing where none
// is open (#1721) — a bare item of it would carry nothing its worker can read.
test('S76 a task with no preconditions is never asked; its hand-created item runs; a force wakes it and mints nothing', () => {
  const tasks = [
    { id: 'x/absent', outcome: 'done', codeWorkMinutes: 1, precondition: () => ({ run: true }) },
    { id: 'x/empty', preconditions: [], outcome: 'done', codeWorkMinutes: 1 },
  ];
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  let byHand; let held; let woken; let nothing;
  sim.at('2026-08-12T10:00Z', (s) => { byHand = s.createItem('x/absent'); });
  // an item held for tomorrow, forced today — and a force that finds nothing open
  sim.at('2026-08-12T12:00Z', (s) => { held = s.createItem('x/empty', { notBefore: T('2026-08-13T12:00Z') }); });
  sim.at('2026-08-12T13:00Z', (s) => { woken = s.force('x/empty'); });
  sim.at('2026-08-12T15:00Z', (s) => { nothing = s.force('x/absent'); });
  sim.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  for (const id of ['x/absent', 'x/empty']) {
    assert.equal(asks(sim, id).length, 0, `${id} never asked, at any of the 24 ticks`);
    assert.equal(sim.family(id).filter((i) => i !== byHand && i !== held).length, 0, `${id} never filed, never seeded`);
  }
  assert.equal(byHand.outcome, 'done', 'the hand-created item runs — its empty expression holds at pick');
  assert.equal(sim.log.find((e) => e.kind === 'evaluate' && e.issue === byHand.number).reason,
    'no conditions stated — the item itself is the ask');
  assert.equal(woken, held, 'the force reached the open item — no mint');
  assert.equal(held.woken, T('2026-08-12T13:00Z'), 'stamped Woken');
  assert.equal(held.outcome, 'done', 'and ran today, its Not-before cleared');
  assert.equal(nothing, null);
  assert.ok(sim.log.some((e) => e.kind === 'force' && e.task === 'x/absent' && e.nothing), 'nothing open: nothing woken, nothing minted');
  assert.ok(!sim.log.some((e) => e.kind === 'force' && e.minted), 'no force minted an item of a task off the schedule');
});

// ---- S77 — a forced mint satisfies the cadence at pick: the item is stamped
// `Woken`, and the wake stands in for `due:daily` even though today's run
// already happened. The contrast: an unstamped hand-made item of the same task
// is judged over the same history and declines — the stamp, not the shape, is
// what the terms read.
test('S77 a forced mint passes the cadence at pick by its Woken stamp; an unstamped twin does not', () => {
  const tasks = [{
    id: 'x/ran', preconditions: ['due:daily'], outcome: 'done', codeWorkMinutes: 1,
    precondition: () => ({ run: true }),
  }];
  // seeded as of 05:00: the task ran at TODAY's 04:00 anchor
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T05:00Z');
  let forced; let byHand;
  sim.at('2026-08-12T10:00Z', (s) => { forced = s.force('x/ran'); });
  sim.at('2026-08-12T13:00Z', (s) => { byHand = s.createItem('x/ran'); });
  sim.run('2026-08-12T05:00Z', '2026-08-12T18:00Z');

  assert.ok(asks(sim, 'x/ran').every((e) => e.verdict === 'no'), 'the schedule itself never re-runs today');
  assert.equal(forced.woken, T('2026-08-12T10:00Z'));
  assert.equal(forced.outcome, 'done', 'the wake stood in for the cadence');
  assert.match(sim.log.find((e) => e.kind === 'evaluate' && e.issue === forced.number).reason,
    /was woken by hand — the wake stands in for the cadence/);
  assert.equal(byHand.woken, null);
  assert.equal(byHand.outcome, 'rejected', 'judged over the day\'s runs like the schedule\'s own item');
  assert.match(sim.log.find((e) => e.kind === 'decline-close' && e.issue === byHand.number).reason,
    /already ran since the daily anchor/);
});

// ---- S78 — a brand-new task is asked at its first tick like any other: no
// first-window booking, no born-blocked item (the retired S25). A weekly task
// with no history and work waiting runs mid-week at the first tick — "no run
// since the anchor" is simply true — and its NEXT run is the following Sunday's.
test('S78 a new task is asked at its first tick; its next occurrence is the cadence\'s', () => {
  const sim = makeSim({ tasks: cast() }); // no seeded history — a fresh repo
  sim.at('2026-08-12T00:00Z', ({ world }) => { world.stalePrs = true; });
  sim.run('2026-08-12T00:00Z', '2026-08-17T00:00Z'); // Wednesday to the Monday after Sunday's anchor

  const runs = closedOf(sim, 'tidy/tidy-prs');
  assert.equal(runs.length, 2);
  assert.equal(runs[0].createdAt, T('2026-08-12T00:17Z'), 'the first tick, mid-week, off-anchor');
  assert.match(asks(sim, 'tidy/tidy-prs')[0].reason, /^no run since the weekly anchor at 2026-08-09T04:00Z/);
  assert.equal(runs[1].createdAt, T('2026-08-16T04:17Z'), "then Sunday's anchor, and nothing between");
  assert.equal(sim.family('tidy/tidy-prs').filter((i) => i.state === 'open').length, 0, 'nothing born blocked');
  // the daily tasks were asked at 00:17 too, and declined on their own conditions
  assert.equal(asks(sim, 'tidy/tidy-issues')[0].t, T('2026-08-12T00:17Z'));
  assert.equal(asks(sim, 'tidy/tidy-issues')[0].reason, 'no issue touched in window');
});
