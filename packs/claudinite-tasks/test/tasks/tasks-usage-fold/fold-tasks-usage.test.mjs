// The fold itself: what lands in a bucket, what an absent source leaves behind, how
// several stamps of one executor run collapse, and what a week absorbs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  foldTasksUsage, foldDays, foldHours, costsByRun, withItemCosts, addDayToWeek, isoWeek,
} from '../../../tasks/tasks-usage-fold/fold-tasks-usage.mjs';
import {
  encodeTasksUsageFile, decodeTasksUsageFile, renderTasksUsageFile, withoutStamp,
  WEEK_GROUPS,
} from '../../../src/items/tasks-usage-format.mjs';

const TODAY = '2026-09-15';
const NOW = '2026-09-15T12:00:00Z';

const run = (id, workflow, at, over = {}) => ({
  id, workflow, startedAt: at, conclusion: 'success', jobs: 1, minutesBilled: 2, cost: null, ...over,
});

const cost = (runId, apiCalls, phaseMs) => ({ workflow: 'executor', runId, apiCalls, phaseMs });

const item = (number, date, over = {}) => ({
  number, date, closedAt: `${date}T05:40:00Z`, pack: 'p', task: 'a', outcome: 'done',
  parks: [], latency: {}, costs: [], ...over,
});

test('a run lands in its workflow row and in the day it started', () => {
  const days = foldDays({ runs: [run(1, 'scheduler', '2026-09-15T05:10:00Z')], today: TODAY });
  assert.equal(days[TODAY].workflows.scheduler.runs, 1);
  assert.equal(days[TODAY].workflows.scheduler.minutesBilled, 2);
  assert.equal(days[TODAY].runs, 1);
  assert.equal(days[TODAY].minutesBilled, 2);
});

test('a repo with no configured rate carries no spend anywhere, never a zero', () => {
  const days = foldDays({ runs: [run(1, 'executor', '2026-09-15T05:10:00Z')], today: TODAY });
  assert.ok(!('spend' in days[TODAY]), 'the day states no spend it was never given a rate for');
  assert.ok(!('spend' in days[TODAY].workflows.executor));
});

test('a configured rate prices the minutes that were measured and nothing else', () => {
  const days = foldDays({
    runs: [run(1, 'executor', '2026-09-15T05:10:00Z'), run(2, 'executor', '2026-09-15T06:10:00Z', { minutesBilled: null })],
    today: TODAY,
    minuteRate: 0.008,
  });
  assert.equal(days[TODAY].workflows.executor.runs, 2);
  // Only the measured run contributes — an unmeasured one is not free.
  assert.equal(days[TODAY].minutesBilled, 2);
  assert.ok(Math.abs(days[TODAY].spend - 0.016) < 1e-9);
});

test('a run whose jobs listing failed still counts as a run and leaves minutes unknown', () => {
  const days = foldDays({
    runs: [run(1, 'executor', '2026-09-15T05:10:00Z', { jobs: null, minutesBilled: null })],
    today: TODAY,
  });
  assert.equal(days[TODAY].runs, 1);
  assert.ok(!('jobs' in days[TODAY]));
  assert.ok(!('minutesBilled' in days[TODAY]));
});

test("a run's cost record lands in the bucket's scalars and in its own per-run row", () => {
  const days = foldDays({
    runs: [run(1, 'scheduler', '2026-09-15T05:10:00Z', { cost: { workflow: 'scheduler', runId: '1', apiCalls: 6, phaseMs: { list: 100, ask: 200 } } })],
    today: TODAY,
  });
  assert.equal(days[TODAY].apiCalls, 6);
  assert.equal(days[TODAY].list, 100);
  assert.deepEqual(days[TODAY].runCosts['1'], { apiCalls: 6, list: 100, ask: 200 });
});

test('several stamps of one executor run collapse to the largest, not to their sum', () => {
  // One run settles three items and leaves a snapshot on each; summing them would
  // report one run's whole spend once per item it touched.
  const byRun = costsByRun([
    item(1, TODAY, { costs: [cost('77', 10, { pick: 100 })] }),
    item(2, TODAY, { costs: [cost('77', 25, { pick: 250, converge: 40 })] }),
    item(3, TODAY, { costs: [cost('77', 18, { pick: 180 })] }),
  ]);
  assert.equal(byRun.size, 1);
  assert.equal(byRun.get('77').apiCalls, 25);
  assert.deepEqual(byRun.get('77').phaseMs, { pick: 250, converge: 40 });
});

test("an executor run's cost is attached from the items it settled", () => {
  const runs = withItemCosts(
    [run(77, 'executor', '2026-09-15T05:10:00Z')],
    [item(1, TODAY, { costs: [cost('77', 25, { pick: 250 })] })],
  );
  assert.equal(runs[0].cost.apiCalls, 25);
});

test('a cost record whose run the listing never saw invents no bucket for it', () => {
  // The listing is what says a run happened; a stray record on an item whose run
  // fell outside the window has no day to be counted in.
  const days = foldDays({
    runs: withItemCosts([], [item(1, TODAY, { costs: [cost('999', 25, { pick: 250 })] })]),
    items: [item(1, TODAY, { costs: [cost('999', 25, { pick: 250 })] })],
    today: TODAY,
  });
  assert.deepEqual(days[TODAY].runCosts, {});
  assert.ok(!('apiCalls' in days[TODAY]));
});

test('an item lands under its task, with its parks and its latency samples', () => {
  const days = foldDays({
    items: [item(42, TODAY, { outcome: 'done', parks: ['failure'], latency: { itemToPickMinutes: 8 } })],
    today: TODAY,
  });
  assert.deepEqual(days[TODAY].queue['p/a'], { done: 1 });
  assert.deepEqual(days[TODAY].parks['p/a'], { failure: 1 });
  assert.deepEqual(days[TODAY].latency['42'], { itemToPickMinutes: 8 });
});

test('an item whose timeline could not be read keeps its outcome and no park row', () => {
  const days = foldDays({ items: [item(42, TODAY, { parks: null, latency: null })], today: TODAY });
  assert.deepEqual(days[TODAY].queue['p/a'], { done: 1 });
  assert.deepEqual(days[TODAY].parks, {});
  assert.deepEqual(days[TODAY].latency, {});
});

test('an hour row carries the run costs and none of the item-derived maps', () => {
  const hours = foldHours({ runs: [run(1, 'scheduler', '2026-09-15T05:10:00Z')], now: NOW });
  assert.equal(hours['2026-09-15T05'].workflows.scheduler.runs, 1);
  assert.ok(!('queue' in hours['2026-09-15T05']), 'nobody asks what closed in an hour');
});

test('a week absorbs a day that closed and says how many rows it took', () => {
  const day = foldDays({
    runs: [run(1, 'executor', '2026-09-14T05:10:00Z')],
    items: [item(42, '2026-09-14', { latency: { itemToPickMinutes: 8 } })],
    today: TODAY,
  })['2026-09-14'];
  const week = addDayToWeek(null, day);
  assert.equal(week.days, 1);
  assert.equal(week.runs, 1);
  assert.deepEqual(week.queue['p/a'], { done: 1 });
  assert.deepEqual(week.latency['42'], { itemToPickMinutes: 8 });
  assert.ok(!('runCosts' in week) || Object.keys(week.runCosts ?? {}).length === 0);
});

test('the week tier keeps no per-run map — its keys are unique and frozen forever', () => {
  assert.ok(!WEEK_GROUPS.includes('runCosts'));
});

test('a week absorbs each day exactly once, and the watermark is the whole mechanism', () => {
  // Called twice, as a re-run of the fold over the same window would: the second
  // pass starts from the mark the first left and must add nothing.
  const runs = [run(1, 'executor', '2026-09-14T05:10:00Z'), run(2, 'executor', '2026-09-14T17:10:00Z')];
  const first = foldTasksUsage({ today: TODAY, now: NOW, runs, runsFoldedThrough: '2026-09-14T17:10:00Z' });
  const second = foldTasksUsage({ prior: first, today: TODAY, now: NOW, runs: [] });
  const week = isoWeek('2026-09-14');
  assert.equal(first.weeks[week].days, 1);
  assert.equal(second.weeks[week].days, 1);
  assert.equal(second.weeks[week].runs, 2);
});

test('a week frozen before a counter existed grows it from the first day that has it', () => {
  // Defaulted rather than crashed, so a new counter does not wedge the watermark
  // behind the weeks that predate it.
  const week = addDayToWeek({ days: 3, runs: 5 }, { runs: 1, apiCalls: 7, workflows: {}, queue: {}, parks: {}, latency: {} });
  assert.equal(week.days, 4);
  assert.equal(week.runs, 6);
  assert.equal(week.apiCalls, 7);
});

// --- the file boundary --------------------------------------------------------------

test('a folded file round-trips through the on-disk tuple shape', () => {
  const folded = foldTasksUsage({
    today: TODAY,
    now: NOW,
    generated: NOW,
    minuteRate: 0.008,
    runs: [run(1, 'scheduler', '2026-09-15T05:10:00Z', { cost: { workflow: 'scheduler', runId: '1', apiCalls: 6, phaseMs: { list: 100 } } })],
    items: [item(42, TODAY, { parks: ['approval'], latency: { itemToPickMinutes: 8 } })],
  });
  const back = decodeTasksUsageFile(JSON.parse(renderTasksUsageFile(encodeTasksUsageFile(folded))));

  assert.equal(back.minuteRate, 0.008);
  assert.equal(back.days[TODAY].apiCalls, 6);
  assert.deepEqual(back.days[TODAY].runCosts['1'], { apiCalls: 6, list: 100 });
  assert.deepEqual(back.days[TODAY].parks['p/a'], { approval: 1 });
  assert.deepEqual(back.days[TODAY].latency['42'], { itemToPickMinutes: 8 });
});

test('a recompute that found nothing new renders byte-identically apart from its stamp', () => {
  // What makes the delivery open no pull request on a quiet day.
  const args = { today: TODAY, now: NOW, runs: [run(1, 'executor', '2026-09-15T05:10:00Z')] };
  const a = renderTasksUsageFile(encodeTasksUsageFile(foldTasksUsage({ ...args, generated: '2026-09-15T12:00:00Z' })));
  const b = renderTasksUsageFile(encodeTasksUsageFile(foldTasksUsage({ ...args, generated: '2026-09-15T18:00:00Z' })));
  assert.notEqual(a, b);
  assert.equal(withoutStamp(a), withoutStamp(b));
});

test('an unknown counter decodes to no key rather than to a zero', () => {
  const folded = foldTasksUsage({
    today: TODAY, now: NOW, runs: [run(1, 'executor', '2026-09-15T05:10:00Z', { jobs: null, minutesBilled: null })],
  });
  const back = decodeTasksUsageFile(JSON.parse(renderTasksUsageFile(encodeTasksUsageFile(folded))));
  assert.equal(back.days[TODAY].runs, 1);
  assert.ok(!('minutesBilled' in back.days[TODAY]));
});
