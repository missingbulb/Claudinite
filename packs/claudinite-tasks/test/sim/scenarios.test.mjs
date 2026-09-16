// The mechanism, executable. Each test is a timed play-through against the
// harness in sim.mjs: "at time X, Y happens", then run the virtual clock and
// assert on the issue store the ENGINE wrote and on the harness's log of what it
// drove. A test here going red means the mechanism breaks — and
// docs/PRINCIPLES.md's claims cite these tests by name, so a renamed or deleted
// one needs its citing claim updated too.
//
// Every verdict asserted below was reached by the real queue: the scheduler run,
// the executor loop, the precondition engine, the janitor's rules and the
// session's converge all run here, against the in-memory world of `world/`.
// A task's `preconditions` carries its run-history terms — the cadence it keeps —
// and its `precondition` function is loaded as a task-local TERM standing for
// every other condition, reading `world`, the scenario-owned signal state, and
// `window`, the since-last-run window the collectors resolve.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, T, tick, NH, READY, ORIGIN_AD_HOC } from './sim.mjs';

function cast() {
  return [
    {
      // The one task in the cast that declares it does not run past its own
      // failure: a broken mount is not something to re-run every morning.
      id: 'basics/baselining', preconditions: ['due:daily', 'last-run-not-failed'],
      codeWorkMinutes: 21, agentMinutes: 30,
      precondition: (w) => ({ run: !!w.mountBehind, reason: 'mount converged, no pending notes' }),
      requestsAgent: (w) => !!w.baseliningNeedsJudgment,
      codeWorkFails: (w) => !!w.mountBroken,
    },
    {
      id: 'grow/growth-extract', preconditions: ['due:daily'], schedule_after: ['basics/baselining'],
      codeWorkMinutes: 2, agentMinutes: 35,
      precondition: (w) => ({ run: !!w.extractHasLessons, reason: 'nothing new to extract' }),
    },
    {
      id: 'grow/growth-promote', preconditions: ['due:daily'], schedule_after: ['grow/growth-extract'],
      codeWorkMinutes: 1, agentMinutes: 2,
      precondition: (w) => ({ run: !!w.promoteHasCandidates, reason: 'nothing staged' }),
    },
    {
      // A movement-gated task: its signal is windowed the way the engine's
      // collectors window it — since this task's newest run started.
      id: 'tidy/tidy-issues', preconditions: ['due:daily'],
      codeWorkMinutes: 1, agentMinutes: 16,
      precondition: (w, _now, _item, window) => ({
        run: w.issueTouchedAt != null && w.issueTouchedAt >= window.since,
        reason: 'no issue touched in window',
      }),
    },
    {
      id: 'chrome/store-release', preconditions: ['due:daily'], codeWorkMinutes: 3,
      precondition: (w) => ({ run: !!w.releasePending, reason: 'nothing to release' }),
    },
    {
      id: 'gcec/create-extractor', preconditions: ['due:daily'],
      codeWorkMinutes: 4, agentMinutes: 10,
      precondition: (w, _now, _item, window) => ({
        run: w.requestAt != null && w.requestAt >= window.since,
        reason: 'no eligible requests',
      }),
    },
    {
      id: 'tidy/tidy-prs', preconditions: ['due:weekly'],
      codeWorkMinutes: 1, agentMinutes: 5,
      precondition: (w) => ({ run: !!w.stalePrs, reason: 'no stale PRs' }),
    },
    // no cadence term: off the schedule — a fan-out target, run only from items
    // somebody creates.
    //
    // The cast's pack ids are ordinary names on purpose: `parseWorkItemTitle`
    // CANONICALIZES the pack half, so a cast id that collides with a real pack
    // rename is silently read as the renamed one and every item of it resolves to
    // a task this repo does not carry.
    { id: 'fleet/fleet-baseline', codeWorkMinutes: 1, agentMinutes: 5 },
  ];
}

// The triage-split cast (S41–S43), kept OUT of `cast()` on purpose: these two
// always-run tasks would add executor contention to every other scenario, and
// S15's mutex timing is sensitive to exactly that.
const SEEDS = {
  id: 'fleet/fleet-seeds', preconditions: ['due:daily'], codeWorkMinutes: 2,
  precondition: () => ({ run: true }),
  codeWorkFails: (w) => !!w.patScopeMissing,
  codeWorkTriage: () => 'action', // the PAT lacks Contents: write — a person grants it
};
const REGENERATE = {
  id: 'site/regenerate', preconditions: ['due:daily'], codeWorkMinutes: 2,
  precondition: () => ({ run: true }),
  deliversOpenPr: () => true,
};

// The executor's pick-time re-evaluation: one entry per item it evaluated,
// recorded where the executor collects that item's signals.
const evals = (sim, task) => sim.log.filter((e) => e.kind === 'evaluate' && e.task === task);
// The scheduler's ask: one entry per tick per task asked, `verdict` go | no |
// fail-open. A decline is this entry and nothing else.
const asks = (sim, task) => sim.log.filter((e) => e.kind === 'ask' && e.task === task);
const goes = (sim, task) => asks(sim, task).filter((e) => e.verdict === 'go');
const closedOf = (sim, task) =>
  sim.family(task).filter((i) => !i.seeded && i.state === 'closed' && i.outcome != null);
const ticks = (sim) => sim.log.filter((e) => e.kind === 'scheduler-run');
const own = (sim, task) => sim.family(task).filter((i) => !i.seeded);

// ---- S1' — quiet night: every tick asks every scheduled task, every ask
// declines, and a decline is a log line — no item, no board, nothing durable.
test("S1' quiet night: asked at every tick, no items, nothing recorded", async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  await sim.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

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
  // a task stating no cadence is off the schedule: never asked, never instantiated
  assert.equal(asks(sim, 'fleet/fleet-baseline').length, 0);
  assert.equal(own(sim, 'fleet/fleet-baseline').length, 0);
  // the executor evaluated nothing: no item ever existed to pick
  assert.equal(sim.log.filter((e) => e.kind === 'evaluate').length, 0);
  assert.equal(sim.log.filter((e) => e.kind === 'create').length, 0);
  // nothing ran, nothing escalated, nothing closed
  assert.equal(sim.log.filter((e) => e.kind === 'handoff' || e.kind === 'escalate').length, 0);
});

// ---- S2 — happy path: work exists, the item runs to a closed outcome.
test('S2 happy path: touched issues -> item runs, closes done', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:02Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:02Z'); });
  await sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  const [done] = closedOf(sim, 'tidy/tidy-issues');
  assert.ok(done, 'tidy-issues converged');
  assert.equal(done.outcome, 'done');
  // claimed at the 04:17 drain, agent 16m: closed ~04:35
  assert.ok(done.closedAt <= T('2026-08-12T04:40Z'));
  assert.equal(evals(sim, 'tidy/tidy-issues').length, 1);
  assert.equal(goes(sim, 'tidy/tidy-issues').length, 1, 'the one go was the 04:17 tick');
});

// ---- S3' — work appears mid-window: the NEXT TICK finds it, not the next
// anchor. The scheduler keeps no memory of the morning's decline (PRINCIPLES.md), so
// every tick asks again; `due:daily` still holds — nothing ran since 04:00 —
// and the window, since the last run, contains the touch.
test("S3' mid-window work runs at the next tick, not the next anchor", async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T09:03Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T09:03Z'); });
  await sim.run('2026-08-12T00:00Z', '2026-08-13T12:00Z');

  const g = goes(sim, 'tidy/tidy-issues');
  assert.equal(g.length, 1, 'one go across two days');
  assert.equal(g[0].t, tick('2026-08-12T09:17Z'), 'the tick after the touch, the same day');
  const [done] = closedOf(sim, 'tidy/tidy-issues');
  assert.ok(done && done.outcome === 'done' && done.closedAt < T('2026-08-12T10:00Z'));
  // Tomorrow's anchor is asked again — and declines: the window is since the
  // 09:17 run started, and the 09:03 touch sits before it. Once a touch, once a run.
  const tomorrow = asks(sim, 'tidy/tidy-issues').filter((e) => e.t >= T('2026-08-13T04:00Z'));
  assert.ok(tomorrow.length >= 8 && tomorrow.every((e) => e.verdict === 'no'));
});

// ---- S4 — the late-fire night: all cron fires drop, one late scheduler run at 05:41,
// and the chain still runs the same morning, in order, via the pick-time yield.
test('S4 late fire: the chain completes the same morning, ordered', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => {
    world.mountBehind = true;         // baselining has real work (no judgment needed)
    world.extractHasLessons = true;   // and so does the rest of the chain
    world.promoteHasCandidates = true;
  });
  sim.dropSchedulerRuns('2026-08-12T00:00Z', '2026-08-12T05:41Z');
  sim.schedulerRunAt('2026-08-12T05:41Z');
  await sim.run('2026-08-12T00:00Z', '2026-08-12T09:00Z');

  const [base] = closedOf(sim, 'basics/baselining');
  const [extract] = closedOf(sim, 'grow/growth-extract');
  const [promote] = closedOf(sim, 'grow/growth-promote');
  assert.ok(base && extract && promote, 'all three converged');
  assert.ok(base.closedAt < extract.closedAt, 'baselining before extract');
  assert.ok(extract.closedAt < promote.closedAt, 'extract before promote');
  assert.ok(promote.closedAt < T('2026-08-12T09:00Z'), 'same morning, not tomorrow');
  // extract was never evaluated while baselining was live
  const baseClaim = evals(sim, 'basics/baselining')[0];
  const extractClaim = evals(sim, 'grow/growth-extract')[0];
  assert.ok(extractClaim.t >= base.closedAt, 'yield held while upstream ran');
  assert.ok(baseClaim.t >= T('2026-08-12T05:41Z'), 'nothing happened before the late scheduler run');
});

// ---- S5 — the scheduler run is down for three days: the first tick back asks
// about NOW — `due:daily` against the current anchor, the window since the last
// run — so a touch from the outage is found once. No backfill of the missed
// days, and nothing to catch up on but the present.
test('S5 three-day outage: the first tick back finds the work once, no backfill', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-11T00:00Z');
  sim.at('2026-08-12T12:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T12:00Z'); });
  sim.dropSchedulerRuns('2026-08-11T09:00Z', '2026-08-14T10:00Z');
  await sim.run('2026-08-11T00:00Z', '2026-08-15T12:00Z');

  const a = asks(sim, 'tidy/tidy-issues');
  assert.equal(a.filter((e) => e.t >= T('2026-08-11T09:00Z') && e.t < T('2026-08-14T10:00Z')).length, 0,
    'no ask while the cron was down — nothing durable was owed');
  const g = goes(sim, 'tidy/tidy-issues');
  assert.equal(g.length, 1, 'exactly one go: the first tick back');
  assert.equal(g[0].t, tick('2026-08-14T10:17Z'));
  assert.equal(closedOf(sim, 'tidy/tidy-issues').length, 1, 'one run for the outage, not one per missed day');
  // Saturday's anchor asks again and declines: the window is since Friday's run.
  assert.ok(a.filter((e) => e.t >= T('2026-08-15T04:00Z')).every((e) => e.verdict === 'no'));
});

// ---- S21 — the quiet month: no items at all, an ask at every tick, zero
// escalations. The quiet task's whole footprint is the scheduler's log lines.
test('S21 quiet weeks: no items, an ask per tick, no janitor noise', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-02T05:00Z'); // Sunday, past the 04:00 anchor
  await sim.run('2026-08-02T05:00Z', '2026-09-07T00:00Z');

  assert.equal(own(sim, 'tidy/tidy-prs').length, 0, 'five quiet weeks file nothing');
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
test('S22 asked every tick; the tick that finds work runs it, the next anchor does not repeat it', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  // Work arrives on the second day, after a quiet first one.
  sim.at('2026-08-13T01:40Z', ({ world }) => { world.requestAt = T('2026-08-13T01:40Z'); });
  await sim.run('2026-08-12T00:00Z', '2026-08-14T00:00Z');

  const fam = own(sim, 'gcec/create-extractor');
  assert.equal(fam.length, 1, 'the quiet period filed nothing — only the working one has an item');
  const it = fam[0];
  assert.equal(it.createdAt, tick('2026-08-13T02:17Z'), 'created at the first tick after the work arrived');
  assert.equal(it.state, 'closed');
  assert.ok(it.closedAt <= T('2026-08-13T03:00Z'), 'ran at the tick that found it');
  assert.equal(asks(sim, 'gcec/create-extractor').length, ticks(sim).length,
    'every tick asked — the item ran and closed between two of them, so none found it live');
  // Thursday's 04:17 anchor asks again — `due:daily` holds, the 02:17 run was
  // Wednesday's period — and the window since that run holds no request.
  const anchor = asks(sim, 'gcec/create-extractor').find((e) => e.t === tick('2026-08-13T04:17Z'));
  assert.equal(anchor.verdict, 'no');
  assert.equal(anchor.reason, 'no eligible requests');
});

// ---- S23 — the upstream declines (or is broken): dependents run anyway. A
// declined upstream has NO item at all, so the yield sees nothing live.
test('S23 declined upstream leaves nothing to yield to; the dependent runs', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => { world.extractHasLessons = true; }); // baselining stays quiet
  await sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  assert.equal(sim.standingItem('basics/baselining'), undefined,
    'the quiet upstream filed nothing — its declines are log lines');
  assert.ok(asks(sim, 'basics/baselining').every((e) => e.verdict === 'no'));
  const [extract] = closedOf(sim, 'grow/growth-extract');
  assert.ok(extract && extract.closedAt < T('2026-08-12T05:00Z'),
    'extract ran the same morning — a declined upstream is not a blocker');
});

test('S23b needs-human upstream does not halt the chain', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => {
    world.mountBehind = true; world.mountBroken = true; // baselining runs and fails
    world.extractHasLessons = true;
  });
  await sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  assert.ok(sim.standingItem('basics/baselining').parked, 'upstream broke');
  assert.equal(closedOf(sim, 'grow/growth-extract').length, 1, 'extract still ran');
});

// ---- S24 — retired with the roll (#1115). The trap it demonstrated — `schedule_after`
// wired as Blocked-by starving every dependent of a quiet upstream — needed a
// standing item that rolls and never closes; a declined occurrence now files
// no item at all, so the object of the starvation no longer exists. The yield
// remains the wiring, exercised by S4 (ordering on a go-night) and S23 (a
// declined upstream holds nothing back).
test('S24 three quiet-upstream days: the yield never holds the dependent', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => { world.extractHasLessons = true; });
  await sim.run('2026-08-12T00:00Z', '2026-08-15T00:00Z'); // three quiet-upstream days

  assert.equal(closedOf(sim, 'grow/growth-extract').length, 3,
    'extract asked and run each of the three days');
  assert.equal(own(sim, 'basics/baselining').length, 0,
    'the quiet upstream filed nothing all week');
});

// ---- S26b — the `due:` term's second half (F13): an item CREATED before the
// anchor that CLOSES after it consumed this period, or the tick after its close
// would run the task twice. A forced mint at 03:00 doing two hours of work is
// exactly that shape; and the next day's anchor must still be asked.
test("S26b the closed-at half covers the rest of the day; the next anchor is asked again", async () => {
  const tasks = [{
    id: 'x/long', preconditions: ['due:daily'], codeWorkMinutes: 120,
    precondition: () => ({ run: true }),
  }];
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T03:00Z', (s) => s.force('x/long'));
  await sim.run('2026-08-12T00:00Z', '2026-08-13T12:00Z');

  const [forced, next, ...rest] = own(sim, 'x/long');
  assert.ok(forced.createdAt < T('2026-08-12T04:00Z') && forced.closedAt > T('2026-08-12T04:00Z'),
    "the scenario's premise: created before the anchor, closed after it");
  // Every tick after the close, for the rest of Wednesday, declines on the
  // closed-at half — the created-at half alone would have filed a second run.
  const afterClose = asks(sim, 'x/long').filter((e) => e.t > forced.closedAt && e.t < T('2026-08-13T04:00Z'));
  assert.ok(afterClose.length >= 20, 'asked every remaining tick');
  assert.ok(afterClose.every((e) => e.verdict === 'no' && new RegExp(`#${forced.number} already ran since the daily anchor`).test(e.reason)));
  // Thursday's anchor is not eaten by Wednesday's close.
  assert.ok(next && next.createdAt === tick('2026-08-13T04:17Z') && next.outcome === 'done');
  assert.equal(rest.length, 0, 'two days, two runs — never a double execution');
});

// ---- S28 — the mechanism (or a task) changes mid-flight: nothing durable
// carries a schedule (a declined task holds no item, and the scheduler
// remembers nothing), so a declaration change applies at the very next tick with
// no migration and no relabeling.
test('S28 declaration change mid-flight: the next tick follows HEAD', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  // Mid-day, an update lands: tidy-prs moves from the weekly cadence to the daily
  // one, and its precondition is replaced outright.
  sim.at('2026-08-12T12:00Z', (s) => s.updateTask('tidy/tidy-prs', {
    preconditions: ['due:daily'],
    precondition: (w, _now, _item, window) => ({
      run: w.newSignalAt != null && w.newSignalAt >= window.since,
      reason: 'new precondition, no work',
    }),
  }));
  sim.at('2026-08-14T01:00Z', ({ world }) => { world.newSignalAt = T('2026-08-14T01:00Z'); });
  await sim.run('2026-08-12T00:00Z', '2026-08-15T12:00Z');

  const a = asks(sim, 'tidy/tidy-prs');
  // Under the weekly cadence every Wednesday-morning tick declined on Sunday's run.
  assert.ok(a.filter((e) => e.t < T('2026-08-12T12:00Z')).every((e) => /weekly anchor/.test(e.reason)));
  // The very next tick reads the new cadence — daily, so Wednesday's occurrence
  // is open — and judges it by the NEW precondition.
  const first = a.find((e) => e.t >= T('2026-08-12T12:00Z'));
  assert.equal(first.t, tick('2026-08-12T12:17Z'), 'the first ask after the update is immediate');
  assert.equal(first.verdict, 'no');
  assert.equal(first.reason, 'new precondition, no work', 'judged by the new precondition');
  // Day 3, work present at 01:00: the 01:17 tick runs it — the next TICK, not the
  // next anchor, because the scheduler carries nothing forward from its declines.
  const g = goes(sim, 'tidy/tidy-prs');
  assert.equal(g.length, 1);
  assert.equal(g[0].t, tick('2026-08-14T01:17Z'));
  assert.equal(closedOf(sim, 'tidy/tidy-prs').length, 1, 'and ran under the new declaration');
  // Friday's own anchor asks again under the daily cadence — the 01:17 run was
  // Thursday's period — and the window, since that run, holds nothing new.
  const anchor = a.find((e) => e.t === tick('2026-08-14T04:17Z'));
  assert.equal(anchor.verdict, 'no');
  assert.equal(anchor.reason, 'new precondition, no work');
});

// ---- S71 — a DROPPED tick. GitHub drops scheduled runs under load, and the
// cadence sets what that costs: an hourly grid absorbs it in an hour, two ticks
// a day absorb it in twelve, and one tick a day loses the occurrence for the
// whole day. Nothing is stranded either way — `due:daily` is decided from the
// ANCHOR and the run history, never from whether the cron fired.
test('S71 a dropped anchor tick is caught by the next one — the cost is latency, never the occurrence', async () => {
  const armed = async (opts) => {
    const s = makeSim({ tasks: cast(), ...opts }).seedSteadyState('2026-08-12T00:00Z');
    s.at('2026-08-12T00:05Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T00:05Z'); });
    s.dropSchedulerRuns('2026-08-12T04:00Z', '2026-08-12T05:00Z'); // the 04:17 tick never fires
    await s.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');
    return s;
  };

  const twice = await armed({ cronHours: [4, 16] });
  const once = await armed({ cronHours: [4] });
  const hourly = await armed({});

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

// ---- S73 — the weekly anchor under a coarse cron, INCLUDING one whose hours do
// not contain the anchor hour at all. `due:weekly` is decided from the anchor
// and the run history, so a weekly task must fire exactly once a week whatever
// hours the cron names — never twice for being looked at twice a day, and never
// never for being looked at late.
test('S73 a weekly task fires exactly once a week, even when no tick lands on its anchor hour', async () => {
  const week = async (opts) => {
    const s = makeSim({ tasks: cast(), ...opts }).seedSteadyState('2026-08-09T00:00Z');
    s.at('2026-08-09T00:05Z', ({ world }) => { world.stalePrs = true; });
    // Sun 2026-08-09 through the following Sunday — two weekly anchors in range
    await s.run('2026-08-09T00:00Z', '2026-08-16T12:00Z');
    return s;
  };

  const onAnchor = await week({ cronHours: [4, 16] });   // a tick lands on the 04:00 anchor
  const offAnchor = await week({ cronHours: [6, 18] });  // no tick does
  const hourly = await week({});

  // One occurrence per week in all three — the cadence changes WHEN it is seen,
  // never how many there are.
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

// ---- O. The stateless scheduler (owner, 2026-09-05, #1725 — PRINCIPLES.md) --
// The engine keeps no calendar and no memory of an ask: every tick asks every
// scheduled task, and a task's cadence is a term in its own preconditions, read
// off its run history. These pin the terms one at a time.

// ---- S74 — `due:daily` under the twice-daily cron: BOTH ticks ask. The 04:17
// tick finds no run since the anchor and files; the 16:17 tick finds that run
// and declines. Once a day is the term's doing, not a watermark's.
test('S74 due:daily is asked at both daily ticks; the second declines on the run since the anchor', async () => {
  const tasks = [{
    id: 'x/daily', preconditions: ['due:daily'], codeWorkMinutes: 2,
    precondition: () => ({ run: true }),
  }];
  const sim = makeSim({ tasks, cronHours: [4, 16] }).seedSteadyState('2026-08-12T00:00Z');
  await sim.run('2026-08-12T00:00Z', '2026-08-14T00:00Z');

  const a = asks(sim, 'x/daily');
  assert.deepEqual(a.map((e) => [e.t, e.verdict]), [
    [tick('2026-08-12T04:17Z'), 'go'], [tick('2026-08-12T16:17Z'), 'no'],
    [tick('2026-08-13T04:17Z'), 'go'], [tick('2026-08-13T16:17Z'), 'no'],
  ]);
  const [wed] = closedOf(sim, 'x/daily');
  assert.equal(a[1].reason, `#${wed.number} already ran since the daily anchor at 2026-08-12T04:00:00.000Z`);
  assert.equal(closedOf(sim, 'x/daily').length, 2, 'one run per day, two days');
});

// ---- S75 — `last-run-over:1d` keeps no anchor: it measures from the newest
// run's START, strictly more than the duration ago. A task that runs at the
// first tick of the day then drifts one tick later each day — the tick exactly
// 24h after the last start is "not over 1d", the one after it is.
test('S75 last-run-over:1d drifts one tick a day: strictly over, measured from the last start', async () => {
  const tasks = [{
    id: 'x/drift', preconditions: ['last-run-over:1d'], codeWorkMinutes: 2,
    precondition: () => ({ run: true }),
  }];
  const sim = makeSim({ tasks }); // no history at all: "no run in the horizon" holds
  await sim.run('2026-08-12T00:00Z', '2026-08-15T00:00Z');

  // The go's reason joins every held conjunct: the cadence term's, then the
  // scenario's gate, which states none of its own and so contributes its name.
  assert.match(asks(sim, 'x/drift')[0].reason, /^no run of this task in the last 40 days/);
  assert.deepEqual(closedOf(sim, 'x/drift').map((i) => i.createdAt),
    [tick('2026-08-12T00:17Z'), tick('2026-08-13T01:17Z'), tick('2026-08-14T02:17Z')],
    'the first tick, then one tick later each day');
  // the tick exactly 24h after a start declines — `>` not `>=` — and names the run
  const [first] = closedOf(sim, 'x/drift');
  const exact = asks(sim, 'x/drift').find((e) => e.t === first.createdAt + 24 * 3_600_000);
  assert.equal(exact.verdict, 'no');
  assert.match(exact.reason, new RegExp(`the newest run, #${first.number}, started .* inside 1d`));
  assert.ok(asks(sim, 'x/drift').every((e) => e.verdict !== 'fail-open'));
});

// ---- S76 — a task stating no condition is off the schedule: the scheduler never
// asks it, and its item exists only because somebody created one — at whose pick
// the empty expression holds. The force lever reaches such a task only through
// its open items: it wakes them, stamped `Woken`, and mints nothing where none
// is open (#1721) — a bare item of it would carry nothing its worker can read.
test('S76 a task with no preconditions is never asked; its hand-created item runs; a force wakes it and mints nothing', async () => {
  const tasks = [
    { id: 'x/absent', codeWorkMinutes: 1, precondition: () => ({ run: true }) },
    { id: 'x/empty', preconditions: [], codeWorkMinutes: 1 },
  ];
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  let byHand; let held;
  sim.at('2026-08-12T10:00Z', (s) => { byHand = s.createItem('x/absent'); });
  // an item held for tomorrow, forced today — and a force that finds nothing open
  sim.at('2026-08-12T12:00Z', (s) => { held = s.createItem('x/empty', { notBefore: T('2026-08-13T12:00Z') }); });
  sim.at('2026-08-12T13:00Z', (s) => s.force('x/empty'));
  sim.at('2026-08-12T15:00Z', (s) => s.force('x/absent'));
  await sim.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  for (const id of ['x/absent', 'x/empty']) {
    assert.equal(asks(sim, id).length, 0, `${id} never asked, at any of the 24 ticks`);
  }
  assert.equal(sim.item(byHand.number).outcome, 'done', 'the hand-created item runs — its empty expression holds at pick');
  const woke = sim.log.find((e) => e.kind === 'force' && e.issue === held.number);
  assert.ok(woke && !woke.minted, 'the force reached the open item — no mint');
  assert.equal(sim.item(held.number).woken, T('2026-08-12T13:00Z'), 'stamped Woken');
  assert.equal(sim.item(held.number).outcome, 'done', 'and ran today, its Not-before cleared');
  assert.ok(sim.log.some((e) => e.kind === 'force' && e.task === 'x/absent' && e.nothing),
    'nothing open: nothing woken, nothing minted');
  assert.ok(!sim.log.some((e) => e.kind === 'force' && e.minted), 'no force minted an item of a task off the schedule');
});

// ---- S77 — a forced mint satisfies the cadence at pick: the item is stamped
// `Woken`, and the wake stands in for `due:daily` even though today's run
// already happened. The contrast: an unstamped hand-made item of the same task
// is judged over the same history and declines — the stamp, not the shape, is
// what the terms read.
test('S77 a forced mint passes the cadence at pick by its Woken stamp; an unstamped twin does not', async () => {
  const tasks = [{
    id: 'x/ran', preconditions: ['due:daily'], codeWorkMinutes: 1,
    precondition: () => ({ run: true }),
  }];
  // seeded as of 05:00: the task ran at TODAY's 04:00 anchor
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T05:00Z');
  let byHand;
  sim.at('2026-08-12T10:00Z', (s) => s.force('x/ran'));
  sim.at('2026-08-12T13:00Z', (s) => { byHand = s.createItem('x/ran'); });
  await sim.run('2026-08-12T05:00Z', '2026-08-12T18:00Z');

  assert.ok(asks(sim, 'x/ran').every((e) => e.verdict === 'no'), 'the schedule itself never re-runs today');
  const minted = sim.log.find((e) => e.kind === 'force' && e.minted);
  assert.ok(minted, 'nothing to wake — the force minted');
  const forced = sim.item(minted.issue);
  assert.equal(forced.woken, T('2026-08-12T10:00Z'));
  assert.equal(forced.outcome, 'done', 'the wake stood in for the cadence');
  assert.match(evals(sim, 'x/ran').length ? sim.declineReason(forced.number) ?? 'ran' : '', /ran/);
  // The contrast: an unqualified item of a SCHEDULED task is the one shape the
  // create lever refuses, so a person opening it by hand stamps nothing — and at
  // pick the cadence judges it over the task's other runs, like the schedule's own.
  const twin = sim.item(byHand.number);
  assert.equal(twin.woken, null);
  assert.equal(twin.outcome, 'obsolete', "judged over the day's runs like the schedule's own item");
  assert.match(sim.declineReason(twin.number), /already ran since the daily anchor/);
});

// ---- S78 — a brand-new task is asked at its first tick like any other: no
// first-window booking, no born-blocked item. A weekly task with no history and
// work waiting runs mid-week at the first tick — "no run since the anchor" is
// simply true — and its NEXT run is the following Sunday's.
test("S78 a new task is asked at its first tick; its next occurrence is the cadence's", async () => {
  const sim = makeSim({ tasks: cast() }); // no seeded history — a fresh repo
  sim.at('2026-08-12T00:00Z', ({ world }) => { world.stalePrs = true; });
  await sim.run('2026-08-12T00:00Z', '2026-08-17T00:00Z'); // Wednesday to the Monday after Sunday's anchor

  const runs = closedOf(sim, 'tidy/tidy-prs');
  assert.equal(runs.length, 2);
  assert.equal(runs[0].createdAt, tick('2026-08-12T00:17Z'), 'the first tick, mid-week, off-anchor');
  assert.match(asks(sim, 'tidy/tidy-prs')[0].reason, /^no run since the weekly anchor at 2026-08-09T04:00/);
  assert.equal(runs[1].createdAt, tick('2026-08-16T04:17Z'), "then Sunday's anchor, and nothing between");
  assert.equal(sim.family('tidy/tidy-prs').filter((i) => i.state === 'open').length, 0, 'nothing born blocked');
  // the daily tasks were asked at 00:17 too, and declined on their own conditions
  assert.equal(asks(sim, 'tidy/tidy-issues')[0].t, tick('2026-08-12T00:17Z'));
  assert.equal(asks(sim, 'tidy/tidy-issues')[0].reason, 'no issue touched in window');
});

// ---- S79 — the two fields say different things, on the two shapes an expression
// could not state before. A `schedule` task may require nothing: asked at every
// tick, and nothing narrows it, so it runs at every one. And a cadence on a
// `request` task is INERT, not a rate limit on the lever: every occurrence of such
// a task is one somebody created, every such item is stamped `Woken`, and the wake
// stands in for the cadence — so the term cannot decline a single run.
test('S79 a cadence cannot hold back a request task; a schedule task requiring nothing runs every tick', async () => {
  const tasks = [
    { id: 'x/lever', trigger: 'request', preconditions: ['due:daily'], codeWorkMinutes: 1 },
    { id: 'x/always', trigger: 'schedule', preconditions: [], codeWorkMinutes: 1 },
  ];
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  let first; let second;
  sim.at('2026-08-12T09:00Z', (s) => { first = s.createItem('x/lever'); });
  sim.at('2026-08-12T11:00Z', (s) => { second = s.createItem('x/lever', { qualifier: '#2' }); });
  await sim.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  assert.equal(asks(sim, 'x/lever').length, 0, 'a request task is never asked, cadence or no cadence');
  assert.equal(sim.item(first.number).outcome, 'done', 'the first hand-created item runs');
  assert.equal(sim.item(second.number).outcome, 'done',
    'and so does the second, the same day: the wake stands in for `due:daily`');

  const asked = asks(sim, 'x/always');
  assert.equal(asked.length, 24, 'asked at every tick of the day');
  assert.equal(goes(sim, 'x/always').length, 24, 'and nothing narrows it, so every ask is a yes');
  assert.equal(sim.family('x/always').filter((i) => i.outcome === 'done').length, 25, 'one run per tick, plus the seed');
});

// ---- S6 — double-fire: two scheduler runs in the same minute, one item. The
// group serializes them — `cancel-in-progress: false` queues the second rather
// than dropping it — and the second sees the first's LIVE item and does not ask.
test('S6 double scheduler run: the live-item invariant holds under a duplicate fire', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.dropSchedulerRuns('2026-08-12T04:00Z', '2026-08-12T05:00Z'); // replace the cron fire…
  sim.schedulerRunAt('2026-08-12T04:17:05Z');                      // …with a duplicated one
  sim.schedulerRunAt('2026-08-12T04:17:20Z');
  await sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  const fam = own(sim, 'tidy/tidy-issues');
  assert.equal(fam.length, 1, 'one item despite two scheduler runs');
  assert.equal(closedOf(sim, 'tidy/tidy-issues').length, 1, 'and it ran once');
  assert.equal(ticks(sim).filter((e) => e.t >= T('2026-08-12T04:17Z') && e.t < T('2026-08-12T04:19Z')).length, 2,
    'both runs executed — the group queues, it does not drop');
  assert.equal(asks(sim, 'tidy/tidy-issues').filter((e) => e.t >= T('2026-08-12T04:17Z') && e.t < T('2026-08-12T04:19Z')).length,
    1, 'the second run did not ask — the live item held the lane');
});

// ---- S13' — an ad-hoc item's no-go closes it. Ad-hoc is STRUCTURAL: a
// qualifier is what makes this item ad-hoc — an unqualified item of a scheduled
// task would BE the standing item.
test("S13' ad-hoc no-go closes obsolete; the scheduled family is undisturbed", async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  let adhoc;
  sim.at('2026-08-12T10:00Z', (s) => { adhoc = s.createItem('tidy/tidy-issues', { urgent: true, qualifier: 'one-off' }); });
  await sim.run('2026-08-12T05:00Z', '2026-08-12T12:00Z');

  const it = sim.item(adhoc.number);
  assert.equal(it.state, 'closed');
  assert.equal(it.outcome, 'obsolete');
  // …and the ad-hoc twin neither consumed nor disturbed the scheduled family:
  // the ticks kept asking and declining, and no unqualified item exists.
  assert.equal(own(sim, 'tidy/tidy-issues').length, 0);
  assert.ok(asks(sim, 'tidy/tidy-issues').length >= 6 && asks(sim, 'tidy/tidy-issues').every((e) => e.verdict === 'no'));
});

// ---- S14'/S16' — forcing MINTS the standing item (no item exists between
// occurrences once a decline files nothing), stamped `Woken`; a force that finds
// no work closes with the reason on record, a force that finds work runs.
test("S14' force mints the standing item, stamped Woken; no-go closes with a reason", async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T15:00Z', (s) => s.force('tidy/tidy-issues'));
  await sim.run('2026-08-12T00:00Z', '2026-08-12T18:00Z');

  const minted = sim.log.find((e) => e.kind === 'force' && e.minted);
  assert.ok(minted, 'nothing to wake — the force minted');
  const forced = sim.item(minted.issue);
  assert.equal(forced.woken, T('2026-08-12T15:00Z'), 'the mint is stamped with the wake');
  assert.equal(forced.state, 'closed');
  assert.equal(forced.outcome, 'obsolete', 'the forced ask found no work and said so');
  assert.equal(sim.declineReason(forced.number), 'no issue touched in window',
    'the force reads its answer — the cadence held, the work did not');
  assert.equal(evals(sim, 'tidy/tidy-issues').length, 1, 'the executor evaluated the forced item once');
});

test("S16' force with work present runs immediately, mid-day", async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T14:50Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T14:50Z'); });
  sim.at('2026-08-12T15:00Z', (s) => s.force('tidy/tidy-issues'));
  await sim.run('2026-08-12T00:00Z', '2026-08-12T18:00Z');

  const [done] = closedOf(sim, 'tidy/tidy-issues');
  assert.ok(done && done.closedAt < T('2026-08-12T15:30Z'), 'ran within minutes of the force');
});

// ---- S20 — the task file disappears while its item is open: validate-in-code
// closes the item at the next pick, and a force naming the gone task wakes
// nothing rather than minting for a task that is not at HEAD.
test('S20 removed task: its open item closes obsolete at the next pick; a force finds no owner', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  // filed by the 04:17 tick; gone before the drain it dispatched reaches the item
  sim.at('2026-08-12T04:18:00Z', (s) => s.removeTask('tidy/tidy-issues'));
  sim.at('2026-08-12T10:00Z', (s) => s.force('tidy/tidy-issues'));
  await sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  const fam = own(sim, 'tidy/tidy-issues');
  assert.equal(fam.length, 1, 'and the force minted nothing');
  assert.equal(fam[0].state, 'closed');
  assert.equal(fam[0].outcome, 'obsolete');
  assert.equal(evals(sim, 'tidy/tidy-issues').length, 0, 'validate closed it before any evaluation');
  assert.ok(sim.log.some((e) => e.kind === 'force' && e.unmatched), 'the force matched no declared task');
});

// ---- S30 — a stale issue list let a duplicate standing item through (F16):
// nothing documents REST-list read-your-writes across runs, so the design
// self-heals instead of assuming — the next scheduler run closes every LIVE
// standing item but the oldest.
test('S30 duplicate standing item: the next scheduler run self-heals (F16)', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  // The one open unqualified item a stale list lets through is now simply the
  // minted standing item — F16's fault needs TWO open ones, so inject two. Work
  // appears AFTER the 04:17 tick declined, so nothing else runs today: the
  // survivor's own precondition passes at pick and the only thing that could
  // decline it is its run history.
  let first; let dup;
  sim.at('2026-08-12T04:29Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:29Z'); });
  sim.at('2026-08-12T04:30Z', (s) => { first = s.injectDuplicateStanding('tidy/tidy-issues'); });
  sim.at('2026-08-12T04:31Z', (s) => { dup = s.injectDuplicateStanding('tidy/tidy-issues'); });
  await sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  const twin = sim.item(dup.number);
  assert.equal(twin.state, 'closed');
  assert.equal(twin.outcome, 'obsolete');
  assert.ok(sim.log.some((e) => e.kind === 'dedupe' && e.issue === dup.number));
  // The dedupe is the scheduler's own close: it adds the terminal label and the
  // status the twin waited in stays on — the shape the run history reads as
  // "never picked".
  assert.ok(twin.labels.has(READY) && twin.labels.has('task:status:rejected'), 'the deduped twin wears both');
  // F32: the survivor is judged at pick over its run history, and the deduped
  // twin — closed since the anchor but never picked — is NOT a run there, so the
  // survivor is the period's one run and runs.
  const survivor = sim.item(first.number);
  assert.equal(survivor.state, 'closed');
  assert.equal(survivor.outcome, 'done');
  assert.equal(sim.declineReason(first.number), null, 'the survivor never declined');
});

// ---- S55 — fail-open: signal collection fails for ONE task (the scheduler
// stub holds no fleet credential); its item is created and the executor —
// which holds the credentials — decides at pick. Never fewer runs because a read
// failed — and never MORE asks than the cadence allows: the run-history terms
// are judged first, off the queue the run already holds.
test('S55 signals unavailable for one task: fail-open item, executor decides; the cadence still gates', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.setSignalsUnavailable('basics/baselining');
  // day 2 the executor-side read finds real work
  sim.at('2026-08-13T00:01Z', ({ world }) => { world.mountBehind = true; });
  await sim.run('2026-08-12T00:00Z', '2026-08-14T00:00Z');

  const fam = own(sim, 'basics/baselining');
  assert.equal(fam.length, 2, 'an item per occurrence — fail-open never files fewer');
  const a = asks(sim, 'basics/baselining');
  assert.deepEqual(a.filter((e) => e.verdict === 'fail-open').map((e) => e.t),
    [tick('2026-08-12T04:17Z'), tick('2026-08-13T04:17Z')],
    'failed open exactly where the cadence held — every other tick declined on the run history alone');
  assert.ok(a.filter((e) => e.verdict !== 'fail-open').every((e) => e.verdict === 'no'));
  // day 1: the executor's own evaluation declined, and the item closed
  assert.equal(fam[0].outcome, 'obsolete');
  assert.ok(sim.declineReason(fam[0].number));
  // day 2: the executor's evaluation found the work and ran it
  assert.equal(fam[1].outcome, 'done');
  // the other tasks still decided at every tick and filed nothing
  assert.equal(own(sim, 'tidy/tidy-issues').length, 0);
});

// ---- S57 — a hand-created item racing the tick. An open unqualified item IS
// the standing item and it is LIVE, so the tick does not ask — the scheduler
// neither files a second item beside it nor dedupes it.
test("S57 a hand-minted item preempts the tick's ask; no duplicate, no dedupe", async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:10Z', (s) => s.createItem('tidy/tidy-issues', { eventLost: true }));
  await sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  assert.equal(asks(sim, 'tidy/tidy-issues').filter((e) => e.t === tick('2026-08-12T04:17Z')).length, 0,
    'the open minted item held the lane — the 04:17 tick never asked');
  const fam = own(sim, 'tidy/tidy-issues');
  assert.equal(fam.length, 1, 'no second item was ever filed beside it');
  assert.equal(fam[0].outcome, 'obsolete', 'the executor evaluated the minted item and declined');
  assert.equal(sim.log.filter((e) => e.kind === 'dedupe').length, 0);
  // Once it closed, the later ticks ask again — and the closed item is this
  // period's run, so they decline on the cadence.
  const later = asks(sim, 'tidy/tidy-issues').filter((e) => e.t > fam[0].closedAt);
  assert.ok(later.length === 3 && later.every((e) => /already ran since the daily anchor/.test(e.reason)));
});

// ---- S59 — the verdict flips between the tick's yes and the pick: the
// executor re-evaluates and closes. The tick's answer is never carried forward,
// and the closed item — rejected or not — is this period's run.
test("S59 a go at the tick, a no at pick: the executor's verdict wins, once", async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  // the world changes in the seconds between the scheduler run and its drain
  sim.at('2026-08-12T04:18:00Z', ({ world }) => { world.issueTouchedAt = null; });
  await sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  assert.equal(goes(sim, 'tidy/tidy-issues').length, 1, 'the tick said go and filed the item');
  const it = own(sim, 'tidy/tidy-issues')[0];
  assert.equal(it.outcome, 'obsolete', 'the pick re-derived the world and declined');
  assert.equal(sim.declineReason(it.number), 'no issue touched in window');
  assert.equal(evals(sim, 'tidy/tidy-issues').length, 1, 'one pick-time evaluation');
  // and the rest of the day re-runs nothing: every later tick asks, and the
  // closed item covers the occurrence — a rejected run is still a run for `due:`
  const later = asks(sim, 'tidy/tidy-issues').filter((e) => e.t > it.closedAt && e.t < T('2026-08-13T00:00Z'));
  assert.ok(later.length >= 7 && later.every((e) => e.verdict === 'no'));
  assert.equal(own(sim, 'tidy/tidy-issues').length, 1);

  // …but a rejected item did nothing, so it does NOT move the window: the touch
  // it (transiently) could not see is still inside tomorrow's window, which
  // reaches back to the last run that actually ran — Tuesday's.
  sim.at('2026-08-12T13:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  await sim.run('2026-08-12T12:00Z', '2026-08-13T12:00Z');
  const [tomorrow] = goes(sim, 'tidy/tidy-issues').filter((e) => e.t >= T('2026-08-13T04:00Z'));
  assert.equal(tomorrow?.t, tick('2026-08-13T04:17Z'),
    'found at the next anchor, over a window the rejected item did not shorten');
  assert.equal(closedOf(sim, 'tidy/tidy-issues').filter((i) => i.outcome === 'done').length, 1);
});

// ---- S60 — F31, restated without the board: a go whose item CREATE fails (a
// refused POST) leaves nothing behind — and because nothing durable records the
// go, the next tick simply asks again and creates. A refused write costs one
// tick of latency, never the occurrence.
test('S60 a refused create costs one tick, never the occurrence (F31)', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.at('2026-08-12T04:01Z', (s) => s.failNextCreateOf('tidy/tidy-issues'));
  await sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  assert.ok(sim.log.some((e) => e.kind === 'create-failed'), 'the 04:17 POST was refused');
  const g = goes(sim, 'tidy/tidy-issues');
  assert.deepEqual(g.map((e) => e.t), [tick('2026-08-12T04:17Z'), tick('2026-08-12T05:17Z')],
    'the go was re-asked at the very next tick, and not again once the item existed');
  const [done] = closedOf(sim, 'tidy/tidy-issues');
  assert.ok(done && done.createdAt === tick('2026-08-12T05:17Z') && done.outcome === 'done',
    'the work ran one tick late — never fewer runs because a write failed');
});

// ---- S29 — bootstrap into a repo with old-mechanism issues: the disjoint title
// family means the scheduler run neither reads nor touches them.
test('S29 old-vocabulary issues are invisible to the new mechanism', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  let relic;
  sim.at('2026-08-12T00:05Z', (s) => {
    relic = s.foreignIssue('[claudinite-task] basics/baselining d2026-08-11');
  });
  await sim.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  const it = sim.item(relic.number);
  assert.equal(it.state, 'open', 'the relic is untouched');
  assert.deepEqual([...it.labels], ['agent-dispatch'], 'no label was added or removed');
  assert.equal(it.comments.length, 0);
  assert.ok(asks(sim, 'basics/baselining').length >= 1,
    'the new mechanism asked its own question beside the relic, undisturbed');
  assert.ok(asks(sim, 'basics/baselining').every((e) => e.verdict === 'no'), 'and the relic is not a run of it');
});

// ---- M. The label vocabulary (#1119): the engine writes the canonical
// `task:status:`/`task:origin:` spellings and decodes every spelling a fielded
// engine ever wrote. Two directions, both artifact-level.

const labelsOf = (it) => [...it.labels].sort();

// ---- S61 — one item's whole life, read off the label artifact: the origin at
// birth, one mutually-exclusive status per phase, the terminal status AND the
// origin on the closed issue. Nothing else, at any point.
test('S61 the emitted labels: origin at birth, one status per phase, terminal + origin at close', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  const seen = [];
  const it = () => own(sim, 'tidy/tidy-issues')[0];
  sim.at('2026-08-12T04:18:00Z', () => seen.push(labelsOf(it())));  // filed at the tick's ask
  sim.at('2026-08-12T04:18:30Z', () => seen.push(labelsOf(it())));  // claimed by the drain
  await sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  assert.deepEqual(seen[0], ['task:origin:planned', 'task:status:waiting-for-executor'],
    'born ready, wearing the planned origin — the generator says what it filed');
  assert.deepEqual(seen[1], ['task:origin:planned', 'task:status:running-executor'],
    'the claim swaps the one status; the origin never moves');
  const closed = it();
  assert.equal(closed.state, 'closed');
  assert.deepEqual(labelsOf(closed), ['task:origin:planned', 'task:status:done'],
    'the terminal status goes ON at close, and the closed issue keeps its origin');
  assert.equal(closed.woken, null, "the scheduler's own item carries no Woken stamp");
});

// ---- S62 — the decode direction: open items a FIELDED engine left behind,
// wearing the old vocabulary. The scheduler and executor must react to them as
// to their own — and the first transition the new engine writes comes out
// canonical, which is how the fleet converges with no mass relabel.
test('S62 legacy-labeled items drain; the first write canonicalizes; a legacy pair still routes', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  let legacy;
  sim.at('2026-08-12T05:00Z', (s) => {
    legacy = s.legacyIssue('fleet/fleet-baseline', ['task:ready'], { qualifier: 'o/member' });
  });
  await sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  const it = sim.item(legacy.number);
  assert.equal(it.state, 'closed', 'the old-vocabulary item was picked and driven to its end');
  assert.ok(!it.labels.has('task:ready'), 'the first transition cleared the legacy spelling');
  assert.ok(it.labels.has('task:status:done'), 'and every write after it is canonical');
});

// ---- S62b — the legacy park PAIR routes by its sub-label: an approval park
// from the old engine holds nobody's lane (the next occurrence still files),
// while a BARE legacy `needs-human` — kind unknown — decodes as failure, which
// holds the lane of a task declaring `last-run-not-failed`.
test('S62b a legacy approval pair spares the lane; a bare legacy park reads as failure and holds it', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:30Z', (s) => {
    s.updateTask('gcec/create-extractor', { preconditions: ['due:daily', 'last-run-not-failed'] });
    s.legacyIssue('tidy/tidy-issues', ['needs-human', 'task:needs-human-approval']);
    s.legacyIssue('gcec/create-extractor', ['needs-human']);
    s.world.issueTouchedAt = T('2026-08-12T04:00Z');
    s.world.requestAt = T('2026-08-12T04:00Z');
  });
  await sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  const tidy = own(sim, 'tidy/tidy-issues');
  assert.equal(tidy.length, 2, 'the approval pair did not consume the lane — the 04:17 occurrence filed beside it');
  assert.ok(tidy.some((i) => i.state === 'closed' && i.labels.has('task:status:done')), 'and it ran');
  assert.ok(tidy.some((i) => i.state === 'open'), 'while the legacy park sat untouched, its PR still in review');
  assert.equal(own(sim, 'gcec/create-extractor').length, 1,
    'the bare park holds the lane: no occurrence files behind it');
  assert.ok(asks(sim, 'gcec/create-extractor').filter((e) => e.t > T('2026-08-12T04:00Z'))
    .every((e) => /failure park/.test(e.reason)), "declined by the task's own term, reading the decoded kind");
});

// ---- S63 — a kind this engine does not know (a future writer, a typo) reads
// as failure — the unclassifiable park must not silently join an inbox lane
// nobody treats as urgent.
test('S63 an unknown park kind decodes as failure and holds the lane of a task that declares it', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:30Z', (s) => {
    s.updateTask('tidy/tidy-issues', { preconditions: ['due:daily', 'last-run-not-failed'] });
    s.legacyIssue('tidy/tidy-issues', ['needs-human', 'task:needs-human-shrugged']);
    s.world.issueTouchedAt = T('2026-08-12T04:00Z');
  });
  await sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');
  assert.equal(own(sim, 'tidy/tidy-issues').length, 1,
    'the unknown kind blocked the lane — no new occurrence behind an unread trace');
});

// ---- backlog guard — a failure park holds the task's lane ONLY where the task
// says so: `last-run-not-failed` is the task's own declaration, never the
// engine's.
test('backlog guard: a failure park holds the lane only for a task declaring last-run-not-failed', async () => {
  const held = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  held.at('2026-08-12T00:01Z', ({ world }) => { world.mountBehind = true; world.mountBroken = true; });
  await held.run('2026-08-12T00:00Z', '2026-08-14T00:00Z');

  const fam = own(held, 'basics/baselining');
  assert.equal(fam.length, 1, 'no second item while the failure park sits open');
  assert.ok(fam[0].parked && fam[0].labels.has(NH('failure')));
  assert.equal(evals(held, 'basics/baselining').length, 1, 'not re-run while broken');
  // The park does not silence the ask: every later tick still asks. For the rest
  // of Wednesday `due:daily` declines first — the parked item IS this period's
  // run — and from Thursday's anchor on it is the task's own
  // `last-run-not-failed` that declines, reading the park.
  const after = asks(held, 'basics/baselining').filter((e) => e.t > T('2026-08-12T05:00Z'));
  assert.ok(after.length >= 40 && after.every((e) => e.verdict === 'no'));
  assert.ok(after.filter((e) => e.t < T('2026-08-13T04:00Z')).every((e) => /already ran since the daily anchor/.test(e.reason)));
  const thursday = after.filter((e) => e.t >= T('2026-08-13T04:00Z'));
  assert.ok(thursday.length >= 19 && thursday.every((e) => /failure park/.test(e.reason)));

  // The contrast: strip the term and the next anchor files beside the park — a
  // parked item is not live, and nothing in the engine holds a lane by itself.
  const open = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  open.at('2026-08-12T00:01Z', (s) => {
    s.updateTask('basics/baselining', { preconditions: ['due:daily'] });
    s.world.mountBehind = true; s.world.mountBroken = true;
  });
  await open.run('2026-08-12T00:00Z', '2026-08-14T00:00Z');
  const beside = own(open, 'basics/baselining');
  assert.equal(beside.length, 2, "Thursday's occurrence was filed beside Wednesday's park");
  assert.ok(beside.every((i) => i.parked), 'and broke the same way — two parks, one cause');
});

// ---- S70 — THE DOOR, for a retired FIELD (#1725). `frequency` is retired: a
// task's cadence is one of its own preconditions. A member's task file is its own
// data that no vendoring pass rewrites, so a declaration still carrying the field
// must keep working — it reads, where it LOADS, as the cadence term it always
// meant, and nothing downstream ever sees the field.
test('S70 the door: a retired `frequency` field reads as its cadence term at load; a retired spelling is refused', async () => {
  const sim = makeSim({ tasks: [
    { id: 'x/daily', frequency: 'daily', codeWorkMinutes: 1, precondition: () => ({ run: true }) },
    { id: 'x/weekly', frequency: 'weekly', preconditions: ['none', 'last-run-not-failed'], codeWorkMinutes: 1 },
    { id: 'x/manual', frequency: 'manual', codeWorkMinutes: 1 },
    { id: 'x/stated', frequency: 'daily', preconditions: ['due:daily'], codeWorkMinutes: 1 },
  ] }).seedSteadyState('2026-08-12T00:00Z');
  await sim.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  // what passed the door: the term first, the empty `none` gone, the field gone
  assert.deepEqual(sim.task('x/daily').decl.preconditions, ['due:daily', 'gate']);
  assert.deepEqual(sim.task('x/weekly').decl.preconditions, ['due:weekly', 'last-run-not-failed']);
  assert.deepEqual(sim.task('x/manual').decl.preconditions, [], '`manual` meant no schedule and adds no term');
  assert.deepEqual(sim.task('x/stated').decl.preconditions, ['due:daily'], 'a term already stated is not doubled');
  for (const id of ['x/daily', 'x/weekly', 'x/manual', 'x/stated']) assert.equal(sim.task(id).decl.frequency, undefined);
  // and the loaded declaration behaves as its term: a daily task asked at every
  // tick and run once at its anchor, a `manual` one — stating nothing — never asked
  assert.equal(goes(sim, 'x/daily').length, 1);
  assert.equal(closedOf(sim, 'x/daily').length, 1);
  assert.equal(asks(sim, 'x/manual').length, 0);
  assert.equal(sim.family('x/manual').length, 0);

  // The door passes no retired spelling: the legacy map is empty, and a token the
  // calendar has no anchor for is refused where the declaration loads.
  for (const retired of ['hourly', 'daily-2h', 'daily-1h', 'daily+1h']) {
    assert.throws(() => makeSim({ tasks: [{ id: 'x/r', frequency: retired }] }),
      new RegExp(retired.replace('+', '\\+')), `${retired} is refused`);
  }
});

// ---- S72 — a `Not-before` releasing BETWEEN ticks. Deferred work is stamped
// with an instant, not an anchor, so it can fall anywhere in the gap. It waits
// for the next tick — and must not be escalated for waiting, since the janitor's
// stale bounds count in the task's own periods.
test('S72 a Not-before falling between ticks waits for the next tick, and is not escalated for it', async () => {
  const sim = makeSim({ tasks: cast(), cronHours: [4, 16] }).seedSteadyState('2026-08-12T00:00Z');
  let deferred;
  // released at 09:00 — five hours after one tick, seven before the next. An item
  // of a task off the schedule: its empty expression holds at pick, so the wait is
  // the only thing the pick has to say about it.
  sim.at('2026-08-12T04:30Z', (s) => {
    deferred = s.createItem('fleet/fleet-baseline', { notBefore: T('2026-08-12T09:00Z'), qualifier: 'deferred' });
  });
  await sim.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  const item = sim.item(deferred.number);
  assert.equal(item.state, 'closed', 'the deferred item ran');
  assert.equal(item.outcome, 'done');
  // Readied by the 16:17 tick, not at 09:00 and not by a drain that happened to be
  // running: releasing a Not-before is the scheduler run's job, like adoption.
  assert.equal(sim.log.find((e) => e.kind === 'ready' && e.issue === item.number).t, tick('2026-08-12T16:17Z'));
  assert.ok(item.closedAt >= tick('2026-08-12T16:17Z'), 'it waited for the tick, not the instant');
  // Seven hours blocked is normal under this cadence and must read as normal — an
  // escalation here would park every deferred item the queue holds.
  assert.equal(sim.log.filter((e) => e.kind === 'escalate').length, 0);
});

// ---- N. The executor: the lease, the leash, the heartbeat and the hold -------

// ---- S8 — a dead executor's claim is reclaimed by the scheduler run's leash
// and the item is simply re-picked; code-work re-entrancy is the contract.
test('S8 dead executor: leash reclaim, re-pick, converge', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.at('2026-08-12T04:01Z', (s) => s.crashNextExecutionOf('tidy/tidy-issues'));
  await sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  assert.equal(sim.log.filter((e) => e.kind === 'reclaim' && e.task === 'tidy/tidy-issues').length, 1);
  const [done] = closedOf(sim, 'tidy/tidy-issues');
  assert.ok(done, 'converged after the reclaim');
  assert.ok(done.closedAt > T('2026-08-12T05:17Z'), 'recovery cost is the leash, not a day');
});

// ---- S7 — two executors race for one item: the verified lease, stale read and
// all. The loser reverts nothing and picks a different item.
test('S7 executor race: earliest claim wins, loser takes the next item', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => {
    world.issueTouchedAt = T('2026-08-12T04:00Z'); // tidy-issues has work
    world.releasePending = true;                   // store-release has work
  });
  sim.dropSchedulerRuns('2026-08-12T04:00Z', '2026-08-12T05:00Z');
  sim.schedulerRunAt('2026-08-12T04:17Z');                   // creates both items; the race lands
  sim.raceExecutorsAt('2026-08-12T04:17:50Z', ['E1', 'E2']); // just before its drain
  await sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  const losses = sim.log.filter((e) => e.kind === 'claim-lost');
  assert.equal(losses.length, 1, 'exactly one loser');
  const raced = losses[0];
  assert.ok(sim.log.some((e) => e.kind === 'claim' && e.issue === raced.issue && e.t === raced.t),
    'the rival claimed the same item at the same instant');
  assert.equal(sim.log.filter((e) => e.kind === 'evaluate' && e.issue === raced.issue && e.t === raced.t).length,
    1, 'the raced item was executed once at that instant, by the winner');
  assert.equal(closedOf(sim, 'tidy/tidy-issues').length + closedOf(sim, 'chrome/store-release').length,
    2, 'both items converged — the loser moved on, capacity added not lost');
});

// ---- S15 — a same-title twin while the scheduled item is mid-execution: the
// same-title mutex makes it wait, not run beside it. An unqualified duplicate is
// an unsanctioned creation — the wake lever is the sanctioned impatience — but a
// write-gated human can always make one, and the mutex must still serialize it.
test('S15 force-while-executing: the mutex queues the twin', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  // 04:20: the agent is mid-run (16m); an impatient operator creates a twin
  let twin;
  sim.at('2026-08-12T04:20Z', (s) => { twin = s.createItem('tidy/tidy-issues', { urgent: true }); });
  await sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  const scheduled = own(sim, 'tidy/tidy-issues').find((i) => i.number !== twin.number);
  const twinEval = sim.log.find((e) => e.kind === 'evaluate' && e.issue === twin.number);
  assert.ok(twinEval.t >= scheduled.closedAt, 'the twin waited for the scheduled run to converge');
  assert.equal(sim.item(twin.number).state, 'closed', 'then had its own verdict');
  // An unstamped hand-made twin is judged on the cadence over the task's other
  // runs, and the scheduled item IS this period's run.
  assert.equal(sim.item(twin.number).outcome, 'obsolete');
  assert.match(sim.declineReason(twin.number), /already ran since the daily anchor/);
});

// ---- S16 — urgent item, lost label event: the scheduler run's drain is the
// guarantee; worst-case latency is one scheduler interval, not a day.
test('S16 lost label event: the poll picks it up within a scheduler run', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  let it;
  sim.at('2026-08-12T14:00Z', (s) => { it = s.createItem('fleet/fleet-baseline', { urgent: true, eventLost: true, qualifier: 'o/member' }); });
  await sim.run('2026-08-12T12:00Z', '2026-08-12T16:00Z');

  const evalAt = sim.log.find((e) => e.kind === 'evaluate' && e.issue === it.number);
  assert.ok(evalAt, 'picked without any event');
  assert.ok(evalAt.t >= tick('2026-08-12T14:17Z') && evalAt.t <= tick('2026-08-12T14:19Z'),
    'at the next scheduler run drain — events are latency sugar, listing is the guarantee');
  assert.equal(sim.item(it.number).outcome, 'done',
    'an ad-hoc item of a task off the schedule runs — its empty expression holds at pick');
});

// ---- S17 — delayed validation: Blocked-by + Not-before, then the pick verdict
// decides — obsolete when the world settled, a run when it did not.
test('S17 follow-up validates on day 3, closes obsolete when all landed', async () => {
  const tasks = cast().concat([{
    id: 'chrome/store-validate', codeWorkMinutes: 1, agentMinutes: 5,
    precondition: (w) => ({ run: !!w.storeRejected, reason: 'v2.4 live — landed on its own' }),
  }]);
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  let followUp;
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.releasePending = true; });
  sim.at('2026-08-12T04:25Z', (s) => { // code_work delivered; create the follow-up
    const parent = own(s, 'chrome/store-release')[0];
    followUp = s.createItem('chrome/store-validate', {
      blockedBy: [parent.number], notBefore: T('2026-08-14T04:00Z'),
    });
  });
  await sim.run('2026-08-12T00:00Z', '2026-08-15T00:00Z');

  const evalsOf = sim.log.filter((e) => e.kind === 'evaluate' && e.issue === followUp.number);
  assert.equal(evalsOf.length, 1, 'untouched until its day');
  assert.ok(evalsOf[0].t >= T('2026-08-14T04:00Z'), 'not before Day 3 04:00');
  assert.equal(sim.item(followUp.number).state, 'closed');
  assert.equal(sim.item(followUp.number).outcome, 'obsolete', 'the world settled on its own');
});

test('S17b follow-up finds the store rejected the release, and runs', async () => {
  const tasks = cast().concat([{
    id: 'chrome/store-validate', codeWorkMinutes: 1, agentMinutes: 5,
    precondition: (w) => ({ run: !!w.storeRejected, reason: 'v2.4 live' }),
  }]);
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  let followUp;
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.releasePending = true; });
  sim.at('2026-08-12T04:25Z', (s) => {
    const parent = own(s, 'chrome/store-release')[0];
    followUp = s.createItem('chrome/store-validate', {
      blockedBy: [parent.number], notBefore: T('2026-08-14T04:00Z'),
    });
  });
  sim.at('2026-08-13T10:00Z', ({ world }) => { world.storeRejected = true; });
  await sim.run('2026-08-12T00:00Z', '2026-08-15T00:00Z');

  assert.equal(sim.item(followUp.number).state, 'closed');
  assert.equal(sim.item(followUp.number).outcome, 'done', 'the agent investigated the rejection');
});

// ---- S18 — fan-out with a fan-in, one member stuck: qualifiers parallelize,
// the stale-ready rule surfaces the stuck member, the stuck-dependency rule (F14)
// surfaces the starving fan-in, and a human close unsticks everything.
test('S18 fan-out: stuck member escalates, fan-in proceeds after the human acts', async () => {
  const tasks = cast().concat([{ id: 'fleet/fleet-status', codeWorkMinutes: 2 }]);
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-10T00:00Z');
  const members = [];
  let fanIn;
  sim.at('2026-08-10T09:00Z', (s) => {
    for (const m of ['repo-a', 'repo-b', 'repo-x']) {
      members.push(s.createItem('fleet/fleet-baseline', { qualifier: m }));
    }
    fanIn = s.createItem('fleet/fleet-status', { blockedBy: members.map((i) => i.number) });
    s.quarantine(members[2].number); // repo-x's executor is broken
  });
  // day 3: a human writes the stuck member off
  sim.at('2026-08-13T09:00Z', (s) => s.closeByHand(members[2].number));
  await sim.run('2026-08-10T00:00Z', '2026-08-14T00:00Z');

  assert.equal(sim.item(members[0].number).state, 'closed');
  assert.equal(sim.item(members[1].number).state, 'closed', 'distinct qualifiers ran in parallel (no mutex)');
  assert.ok(sim.log.some((e) => e.rule === 'stale-ready' && e.issue === members[2].number),
    'the unreachable member came out of the queue as a human problem');
  assert.ok(sim.log.some((e) => e.rule === 'stuck-dependency' && e.issue === fanIn.number),
    'the starving fan-in was surfaced too (F14)');
  assert.equal(sim.item(fanIn.number).state, 'closed');
  assert.equal(sim.item(fanIn.number).outcome, 'done', 'and proceeded by itself once the human closed the member');
});

// ---- S19 — human re-queues after fixing the cause: the whole path from
// needs-human back to execution. The force wakes the parked item — stamped
// `Woken`, so the cadence holds at pick — and `last-run-not-failed` reads the
// task's OTHER runs, none of which failed.
test('S19 re-queue after a fix: needs-human -> ready -> normal run', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => { world.mountBehind = true; world.mountBroken = true; });
  // Tuesday: the owner fixes the mount and re-queues via the force lever
  sim.at('2026-08-13T09:00Z', (s) => { s.world.mountBroken = false; return s.force('basics/baselining'); });
  await sim.run('2026-08-12T00:00Z', '2026-08-13T12:00Z');

  const fam = own(sim, 'basics/baselining');
  assert.equal(fam.length, 1);
  assert.equal(fam[0].woken, T('2026-08-13T09:00Z'), 'the wake is stamped on the item it woke');
  assert.equal(fam[0].state, 'closed');
  assert.equal(fam[0].outcome, 'done', 'the same item converged after the fix — no new item was ever needed');
});

// ---- S33 — a converge writes only to the item it holds (#1373): resolving the
// fan-in's last Blocked-by edge is not the closing side's business. The scheduler
// run's own readiness job is the only thing that ever readies it.
test('S33 fan-in waits for the scheduler run to ready it, not the closing side', async () => {
  const tasks = cast().concat([{ id: 'fleet/fleet-status', codeWorkMinutes: 2 }]);
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  const members = [];
  let fanIn;
  sim.at('2026-08-12T09:00Z', (s) => {
    for (const m of ['repo-a', 'repo-b']) members.push(s.createItem('fleet/fleet-baseline', { qualifier: m }));
    fanIn = s.createItem('fleet/fleet-status', { blockedBy: members.map((i) => i.number) });
  });
  await sim.run('2026-08-12T00:00Z', '2026-08-12T14:00Z');

  const lastMemberClose = Math.max(...members.map((i) => sim.item(i.number).closedAt));
  const readied = sim.log.find((e) => e.kind === 'ready' && e.issue === fanIn.number);
  // the next scheduler tick at or after the last blocker closed, never sooner
  assert.ok(readied.t > lastMemberClose, "readied at the scheduler run's own next pass, not the close");
  assert.ok(readied.t - lastMemberClose <= 3_600_000, 'and at the very next one');
  assert.equal(sim.item(fanIn.number).state, 'closed');
  assert.equal(sim.item(fanIn.number).outcome, 'done');
});

// ---- S31 — the leash under long work (F17, reframed): the work step IS the
// work — long, crash-prone, often the whole task — so the leash must not have to
// exceed every task's work bound. Heartbeat comments during the work step keep a
// LIVE executor's item out of the reclaim however long the work runs.
test('S31 heartbeat interval >= executing leash is refused at wiring (F17 reframed)', () => {
  assert.throws(
    () => makeSim({ tasks: cast(), heartbeatMinutes: 90 }),
    /reaches the executing leash — F17/);
});

test('S31b the livelock heartbeats prevent: silent long work reclaimed alive, forever', async () => {
  const tasks = [{
    id: 'x/slow', preconditions: ['due:daily'], codeWorkMinutes: 130, // > 1h leash
    precondition: () => ({ run: true }),
  }];
  const sim = makeSim({ tasks, heartbeatsDisabled: true }).seedSteadyState('2026-08-12T00:00Z');
  await sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  // worse than one duplicate run — a LIVELOCK: every tenure is reclaimed before
  // it can finish, the work re-executes each cycle, nothing converges
  assert.ok(sim.log.filter((e) => e.kind === 'reclaim').length >= 3, 'reclaimed again and again');
  assert.ok(evals(sim, 'x/slow').length >= 3, 'the work re-executed each cycle');
  assert.equal(closedOf(sim, 'x/slow').length, 0, 'and the occurrence NEVER converges');
});

test('S31c long work with heartbeats: never reclaimed alive, converges once', async () => {
  const tasks = [{
    id: 'x/slow', preconditions: ['due:daily'], codeWorkMinutes: 130, // > 1h leash — legal now
    precondition: () => ({ run: true }),
  }];
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  await sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  assert.equal(sim.log.filter((e) => e.kind === 'reclaim').length, 0, 'no reclaim of a live run');
  assert.ok(sim.log.filter((e) => e.kind === 'heartbeat').length >= 8,
    'the item timeline stayed live throughout (a heartbeat every 15m of a 130m run)');
  assert.equal(closedOf(sim, 'x/slow').length, 1, 'one execution, one outcome');
});

test('S31d dead executor mid-long-work: recovery is bounded by the leash, not the work', async () => {
  const tasks = [{
    id: 'x/slow', preconditions: ['due:daily'], codeWorkMinutes: 130,
    precondition: () => ({ run: true }),
  }];
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', (s) => s.crashDuringWorkOf('x/slow', 40)); // dies 40m in
  await sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  const crash = sim.log.find((e) => e.kind === 'executor-crash');
  const reclaim = sim.log.find((e) => e.kind === 'reclaim');
  assert.ok(crash && reclaim, 'died, then reclaimed');
  // last heartbeat was at +30m; the leash (1h) reclaims from there at a scheduler
  // run — hours, not the 130m work bound plus anything
  assert.ok(reclaim.t - crash.t <= 2 * 3_600_000, 'reclaimed within ~leash+scheduler run of the death');
  assert.equal(closedOf(sim, 'x/slow').length, 1, 're-picked and converged (the work step is re-entrant)');
});

// ---- S36 — the broken train: five tasks with work, and the one drain run DIES
// mid-work partway through its batch. The items it already settled stay settled,
// its run-end is never written (the record died with the runner), and the
// workflow's failure-continuation job re-dispatches on a fresh runner.
test('S36 dead run mid-queue: failure-redispatch keeps the train moving; the leash recovers the item', async () => {
  const tasks = ['c1', 'c2', 'c3', 'c4', 'c5'].map((n) => ({
    id: `x/${n}`, preconditions: ['due:daily'], codeWorkMinutes: 5,
    precondition: () => ({ run: true }),
  }));
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', (s) => s.crashDuringWorkOf('x/c3', 2)); // dies 2m into its work
  await sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  const crash = sim.log.find((e) => e.kind === 'executor-crash');
  assert.ok(crash, 'one run died mid-work');
  assert.ok(sim.log.some((e) => e.kind === 'executor-run' && e.trigger === 'failure-redispatch'),
    'the failure-continuation job re-dispatched a fresh run');
  // the four unaffected items drained within the hour of the death — no item
  // except the crashed one waited for the next cron fire
  for (const t of tasks.filter((x) => x.id !== 'x/c3')) {
    const [done] = closedOf(sim, t.id);
    assert.ok(done, `${t.id} converged`);
    assert.ok(done.closedAt < T('2026-08-12T05:00Z'), `${t.id} did not wait out the hour`);
  }
  // the crashed item: reclaimed by the leash (from its last activity), then
  // re-picked and converged — recovery bounded by leash + scheduler run
  assert.equal(sim.log.filter((e) => e.kind === 'reclaim' && e.task === 'x/c3').length, 1);
  const [c3] = closedOf(sim, 'x/c3');
  assert.ok(c3, 'the crashed item converged after the reclaim');
  assert.ok(c3.closedAt > crash.t + 60 * 60e3 - 1, 'its recovery cost was the leash, nothing less');
  // the dead run wrote no run-end — the record died with the runner — so
  // completed runs outnumber run-ends by exactly the one death
  const runs = sim.log.filter((e) => e.kind === 'executor-run');
  const ends = sim.log.filter((e) => e.kind === 'run-end');
  assert.equal(runs.length - ends.length, 1, 'exactly one run died recordless');
});

// ---- S37 — the operator hold: CLAUDINITE_TASKS_SUSPEND_ALL set mid-morning.
// Every workflow exits at its first act; a drain already in flight finishes the
// batch it started with (the hold reaches a run through the env bag it starts
// with, hold.mjs); items nothing picked freeze exactly where they were.
test('S37 suspend-all: workflows exit at start, the queue freezes in place', async () => {
  const tasks = ['c1', 'c2', 'c3', 'c4', 'c5'].map((n) => ({
    id: `x/${n}`, preconditions: ['due:daily'], codeWorkMinutes: 5,
    precondition: () => ({ run: true }),
  }));
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  const AT = T('2026-08-12T04:30Z');
  sim.at('2026-08-12T04:30Z', (s) => s.suspendAll());
  await sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z'); // no resume in this window

  // suspension gates STARTS, not running work: no run begins after the hold…
  assert.ok(sim.log.some((e) => e.kind === 'close' && e.t < AT), 'the morning had started');
  assert.equal(sim.log.filter((e) => e.kind === 'executor-run' && e.t >= AT).length, 0, 'no executor run started after the hold');
  // …and every evaluation after it belongs to the one drain already in flight,
  // which ends when its batch does
  const inFlightEnd = Math.max(...sim.log.filter((e) => e.kind === 'run-end' && e.t >= AT).map((e) => e.t));
  const evaluated = sim.log.filter((e) => e.kind === 'evaluate');
  assert.ok(evaluated.some((e) => e.t >= AT), 'the in-flight drain kept its batch');
  for (const e of evaluated) assert.ok(e.t <= inFlightEnd, `#${e.issue} evaluated after the in-flight drain ended`);
  // the parked runs are visible, workflow by workflow
  const skips = sim.log.filter((e) => e.kind === 'suspended-skip');
  assert.ok(skips.filter((e) => e.workflow === 'scheduler-run').length >= 3, 'every cron fire exited at start');
  // and the queue is frozen, not lost: every never-picked item still sits ready
  const openReady = sim.issues.filter((i) => !i.seeded && i.state === 'open');
  assert.equal(openReady.length, 5 - new Set(evaluated.map((e) => e.issue)).size, 'unpicked items all survived the hold');
  for (const it of openReady) assert.ok(it.labels.has(READY), `#${it.number} froze as ready`);
});

// ---- S38 — cancel + suspend, then resume: the user cancels a stalled run, then
// suspends the queue before the continuation lands, and later resumes by clearing
// the variable — the next cron scheduler run alone self-heals everything.
test('S38 resume after a hold: clearing the variable + the next scheduler run recovers everything', async () => {
  const tasks = [
    { id: 'x/slow', preconditions: ['due:daily'], codeWorkMinutes: 30, precondition: () => ({ run: true }) },
    { id: 'x/quick', preconditions: ['due:daily'], codeWorkMinutes: 3, precondition: () => ({ run: true }) },
  ];
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  // the user cancels x/slow's run 5 minutes into its work…
  sim.at('2026-08-12T04:00Z', (s) => s.crashDuringWorkOf('x/slow', 5));
  // …and suspends everything moments later, before the continuation job's
  // re-dispatch lands — intent 2 overrides intent 1's train
  sim.at('2026-08-12T04:23Z', (s) => s.suspendAll());
  sim.at('2026-08-12T10:00Z', (s) => s.resumeAll()); // clear the variable; no manual dispatch
  await sim.run('2026-08-12T00:00Z', '2026-08-12T14:00Z');

  const hold = [T('2026-08-12T04:23Z'), T('2026-08-12T10:00Z')];
  assert.equal(sim.log.filter((e) => e.kind === 'evaluate' && e.t >= hold[0] && e.t < hold[1]).length,
    0, 'the hold held');
  // after clearing the variable, the 10:17 cron scheduler run alone recovers: it
  // reclaims the cancelled run's silent claim and its drain converges the queue
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

// ---- S32 — the pick-filter race (F15): two executors, same live queue, each
// claims a DIFFERENT item of the same title. The per-item lease cannot see it;
// only the post-claim re-verify serializes the pair.
test('S32 twin-title race: post-claim re-verify serializes, later claim reverts', async () => {
  // scoped cast: the scenario is about one title's twins racing
  const tasks = cast().filter((t) => t.id === 'fleet/fleet-baseline');
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:16:20Z', (s) => {
    s.createItem('fleet/fleet-baseline', { urgent: true, eventLost: true, qualifier: 'twin' });
    s.createItem('fleet/fleet-baseline', { urgent: true, eventLost: true, qualifier: 'twin' }); // the twin
  });
  sim.raceExecutorsAt('2026-08-12T04:16:35Z', ['E1', 'E2']); // before the 04:17 drain
  await sim.run('2026-08-12T00:00Z', '2026-08-12T12:00Z');

  // no instant ever had two same-title items in execution
  const twinEvals = sim.log.filter((e) => e.kind === 'evaluate' && e.task === 'fleet/fleet-baseline');
  const times = twinEvals.map((e) => e.t);
  assert.equal(new Set(times).size, times.length, 'the twins were never evaluated at the same instant');
  // and BOTH still converged — a reverted or lost claim is re-claimed in a fresh
  // episode (F18) and simply waits its turn
  const twins = sim.issues.filter((i) => !i.seeded);
  assert.equal(twins.length, 2, 'both twins were instantiated');
  for (const it of twins) {
    assert.equal(it.state, 'closed', `#${it.number} converged`);
    assert.equal(it.outcome, 'done', `#${it.number} ran — an empty expression holds at pick`);
  }
});

// ---- S39b — the episode boundary must survive an episode that ended SILENTLY
// (F24). The second attempt MUST come from a different executor: a single
// executor beats its own stale claim by identity.
test('S39b a parked item a human re-queues is claimable by another executor at once (F24)', async () => {
  const tasks = cast().filter((t) => t.id === 'basics/baselining');
  const sim = makeSim({ tasks }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:00Z', ({ world }) => { world.mountBehind = true; world.mountBroken = true; });
  await sim.run('2026-08-12T00:00Z', '2026-08-12T06:00Z');

  const parked = sim.issues.find((i) => i.parked);
  assert.ok(parked, 'the work step failed, so the item parked for a human');

  // The sanctioned re-queue and nothing else: strip the park, apply ready. No
  // marker, no cleanup — the strike already happened.
  sim.at('2026-08-12T07:00Z', (s) => { s.world.mountBroken = false; return s.requeue(parked.number); });
  sim.raceExecutorsAt('2026-08-12T07:00:30Z', ['E2']);
  await sim.run('2026-08-12T06:00Z', '2026-08-12T14:00Z');

  assert.deepEqual(sim.log.filter((e) => e.kind === 'claim-lost'), [],
    're-queued work must be claimable — a claim standing from the parked episode livelocks it forever');
  assert.ok(sim.log.some((e) => e.kind === 'claim' && e.exec === 'E2'), 'E2 held the item');
});

// ---- S41 — the worker's own triage verdict, and what the executor does with it.
test('S41 a worker that names its failure class parks there, not at failure', async () => {
  const sim = makeSim({ tasks: [SEEDS] });
  sim.at('2026-08-12T00:00Z', ({ world }) => { world.patScopeMissing = true; });
  await sim.run('2026-08-12T00:00Z', '2026-08-13T12:00Z');

  const parked = sim.issues.find((i) => i.taskId === 'fleet/fleet-seeds' && i.parked);
  assert.ok(parked, 'the failing run parked');
  // A RUN THAT FAILED PARKS `failure`, whatever the worker asked for (#1452): a
  // worker naming `action` would otherwise put a failed run in a NON-blocking lane
  // and the task would re-file the next day against a cause nobody had fixed. The
  // verdict is not discarded — it is carried into the park's comment, where a
  // person reads it.
  assert.equal(parked.parkKind, 'failure', 'the lane the failure holds, not the one the worker asked for');
  assert.equal([...parked.labels].filter((l) => l.startsWith('task:status:needs-human-')).length, 1,
    'and only one sub-label');
  assert.match(parked.comments.at(-1).body, /The worker asks for: \*\*action\*\*/,
    "the worker's own verdict reaches the person, as instruction rather than as routing");
  assert.ok(sim.log.some((e) => e.kind === 'work-failed'));
});

// A worker that says nothing is the compatibility case — every worker written
// before the marker existed. An unexplained break is a break — and whether it
// holds the task's lane is the task's own declaration.
test('S41b a worker that says nothing parks at failure; the lane is held only where the task says so', async () => {
  const holding = makeSim({ tasks: [{ ...SEEDS, codeWorkTriage: undefined, preconditions: ['due:daily', 'last-run-not-failed'] }] });
  holding.at('2026-08-12T00:00Z', ({ world }) => { world.patScopeMissing = true; });
  await holding.run('2026-08-12T00:00Z', '2026-08-14T12:00Z');

  const fam = holding.family('fleet/fleet-seeds');
  const parked = fam.find((i) => i.parked);
  assert.equal(parked.parkKind, 'failure');
  assert.equal(fam.length, 1,
    'the lane is held — two days of anchors passed and nothing was filed behind it');

  // Without the term the same failure parks the same way, and every anchor files
  // the next occurrence beside it: the engine holds no lane by itself.
  const open = makeSim({ tasks: [{ ...SEEDS, codeWorkTriage: undefined }] });
  open.at('2026-08-12T00:00Z', ({ world }) => { world.patScopeMissing = true; });
  await open.run('2026-08-12T00:00Z', '2026-08-14T12:00Z');
  assert.ok(open.family('fleet/fleet-seeds').length >= 3, 'one park per anchor, none holding the next');
});

// ---- S42 — the approval park: succeeded, and waiting on a reviewer. The one
// park that is not a fault. It stays OPEN, and it does NOT hold the lane.
test('S42 a run that left an unmerged PR parks open for approval and keeps its schedule', async () => {
  const sim = makeSim({ tasks: [REGENERATE] });
  await sim.run('2026-08-12T00:00Z', '2026-08-14T12:00Z');

  const fam = sim.family('site/regenerate');
  const parked = fam.filter((i) => i.labels.has(NH('approval')));
  assert.ok(parked.length >= 1, 'the delivering run parked for approval');
  assert.ok(parked.every((i) => i.state === 'open'), 'open — a waiting reviewer is not a closed item');
  // Two anchors passed and each filed its own item, around the ones still parked.
  assert.ok(fam.length >= 2, 'the schedule went on around the unreviewed PR');
  assert.ok(sim.log.filter((e) => e.kind === 'delivered-open-pr').length >= 2);

  // Even a task that does not run past its own FAILURE runs past its own review:
  // `last-run-not-failed` reads the failure park and no other kind.
  const strict = makeSim({ tasks: [{ ...REGENERATE, preconditions: ['due:daily', 'last-run-not-failed'] }] });
  await strict.run('2026-08-12T00:00Z', '2026-08-14T12:00Z');
  assert.ok(strict.family('site/regenerate').length >= 2, 'an approval park is not a failure — the lane is open');
  assert.ok(asks(strict, 'site/regenerate').every((e) => !/failure park/.test(e.reason)));
});

// ---- S43 — the road back clears BOTH labels. A re-queue that stripped only the
// state would leave a live item still wearing a triage sub-label: a shape no rule
// defines, and one the janitor's stateless repair would not catch either.
test('S43 the human re-queue leaves no triage label behind', async () => {
  const sim = makeSim({ tasks: [SEEDS] });
  sim.at('2026-08-12T00:00Z', ({ world }) => { world.patScopeMissing = true; });
  // A new task is asked at its first tick (S78), so the first park lands early.
  // Asserted AT the re-queue, not at the end of the run: the invariant is about
  // the item's state the moment the lever is pulled.
  let after = null;
  sim.at('2026-08-12T02:00Z', async (s) => {
    s.world.patScopeMissing = false; // the scope was granted
    const parked = s.issues.find((i) => i.parked);
    assert.ok(parked, 'precondition of this scenario: something is parked to re-queue');
    await s.requeue(parked.number);
    after = [...s.item(parked.number).labels];
  });
  await sim.run('2026-08-12T00:00Z', '2026-08-12T18:00Z');

  assert.ok(after, 'the re-queue ran');
  assert.deepEqual(after.filter((l) => l.startsWith('task:status:needs-human-')), [],
    'no sub-label survived the re-queue');
  assert.ok(after.includes(READY), 'and it went back into the queue');
});

// ---- S9 — invocation is at-most-once: one call per item, never retried. A
// REFUSED call (a status came back — no session exists and none will) converges
// needs-human immediately: the cause is a token, URL or routine, which no retry
// fixes.
test('S9a refused invocation: needs-human at once, naming the cause', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.at('2026-08-12T04:10Z', (s) => s.apiRefusedUntil('2026-08-12T05:00Z'));
  await sim.run('2026-08-12T00:00Z', '2026-08-12T09:00Z');

  const it = own(sim, 'tidy/tidy-issues')[0];
  assert.equal(sim.log.filter((e) => e.kind === 'handoff-refused').length, 1, 'one call, ever');
  assert.ok(sim.item(it.number).parked, 'triage, with the refusal on record');
  assert.equal(sim.item(it.number).sessions.length, 0, 'no session was ever started');
});

// ---- S10 — the UNANSWERED call: the session may or may not exist and nothing
// may guess, so the item STAYS with the agent.
test('S10a unanswered but the session started: it converges the item itself', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.at('2026-08-12T04:10Z', (s) => s.apiUnansweredOnce({ started: true }));
  await sim.run('2026-08-12T00:00Z', '2026-08-12T09:00Z');

  const it = own(sim, 'tidy/tidy-issues')[0];
  assert.equal(sim.log.filter((e) => e.kind === 'handoff-unanswered').length, 1);
  assert.equal(sim.item(it.number).state, 'closed');
  assert.equal(sim.item(it.number).outcome, 'done', 'the session that (unknowably) started converged it');
  assert.equal(sim.item(it.number).sessions.length, 1, 'exactly one session — no retry ever fired');
});

test('S10b unanswered and no session: the agent leash brings it to triage', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.at('2026-08-12T04:10Z', (s) => s.apiUnansweredOnce({ started: false }));
  await sim.run('2026-08-12T00:00Z', '2026-08-13T12:00Z');

  const it = own(sim, 'tidy/tidy-issues')[0];
  assert.equal(sim.item(it.number).sessions.length, 0, 'the call created nothing');
  assert.ok(sim.log.some((e) => e.kind === 'agent-reclaim' && e.issue === it.number),
    "the janitor's agent leash swept the silent item");
  assert.ok(sim.item(it.number).parked, 'triage — no retry ever risked a duplicate session');
});

// ---- S11 — agent dies mid-run: the janitor's 3h agent leash converges the item
// needs-human, naming the dead session.
test('S11 dead agent: janitor leash converges needs-human, names the session', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.at('2026-08-12T04:10Z', (s) => s.crashNextAgentOf('tidy/tidy-issues'));
  // day 2's window has fresh work too, so the anchor's ask says yes
  sim.at('2026-08-13T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-13T04:00Z'); });
  await sim.run('2026-08-12T00:00Z', '2026-08-13T12:00Z');

  const reclaim = sim.log.find((e) => e.kind === 'agent-reclaim');
  assert.ok(reclaim, 'the leash fired');
  const it = sim.item(reclaim.issue);
  assert.ok(it.parked);
  assert.match(it.comments.at(-1).body, /nonce/, 'the dead session is named by the nonce it was fired with');
  // A park is not LIVE: nothing in the engine holds a lane on its own, so the next
  // day's occurrence is asked and filed beside it.
  const beside = own(sim, 'tidy/tidy-issues').filter((i) => i.createdAt >= T('2026-08-13T04:00Z'));
  assert.equal(beside.length, 1, "the next day's occurrence was filed around the park");
  assert.equal(beside[0].outcome, 'done', 'and ran normally while the incident waited');
  assert.equal(it.state, 'open', 'the park itself still waits for its person');
});

// ---- S12' — agent did the work, died before converging; the human re-queue
// re-evaluates, and the no-go CLOSES the item with the reason. The re-queue is a
// label edit — no `Woken` stamp — so at pick the cadence terms are judged over
// the task's OTHER runs, and hold; the task's own condition is what declines.
test("S12' re-queue after work landed: the re-ask closes with the reason", async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T04:00Z', ({ world }) => { world.issueTouchedAt = T('2026-08-12T04:00Z'); });
  sim.at('2026-08-12T04:10Z', (s) => s.crashNextAgentOf('tidy/tidy-issues'));
  // next day the human sees the work actually landed (signal gone), re-queues
  sim.at('2026-08-13T09:00Z', (s) => {
    s.world.issueTouchedAt = null; // the work is done; the window shows nothing
    return s.requeue(own(s, 'tidy/tidy-issues')[0].number);
  });
  await sim.run('2026-08-12T00:00Z', '2026-08-13T18:00Z');

  const it = own(sim, 'tidy/tidy-issues')[0];
  assert.equal(it.woken, null, 'the human re-queue stamps nothing');
  assert.equal(it.state, 'closed', 'the re-ask found no work and closed the incident item');
  assert.equal(it.outcome, 'obsolete');
  assert.equal(sim.declineReason(it.number), 'no issue touched in window',
    "the task's own condition declined, not the cadence");
  assert.equal(sim.family('tidy/tidy-issues').filter((i) => i.state === 'open').length, 0,
    'nothing open remains once the person acted');
});

// ---- K. Ad-hoc requests: "a way to mark an issue as 'let claude do this task',
// and the next executor run picks it up." The mark is a label on an ORDINARY
// issue; the scheduler run adopts it into a work item; the built-in request
// task's precondition is the security check; there is no code-work at all.

const REQ = 'engine/implement-request';
const adopts = (sim) => sim.log.filter((e) => e.kind === 'adopt');
const parked = (it, kind) => it.parked && it.labels.has(NH(kind));

test('S44 a marked issue becomes exactly one run, parked for the reviewer', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let req;
  sim.at('2026-08-18T09:03Z', (s) => { req = s.markIssue({ author: 'owner' }); });
  await sim.run('2026-08-18T09:00Z', '2026-08-19T09:00Z');

  // One adoption, one item, however many scheduler runs ran across the day.
  assert.equal(adopts(sim).length, 1);
  const items = sim.requestItems();
  assert.equal(items.length, 1);
  // ONE issue: the marked issue IS the item — same number — wearing the ad-hoc
  // origin that keeps it out of every scheduled family.
  assert.equal(items[0].number, req.number);
  // The run succeeded and left a PR, so it parks for approval rather than
  // closing — and that park is not a fault, so it holds nobody's lane.
  assert.ok(parked(items[0], 'approval'));
  assert.equal(items[0].state, 'open');
  assert.deepEqual([...items[0].labels].sort(), [ORIGIN_AD_HOC, NH('approval')].sort());
  assert.equal(sim.log.filter((e) => e.kind === 'handoff' && e.task === REQ).length, 1);
  // The request task's one condition reads the item it is about, so it is off the
  // schedule: the tick never asked it, and its item exists only because somebody
  // marked the issue.
  assert.equal(asks(sim, REQ).length, 0);
});

test('S45 an unauthorized mark is refused once, disarmed, and never re-adopted', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let req;
  sim.at('2026-08-18T09:03Z', (s) => { req = s.markIssue({ author: 'passer-by' }); });
  await sim.run('2026-08-18T09:00Z', '2026-08-19T09:00Z');

  const items = sim.requestItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].outcome, 'obsolete');         // declined: no anchor to roll to
  assert.equal(sim.log.filter((e) => e.kind === 'handoff' && e.task === REQ).length, 0);
  // A refusal is not a park: nothing here is anybody's inbox. The terminal lands
  // on the issue and CLOSES it — nothing ran and nothing will — and that standing
  // status is the disarm: a day of further scheduler runs adopts nothing.
  assert.equal(items[0].parked, false);
  assert.equal(sim.item(req.number).state, 'closed');
  assert.deepEqual([...items[0].labels].sort(), [ORIGIN_AD_HOC, 'task:status:rejected'].sort());
  assert.equal(adopts(sim).length, 1);
  assert.match(sim.declineReason(req.number), /neither opened nor approved/);
});

test("S46 an outsider's issue runs only on an approval comment from someone with push", async () => {
  const approved = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  approved.at('2026-08-18T09:03Z', (s) => s.markIssue({
    author: 'stranger', comments: [{ login: 'owner', body: '/claude go' }],
  }));
  await approved.run('2026-08-18T09:00Z', '2026-08-19T09:00Z');
  assert.ok(parked(approved.requestItems()[0], 'approval'));

  // The same phrase from someone without push access decides nothing.
  const not = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  not.at('2026-08-18T09:03Z', (s) => s.markIssue({
    author: 'stranger', comments: [{ login: 'passer-by', body: '/claude go' }],
  }));
  await not.run('2026-08-18T09:00Z', '2026-08-19T09:00Z');
  assert.equal(not.requestItems()[0].outcome, 'obsolete');

  // Permission, not association, decides (F30): a read-only collaborator would
  // ride the payload as COLLABORATOR, but the permission read says no push —
  // their own issue is refused just like a stranger's.
  const readOnly = makeSim({ tasks: cast(), collaborators: { owner: 'admin', reader: 'read' } })
    .seedSteadyState('2026-08-18T00:00Z');
  readOnly.at('2026-08-18T09:03Z', (s) => s.markIssue({ author: 'reader' }));
  await readOnly.run('2026-08-18T09:00Z', '2026-08-19T09:00Z');
  assert.equal(readOnly.requestItems()[0].outcome, 'obsolete');
});

test('S47 the body model routes the run; an unknown family falls back to the default', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  sim.at('2026-08-18T09:03Z', (s) => {
    s.markIssue({ author: 'owner', model: 'sonnet' });
    s.markIssue({ author: 'owner', model: 'gpt-9' });
  });
  await sim.run('2026-08-18T09:00Z', '2026-08-19T09:00Z');

  assert.deepEqual(adopts(sim).map((e) => e.model), ['sonnet', null],
    'the declared family routes the run; an unknown one falls back, and absence is the default');
  // Two requests, two items — they are separate work, not one batch. Two approval
  // parks, and neither delays the other.
  assert.equal(sim.requestItems().length, 2);
  assert.ok(sim.requestItems().every((i) => parked(i, 'approval')));
  // The mark is worn for life beside whatever status the run reaches.
  assert.ok(sim.requestItems().every((r) => r.labels.has(ORIGIN_AD_HOC)));
});

test('S48 a request withdrawn after adoption never reaches an agent', async () => {
  const withdrawn = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let req;
  withdrawn.at('2026-08-18T09:03Z', (s) => { req = s.markIssue({ author: 'owner' }); });
  // …between the scheduler run that adopted it and the executor picking it up.
  withdrawn.at('2026-08-18T09:17:50Z', (s) => s.withdrawRequest(req.number));
  await withdrawn.run('2026-08-18T09:00Z', '2026-08-18T18:00Z');
  assert.equal(withdrawn.requestItems()[0].outcome, 'obsolete');
  assert.equal(withdrawn.log.filter((e) => e.kind === 'handoff' && e.task === REQ).length, 0);
  assert.match(withdrawn.declineReason(req.number), /no longer carries the mark/);

  // Closing the issue is the same answer with no run at all: one issue means
  // closing it closes the item, so there is nothing left to pick or decline.
  const closed = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let req2;
  closed.at('2026-08-18T09:03Z', (s) => { req2 = s.markIssue({ author: 'owner' }); });
  closed.at('2026-08-18T09:17:50Z', (s) => s.closeRequestIssue(req2.number));
  await closed.run('2026-08-18T09:00Z', '2026-08-18T18:00Z');
  assert.equal(closed.item(req2.number).state, 'closed');
  assert.equal(closed.log.filter((e) => e.kind === 'handoff' && e.task === REQ).length, 0);
});

test('S49 a failed request parks as a fault; clearing the status re-runs the same record', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let req;
  sim.at('2026-08-18T09:03Z', (s) => {
    s.updateTask(REQ, { agentFails: () => true });
    req = s.markIssue({ author: 'owner' });
  });
  await sim.run('2026-08-18T09:00Z', '2026-08-18T11:00Z');

  // A broken run is a `failure` — someone reads the trace — and the standing park
  // status is what stops the next scheduler run re-adopting: nothing mechanical
  // re-arms work that writes code.
  assert.ok(parked(sim.requestItems()[0], 'failure'));
  assert.equal(adopts(sim).length, 1);

  // The human fixes the cause and clears the status — the phone-sized retry, and
  // the ONE lever. The same record re-enters the queue.
  sim.at('2026-08-18T12:00Z', (s) => {
    s.updateTask(REQ, { agentFails: () => false });
    return s.remarkIssue(req.number, { model: 'haiku' });
  });
  await sim.run('2026-08-18T11:00Z', '2026-08-19T09:00Z');

  assert.equal(sim.requestItems().length, 1, 'one issue, one record — re-asked, not re-filed');
  assert.equal(adopts(sim).length, 2);
  // The new ask's model is re-gated from the body as it stands now — nothing
  // stale outranks haiku, with no label to consume.
  assert.equal(adopts(sim)[1].model, 'haiku');
  assert.ok(parked(sim.item(req.number), 'approval'));
});

test('S50 a request issue that is GONE declines; one that cannot be READ fails the run', async () => {
  // Definitively gone — the API answers that the issue does not exist. One issue
  // means the item went with it: nothing to pick, nothing to decline.
  const gone = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let g;
  gone.at('2026-08-18T09:03Z', (s) => { g = s.markIssue({}); });
  gone.at('2026-08-18T09:17:50Z', (s) => s.deleteRequestIssue(g.number));
  await gone.run('2026-08-18T09:00Z', '2026-08-18T18:00Z');
  assert.equal(gone.item(g.number), undefined, 'the issue, and with it the item, is gone');
  assert.equal(gone.log.filter((e) => e.kind === 'handoff' && e.task === REQ).length, 0);

  // Transiently unreadable — a rate limit, a 500 — is NOT a verdict (F27):
  // declining would eat the request permanently over nothing. It is a run
  // failure: the item parks in the failure lane, open and visible, and the one
  // re-ask lever retries once the API recovers.
  const flaky = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let f;
  flaky.at('2026-08-18T09:03Z', (s) => { f = s.markIssue({}); });
  flaky.at('2026-08-18T09:17:50Z', (s) => s.setRequestUnreadable(f.number, true));
  await flaky.run('2026-08-18T09:00Z', '2026-08-18T11:00Z');

  const item = flaky.item(f.number);
  assert.ok(parked(item, 'failure'));
  assert.match(item.comments.at(-1).body, /could not be decided/);
  assert.equal(flaky.declineReason(f.number), null, 'nothing was declined on a read that failed');
  assert.ok(item.labels.has(ORIGIN_AD_HOC), 'the mark stands — still armed');

  // The API recovers; the human re-queues the parked item; the run completes.
  flaky.at('2026-08-18T12:00Z', (s) => {
    s.setRequestUnreadable(f.number, false);
    return s.requeue(f.number);
  });
  await flaky.run('2026-08-18T11:00Z', '2026-08-19T09:00Z');
  assert.ok(parked(flaky.item(f.number), 'approval'));
  assert.equal(adopts(flaky).length, 1, 'the retry rode the SAME item — nothing re-adopted');
});

test('S51 an impatient re-ask mid-run changes nothing; after the park it re-runs the record', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let req;
  sim.at('2026-08-18T09:03Z', (s) => {
    s.updateTask(REQ, { agentMinutes: 150 });    // a long run: live across two scheduler runs
    req = s.markIssue({});
  });
  // An impatient re-ask mid-run must not put a second session onto the same issue
  // — and under one issue it structurally CANNOT: the mark already stands, the
  // status says a run owns it, and there is nothing to apply.
  sim.at('2026-08-18T09:30Z', (s) => s.remarkIssue(req.number));
  await sim.run('2026-08-18T09:00Z', '2026-08-19T09:00Z');

  assert.equal(sim.log.filter((e) => e.kind === 'mark' && e.refused === 'live').length, 1,
    'the mid-run re-ask was a no-op');
  assert.equal(adopts(sim).length, 1, 'one adoption, one session — nothing raced the live run');
  assert.equal(sim.log.filter((e) => e.kind === 'handoff' && e.task === REQ).length, 1);
  assert.ok(parked(sim.item(req.number), 'approval'));

  // Now the run has settled: the same lever re-runs the same record.
  sim.at('2026-08-19T10:00Z', (s) => s.remarkIssue(req.number));
  await sim.run('2026-08-19T09:00Z', '2026-08-19T15:00Z');
  assert.equal(adopts(sim).length, 2);
});

// ---- S64 — the request's whole life on ONE issue, read off the labels: the
// bare mark, the adopted shape, the running shape, and the approval park that IS
// the in-review state — the lifelong mark beside exactly one status.
test('S64 the request labels: bare mark, adopted, running, in review — one issue throughout', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-18T00:00Z');
  let req; const seen = [];
  sim.at('2026-08-18T09:03Z', (s) => { req = s.markIssue({ author: 'owner' }); });
  sim.at('2026-08-18T09:10Z', (s) => seen.push(labelsOf(s.item(req.number))));      // awaiting adoption
  sim.at('2026-08-18T09:18:00Z', (s) => seen.push(labelsOf(s.item(req.number))));   // adopted by the 09:17 run
  sim.at('2026-08-18T09:19:00Z', (s) => seen.push(labelsOf(s.item(req.number))));   // handed to the session
  await sim.run('2026-08-18T09:00Z', '2026-08-18T18:00Z');

  assert.deepEqual(seen[0], [ORIGIN_AD_HOC], 'the mark alone — no status is what adoption keys on');
  assert.deepEqual(seen[1], [ORIGIN_AD_HOC, READY]);
  assert.deepEqual(seen[2], [ORIGIN_AD_HOC, 'task:status:running-agent']);
  assert.deepEqual(labelsOf(sim.item(req.number)), [ORIGIN_AD_HOC, NH('approval')],
    'the approval park is the in-review state, beside the mark that never comes off');
});

// ---- P. What a day costs. Actions bills each JOB's minutes rounded up, so a
// day's cost is the RUN COUNT and an idle hourly tick costs a full billed minute
// to find nothing. These read the ledger the fake Actions keeps, whose executor
// rows are the engine's own `workflow_dispatch` calls turned into runs.

// ---- S34 — the batched drain (#1212): a busy morning with several tasks' work
// drains in the scheduler run's own drain run, items settled serially in the SAME
// run, and what caused each run is still on the record.
test("S34 busy morning: one drain run settles all its hour's items; every run's cause is recorded", async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => { world.extractHasLessons = true; });
  sim.at('2026-08-12T04:00Z', ({ world }) => {
    world.issueTouchedAt = T('2026-08-12T04:00Z'); // tidy-issues has work
    world.releasePending = true;                   // store-release has work
  });
  await sim.run('2026-08-12T00:00Z', '2026-08-12T08:00Z');

  // ONE drain for the 04:17 batch. The staggered anchor hours retired with the
  // twice-daily cron, so the whole morning is one batch.
  const morning = sim.log.filter((e) => e.kind === 'executor-run'
    && e.t >= tick('2026-08-12T04:17Z') && e.t < T('2026-08-12T05:00Z'));
  assert.equal(morning.length, 1, 'exactly one executor invocation for the busy hour');
  assert.equal(morning[0].trigger, 'scheduler-run-drain');
  // the 04:17 run settled its hour's items in one invocation — the batch, not a
  // chain: no run was ever caused by a re-dispatch
  const ends = sim.log.filter((e) => e.kind === 'run-end');
  assert.ok(ends.some((e) => e.settled === 3), 'the batch run settled all three items');
  assert.ok(!sim.log.some((e) => e.kind === 'executor-run' && e.trigger === 'failure-redispatch'));
  // work stays SERIAL inside the run — the occupancy model is unchanged, only the
  // run boundary moved — and both items converged the same hour
  const [tidy] = closedOf(sim, 'tidy/tidy-issues');
  const [store] = closedOf(sim, 'chrome/store-release');
  assert.ok(tidy && store, 'both converged');
  assert.ok(store.closedAt < T('2026-08-12T05:00Z'), 'well before the next scheduler run could have helped');
  // and the quiet hours cost nothing: their scheduler runs skipped the drain
  assert.ok(sim.log.filter((e) => e.kind === 'drain-skipped').length >= 3,
    'an hour with nothing pickable dispatched no executor');
});

// ---- S65 — a working day's Action invocations (#1212): Actions bills each job's
// minutes rounded UP, so the day's cost is the invocation count, not the minutes
// worked. A full day of scheduled work (the morning chain, tidy, a release) plus
// ad-hoc work (a marked request, a hand-created item of a task off the schedule)
// converges on the hourly cron's 24 scheduler runs plus a handful of executor
// runs: one drain per hour that left something pickable, and one label event for
// the item a person made by hand. Every quiet hour skips its drain and costs the
// cron's one run alone; the quiet hours are still ASKED, and cost nothing beyond
// that run, because a decline files nothing.
test('S65 a working day: 7 pieces of work cost 28 invocations, and each is accounted', async () => {
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
  sim.at('2026-08-12T09:40Z', (s) => s.markIssue({ author: 'owner' }));         // ad-hoc request
  let byHand;
  sim.at('2026-08-12T14:03Z', (s) => { byHand = s.createItem('fleet/fleet-baseline', { qualifier: 'o/member' }); });
  await sim.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  // the whole day's work converged…
  for (const id of ['basics/baselining', 'grow/growth-extract', 'grow/growth-promote',
    'tidy/tidy-issues', 'chrome/store-release']) {
    const [done] = closedOf(sim, id);
    assert.ok(done && done.outcome === 'done', `${id} converged`);
  }
  assert.equal(sim.item(byHand.number).outcome, 'done', 'and so did the item somebody made by hand');
  assert.ok(parked(sim.requestItems()[0], 'approval'), 'the request delivered its PR and parks for review');

  // …for exactly this invocation bill. THE CHAIN'S TAIL IS THE INTERESTING ROW:
  // a drain settles what it can, but a link released by an AGENT SESSION's close
  // is released after that drain has run dry — and nothing dispatches an executor
  // when a session closes an item, so the next link waits for the next TICK. The
  // engine's only two dispatch sites are the scheduler run's drain job and the
  // failure continuation; there is no close-time drain.
  const acct = sim.actionExecutions();
  assert.equal(acct.scheduler, 24, 'the hourly cron is the floor');
  assert.equal(acct.executorByTrigger['failure-redispatch'], undefined, 'nothing died');
  assert.equal(acct.executorByTrigger['label-event'], 1, 'the hand-made item fired one label event');
  assert.equal(acct.total, acct.scheduler + acct.executor, 'the whole day, accounted');
  // every executor run this day was a drain the scheduler gated, or that one event
  assert.deepEqual(Object.keys(acct.executorByTrigger).sort(), ['label-event', 'scheduler-run-drain']);
  // and the hours with nothing pickable dispatched no executor at all
  assert.equal(sim.log.filter((e) => e.kind === 'drain-skipped').length + acct.executorByTrigger['scheduler-run-drain'], 24);
  // the ticks before the anchor asked and declined on the cadence; the ones after
  // the morning's runs, the same
  assert.equal(asks(sim, 'chrome/store-release').length, 24, 'every tick — its three-minute run never spanned one');
  assert.equal(goes(sim, 'chrome/store-release').length, 1);
});

// ---- S66 — the quiet day's floor: no signals, no items — the cron's 24
// scheduler runs are the day's entire invocation bill, because a scheduler run
// that leaves nothing pickable dispatches no drain.
test('S66 a quiet day costs the cron floor alone: 24 invocations, zero executor runs', async () => {
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  await sim.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  const acct = sim.actionExecutions();
  assert.equal(acct.scheduler, 24);
  assert.equal(acct.executor, 0, 'no executor ever started');
  assert.equal(acct.total, 24);
  assert.equal(sim.log.filter((e) => e.kind === 'drain-skipped').length, 24);
  assert.equal(sim.log.filter((e) => e.kind === 'executor-run').length, 0);
});

// ---- S67 — a full day's scheduled work: the same completions on a twelfth of
// the runs. The `schedule_after:` chain is what makes this safe — one drain
// settles the whole chain back to back, so collapsing three anchor hours into one
// tick costs ordering nothing.
test('S67 twice-daily cron: a full day of work completes on a handful of billed runs, not 26', async () => {
  const day = async (opts) => {
    const s = makeSim({ tasks: cast(), ...opts }).seedSteadyState('2026-08-12T00:00Z');
    s.at('2026-08-12T00:05Z', ({ world }) => {
      world.mountBehind = true;
      world.extractHasLessons = true;
      world.promoteHasCandidates = true;
      world.issueTouchedAt = T('2026-08-12T00:05Z');
      world.releasePending = true;
    });
    await s.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');
    return s;
  };
  const DAILY = ['basics/baselining', 'grow/growth-extract', 'grow/growth-promote',
    'tidy/tidy-issues', 'chrome/store-release'];

  const hourly = await day({});
  const twice = await day({ cronHours: [4, 16] });

  // Every task that ran under the hourly grid still runs, and still closes done.
  for (const task of DAILY) {
    assert.equal(closedOf(hourly, task).length, 1, `${task} closed under hourly`);
    assert.equal(closedOf(twice, task).length, 1, `${task} closed under twice-daily`);
    assert.equal(closedOf(twice, task)[0].outcome, 'done', `${task} closed done`);
  }

  // The cost. 24 scheduler runs become 2 — the whole saving, and the reason this
  // design exists. The executor count is work, not cadence.
  assert.equal(hourly.actionExecutions().scheduler, 24);
  assert.equal(twice.actionExecutions().scheduler, 2);
  assert.ok(twice.actionExecutions().total < hourly.actionExecutions().total / 5,
    'a twelfth of the scheduler bill, and the work still gets done');

  // ORDERING SURVIVES THE COLLAPSE. All three chained tasks are instantiated by
  // the SAME 04:17 tick — their staggered anchor hours no longer separate them —
  // and `schedule_after:` alone still settles them in declaration order.
  const closeAt = (s, task) => closedOf(s, task)[0].closedAt;
  assert.ok(closeAt(twice, 'basics/baselining') < closeAt(twice, 'grow/growth-extract'));
  assert.ok(closeAt(twice, 'grow/growth-extract') < closeAt(twice, 'grow/growth-promote'));
  for (const task of ['basics/baselining', 'grow/growth-extract', 'grow/growth-promote']) {
    assert.equal(new Date(closedOf(twice, task)[0].createdAt).toISOString().slice(11, 16), '04:17');
  }
  assert.ok(asks(hourly, 'tidy/tidy-issues').filter((e) => e.t < T('2026-08-12T04:00Z'))
    .every((e) => e.verdict === 'no'), 'the pre-anchor ticks asked and declined on the cadence');
});

// ---- S68 — the ad-hoc mark is what the second tick is FOR. A mark is adopted by
// a scheduler run and nothing else, so its latency is exactly the wait for the
// next tick — which is what picks the cadence.
test('S68 ad-hoc latency is the wait for the next tick: 0.2h hourly, 7.2h twice-daily, 19.2h once', async () => {
  const marked = async (opts) => {
    const s = makeSim({ tasks: cast(), ...opts }).seedSteadyState('2026-08-12T00:00Z');
    s.at('2026-08-12T09:03Z', (x) => x.markIssue({ author: 'owner' }));
    await s.run('2026-08-12T00:00Z', '2026-08-13T12:00Z');
    const adopt = s.log.find((e) => e.kind === 'adopt');
    return { s, delayH: (adopt.t - T('2026-08-12T09:03Z')) / 3_600_000 };
  };

  const hourly = await marked({});
  const twice = await marked({ cronHours: [4, 16] });
  const once = await marked({ cronHours: [4] });

  // Adopted exactly once in every cadence — the wait is latency, never loss.
  for (const { s } of [hourly, twice, once]) assert.equal(adopts(s).length, 1);

  // Derived from the tick grid, not transcribed from a run: the wait is exactly
  // "the first tick at or after the mark".
  const firstTickAfter = (markIso, hours) => {
    const mark = T(markIso);
    for (let t = Math.floor(mark / 3_600_000) * 3_600_000; ; t += 3_600_000) {
      const at = tick(new Date(t + 17 * 60_000).toISOString());
      if (at >= mark && hours.includes(new Date(at).getUTCHours())) return at;
    }
  };
  const EVERY_HOUR = [...Array(24).keys()];
  const expect = (hours) => (firstTickAfter('2026-08-12T09:03Z', hours) - T('2026-08-12T09:03Z')) / 3_600_000;

  assert.equal(hourly.delayH, expect(EVERY_HOUR));
  assert.equal(twice.delayH, expect([4, 16]));
  assert.equal(once.delayH, expect([4]));
  // …and the derivation agrees with the figures the design quotes.
  assert.ok(Math.abs(hourly.delayH - 0.2) < 0.05, `hourly ${hourly.delayH}h`);
  assert.ok(Math.abs(twice.delayH - 7.2) < 0.05, `twice-daily ${twice.delayH}h`);
  assert.ok(Math.abs(once.delayH - 19.2) < 0.05, `once-daily ${once.delayH}h`);

  // The second tick is what keeps the worst case inside a working day: it roughly
  // halves the wait for one extra billed minute a day.
  assert.ok(twice.delayH < once.delayH / 2);
  assert.equal(twice.s.actionExecutions().scheduler - once.s.actionExecutions().scheduler, 1);
});

// ---- S69 — THE CONTINUATION DOES NOT CATCH A MARK. A drain re-reads the queue
// between items and picks up the dependents its own closes release — but a
// freshly marked issue is nobody's dependent, and adoption is the scheduler run's
// job. So a mark landing mid-drain waits for the next TICK.
test('S69 a mark landing mid-drain waits for the next tick — continuations chain dependents, not marks', async () => {
  const slow = [{
    id: 'tidy/tidy-issues', preconditions: ['due:daily'],
    codeWorkMinutes: 90, agentMinutes: 60, precondition: () => ({ run: true }),
  }];
  const sim = makeSim({ tasks: slow, cronHours: [4, 16] }).seedSteadyState('2026-08-12T00:00Z');
  // 04:30 — the 04:17 tick's drain is in flight on a long item.
  sim.at('2026-08-12T04:30Z', (s) => s.markIssue({ author: 'owner' }));
  await sim.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');

  const adopt = sim.log.find((e) => e.kind === 'adopt');
  assert.ok(adopt, 'the mark is adopted eventually — this is latency, not loss');
  // Not at 04:30+, and not by the running drain: at the NEXT scheduler tick.
  assert.equal(new Date(adopt.t).toISOString().slice(11, 16), '16:17');
  assert.ok((adopt.t - T('2026-08-12T04:30Z')) / 3_600_000 > 11);
});

// ---- S80 — SPEED IS A CLAIM TOO. Every wait in this suite is virtual: a
// scenario spanning a working day, with a chain of tasks running for hours of
// simulated time, costs milliseconds of real time and sleeps for none of it. A
// scenario that needed real time would be a scenario written wrong, and the
// budget below is what says so out loud.
//
// The bound is generous against the measured cost — it is a ceiling that catches
// a wall-clock wait creeping in, not a benchmark — and it is per SCENARIO rather
// than per suite, because the suite's cost is the number of scenarios times this.
test('S80 a simulated working day costs milliseconds and waits for nothing', async () => {
  const startedAt = process.hrtime.bigint();
  const sim = makeSim({ tasks: cast() }).seedSteadyState('2026-08-12T00:00Z');
  sim.at('2026-08-12T00:01Z', ({ world }) => {
    world.mountBehind = true; world.extractHasLessons = true; world.promoteHasCandidates = true;
    world.issueTouchedAt = T('2026-08-12T00:01Z'); world.releasePending = true;
  });
  await sim.run('2026-08-12T00:00Z', '2026-08-13T00:00Z');
  const realMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  // The day really happened: 24 ticks and a morning's chain, all of it converged.
  assert.equal(ticks(sim).length, 24);
  assert.equal(closedOf(sim, 'grow/growth-promote').length, 1);
  // …and the clock ends exactly where the scenario put it, having run on nothing
  // but its own event queue.
  assert.equal(sim.clock.iso(), '2026-08-13T00:00:00.000Z');
  assert.ok(realMs < 2000, `a simulated day cost ${Math.round(realMs)}ms of real time`);
});
