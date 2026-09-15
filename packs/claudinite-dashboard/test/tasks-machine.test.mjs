import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decodeTasksUsage } from '../src/read/usage.mjs';
import {
  tasksMachine, fleetTasksMachine, quantiles, windowDays, change,
} from '../src/derive/tasks-machine.mjs';

// The machinery panel's derivation, driven through the REAL decode: the fixture below is
// the file as the fold writes it — positional tuples against a declared header — and
// every case runs it through `decodeTasksUsage` rather than hand-building the decoded
// shape, so a change to either side shows up here instead of passing between two
// hand-authored mirrors of each other.

const NOW = Date.parse('2026-09-15T12:00:00Z');
// Current window: 2026-09-09 → 2026-09-15. Previous: 2026-09-02 → 2026-09-08.

const FIELDS = {
  day: ['runs', 'jobs', 'minutesBilled', 'spend', 'apiCalls'],
  workflows: ['runs', 'jobs', 'minutesBilled', 'spend'],
  queue: ['done', 'delivered', 'obsolete', 'none'],
  parks: ['failure', 'action', 'decision', 'approval'],
  latency: ['tickToItemMinutes', 'itemToPickMinutes', 'pickToHandOffMinutes', 'handOffToConvergeMinutes'],
};

const file = (days, over = {}) => decodeTasksUsage({
  version: 1,
  generated: '2026-09-15T13:18:16.932Z',
  foldedThrough: '2026-09-15',
  minuteRate: null,
  fields: FIELDS,
  days,
  hours: {},
  weeks: {},
  ...over,
});

// Two folded days in each window, and the days between them absent from the file
// entirely — which is the ordinary state and the one every figure has to survive.
const TWO_WINDOWS = {
  '2026-09-03': {
    totals: [4, 8, 12, null, null],
    workflows: { executor: [3, 6, 9, null], scheduler: [1, 2, 3, null] },
    queue: { 'a-pack/alpha': [2, null, null, null] },
    parks: { 'a-pack/alpha': [1, null, null, null] },
    latency: { 101: [null, 10, 4, 100] },
  },
  '2026-09-07': {
    totals: [2, 4, 6, null, null],
    workflows: { executor: [2, 4, 6, null] },
    queue: { 'a-pack/alpha': [1, null, null, null], 'b-pack/beta': [null, null, 3, null] },
    latency: { 102: [null, 20, 6, 200] },
  },
  '2026-09-10': {
    totals: [10, 20, 30, null, 62],
    workflows: { executor: [8, 16, 24, null], scheduler: [2, 4, 6, null] },
    queue: { 'a-pack/alpha': [5, 1, null, null] },
    parks: { 'a-pack/alpha': [null, 2, null, 1] },
    latency: { 201: [null, 30, 8, 300], 202: [null, 40, 10, 400] },
  },
  '2026-09-14': {
    totals: [6, 12, 18, null, 40],
    workflows: { executor: [4, 8, 12, null], scheduler: [2, 4, 6, null] },
    queue: { 'a-pack/alpha': [3, null, null, 1] },
    latency: { 203: [null, 50, 12, 500] },
  },
};

test('the two windows are adjacent, equal and end today', () => {
  const [current, previous] = windowDays(NOW, 7);
  assert.equal(current.length, 7);
  assert.equal(previous.length, 7);
  assert.equal(current.at(-1), '2026-09-15', 'the current window ends on today');
  assert.equal(current[0], '2026-09-09');
  assert.equal(previous.at(-1), '2026-09-08', 'the previous window ends the day before the current one starts');
  // Every day belongs to exactly one window — the property that makes the comparison
  // a comparison rather than two overlapping totals.
  assert.equal(new Set([...current, ...previous]).size, 14);
});

test('cost sums only the days the file carried, and states them against the window before', () => {
  const m = tasksMachine(file(TWO_WINDOWS), { now: NOW, span: 7 });

  assert.equal(m.cost.current.runs, 16, '10 + 6 over the two folded days in the current window');
  assert.equal(m.cost.previous.runs, 6, '4 + 2 over the previous window');
  assert.equal(m.cost.current.minutesBilled, 48);
  assert.equal(m.cost.previous.minutesBilled, 18);
  // Five absent days per window contribute nothing at all — not a zero that would drag
  // the figure down and read as a quiet week.
  assert.equal(m.foldedDays.current, 2);
  assert.equal(m.foldedDays.previous, 2);

  const c = change(m.cost.current.runs, m.cost.previous.runs);
  assert.equal(c.dir, 'up');
  assert.equal(c.previous, 6, 'the previous figure is carried, not just the arrow');
});

test('a counter no day carried reads as null, never zero', () => {
  const m = tasksMachine(file(TWO_WINDOWS), { now: NOW, span: 7 });
  // `spend` is absent from every tuple because this member declares no rate. A public
  // repo bills nothing and a private one bills something; zero is a claim nobody made.
  assert.equal(m.cost.current.spend, null);
  assert.equal(m.cost.previous.spend, null);
  assert.equal(m.minuteRate, null);
  // `apiCalls` IS carried in the current window and is not in the previous one, so the
  // two sides answer differently off the same code path.
  assert.equal(m.cost.current.apiCalls, 102);
  assert.equal(m.cost.previous.apiCalls, null);
  assert.equal(change(m.cost.current.apiCalls, m.cost.previous.apiCalls), null,
    'no previous figure means no delta — neither side is invented');
});

test('a window the file folded no day of is null throughout, not a row of zeroes', () => {
  // Only the current window is folded; the previous one is entirely absent.
  const m = tasksMachine(file({ '2026-09-10': TWO_WINDOWS['2026-09-10'] }), { now: NOW, span: 7 });
  assert.equal(m.foldedDays.previous, 0);
  assert.equal(m.cost.previous.runs, null);
  assert.equal(m.reliability.previous.outcomes.done, null, 'an unfolded week did not close nothing — nobody folded it');
  assert.equal(m.reliability.previous.parks.failure, null);
  // And the folded side answers with real counts, including a genuine zero where the
  // window WAS folded and the word simply did not occur.
  assert.equal(m.reliability.current.outcomes.done, 5);
  assert.equal(m.reliability.current.outcomes.obsolete, 0, 'a folded window with no obsolete closes is zero, not unknown');
});

test('every task either window saw gets one row carrying both windows', () => {
  const m = tasksMachine(file(TWO_WINDOWS), { now: NOW, span: 7 });
  const keys = m.reliability.tasks.map((t) => t.key);
  assert.deepEqual(keys, ['a-pack/alpha', 'b-pack/beta']);

  const alpha = m.reliability.tasks.find((t) => t.key === 'a-pack/alpha');
  assert.equal(alpha.current.outcomes.done, 8, '5 + 3 this window');
  assert.equal(alpha.previous.outcomes.done, 3, '2 + 1 the window before');
  assert.equal(alpha.current.parks.action, 2);
  assert.equal(alpha.current.parks.failure, 0, 'a task the window saw, with no failure park, is zero');

  // `b-pack/beta` closed three obsolete items last window and nothing this one. It is a
  // row that went to zero — visible — rather than a row that disappeared.
  const beta = m.reliability.tasks.find((t) => t.key === 'b-pack/beta');
  assert.equal(beta.previous.outcomes.obsolete, 3);
  assert.equal(beta.current.closed, null, 'this window saw no occurrence of it at all');
  assert.equal(beta.previous.closed, 3);
});

test('a word neither vocabulary names is counted as itself rather than dropped', () => {
  // The file's header is what the decode expands against, so a fifth outcome word on
  // the writing side arrives here with no change to this module.
  const wider = decodeTasksUsage({
    version: 1,
    fields: { ...FIELDS, queue: ['done', 'delivered', 'obsolete', 'none', 'abandoned'] },
    days: { '2026-09-10': { totals: [1, 1, 1], queue: { 'a-pack/alpha': [1, null, null, null, 4] } } },
  });
  const m = tasksMachine(wider, { now: NOW, span: 7 });
  const alpha = m.reliability.tasks.find((t) => t.key === 'a-pack/alpha');
  assert.deepEqual(alpha.current.other, [['abandoned', 4]]);
  assert.equal(alpha.current.closed, 5, 'the unknown word is in the task\'s total, not silently discarded');
});

test('latency quantiles are taken over the window\'s own samples', () => {
  const m = tasksMachine(file(TWO_WINDOWS), { now: NOW, span: 7 });
  // Three items closed in the current window: item→pick samples 30, 40, 50.
  const cur = m.latency.current.itemToPickMinutes;
  assert.equal(cur.n, 3);
  assert.equal(cur.p50, 40);
  assert.equal(cur.max, 50);
  // Two in the previous: 10 and 20 — a different answer off the same slot, which is why
  // the file carries samples and not a folded quantile.
  assert.equal(m.latency.previous.itemToPickMinutes.p50, 10, 'nearest-rank over two samples is the lower');
  assert.equal(m.latency.previous.itemToPickMinutes.max, 20);
  assert.equal(m.latency.previous.itemToPickMinutes.n, 2);
  // A slot whose far end never happened is absent, and absent is not a latency of zero.
  assert.equal(m.latency.current.tickToItemMinutes.n, 0);
  assert.equal(m.latency.current.tickToItemMinutes.p50, null);
});

test('one sample is reported as a count with no quantile', () => {
  // A p90 over a single measurement is that measurement wearing a statistic's name.
  const one = quantiles([7]);
  assert.equal(one.n, 1);
  assert.equal(one.p50, null);
  assert.equal(one.p90, null);
  assert.equal(one.max, 7, 'the measurement itself is still reported');
  assert.equal(quantiles([]).n, 0);
  // Nearest-rank, so p50 of an even count is the upper of the two middles.
  assert.equal(quantiles([1, 2, 3, 4]).p50, 2);
  assert.equal(quantiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).p90, 9);
  assert.equal(quantiles([null, 3, undefined, 1]).n, 2, 'non-numbers are not samples');
});

test('per-workflow rows survive a workflow that ran in only one window', () => {
  const m = tasksMachine(file(TWO_WINDOWS), { now: NOW, span: 7 });
  const rows = m.cost.workflows;
  assert.deepEqual(rows.map((w) => w.name), ['executor', 'scheduler']);
  const executor = rows.find((w) => w.name === 'executor');
  assert.equal(executor.current.runs, 12);
  assert.equal(executor.previous.runs, 5);
  const scheduler = rows.find((w) => w.name === 'scheduler');
  assert.equal(scheduler.current.runs, 4);
  assert.equal(scheduler.previous.runs, 1, 'it ran on one of the two folded days last window');
});

test('the day series leaves an unfolded day blank rather than at the floor', () => {
  const m = tasksMachine(file(TWO_WINDOWS), { now: NOW, span: 7 });
  assert.equal(m.days.length, 14, 'both windows, in order, so the chart shows the comparison the tiles state');
  const folded = m.days.filter((d) => d.source === 'folded');
  assert.equal(folded.length, 4);
  for (const d of m.days.filter((x) => x.source === 'none')) {
    assert.equal(d.runs, null);
    assert.equal(d.done, null);
  }
  assert.deepEqual(
    m.days.filter((d) => d.window === 'current').map((d) => d.day).slice(0, 2),
    ['2026-09-09', '2026-09-10'],
  );
});

test('a day carrying the items and not the runs is NOT READ for the run chart', () => {
  // The two halves are folded on separate watermarks, so this is the ordinary state on
  // a member whose run counting started after its item counting. The row exists — the
  // outcome chart has a real zero for it — and the run figure was never written.
  const m = tasksMachine(file({
    '2026-09-10': { totals: [null, null, null, null, null], queue: { 'a-pack/alpha': [2, null, null, null] } },
    '2026-09-14': TWO_WINDOWS['2026-09-14'],
  }), { now: NOW, span: 7 });

  const itemsOnly = m.days.find((d) => d.day === '2026-09-10');
  assert.equal(itemsOnly.source, 'folded', 'the item half answered for this day');
  assert.equal(itemsOnly.runSource, 'none', 'the run half did not — so the run chart leaves it blank');
  assert.equal(itemsOnly.runs, null);
  assert.equal(itemsOnly.done, 2, 'and the outcome chart draws its real count');

  const both = m.days.find((d) => d.day === '2026-09-14');
  assert.equal(both.runSource, 'folded');
  // The window states each half's own denominator rather than one number for the row.
  assert.equal(m.foldedDays.current, 2);
  assert.equal(m.foldedDays.currentRuns, 1);
});

test('a window whose item half folded nothing reports no outcome, even with runs folded', () => {
  // Runs counted, items not: the cost tiles answer and the reliability tiles say
  // unknown. One flag for the row would have made this window read as zero closes.
  const m = tasksMachine(file({
    '2026-09-10': { totals: [9, 18, 27, null, null], workflows: { scheduler: [9, 18, 27, null] } },
  }), { now: NOW, span: 7 });
  assert.equal(m.cost.current.runs, 9);
  assert.equal(m.reliability.current.closed, null);
  assert.equal(m.reliability.current.outcomes.done, null);
  assert.equal(m.reliability.current.parks.failure, null);
});

test('a member that folds no machinery file is not folded at all', () => {
  const m = tasksMachine(null, { now: NOW, span: 7 });
  assert.equal(m.folded, false);
  assert.equal(m.cost.current.runs, null);
  assert.equal(m.reliability.tasks.length, 0);
  assert.equal(m.latency.current.itemToPickMinutes.n, 0);
});

test('the panel names the numbers the file does not carry', () => {
  const m = tasksMachine(file(TWO_WINDOWS), { now: NOW, span: 7 });
  // The panel adds no counter to the file; it states the gap instead. Both gaps are
  // named so the note can render them, and a stated gap is information.
  assert.equal(m.unrecorded.length, 2);
  assert.ok(m.unrecorded.some((g) => /janitor/i.test(g)));
  assert.ok(m.unrecorded.some((g) => /leash/i.test(g)));
});

// --- the fleet roll-up -----------------------------------------------------------------

const member = (repo, days, over) => ({ repo, declaration: { packs: [] }, tasksUsage: file(days, over) });

test('the fleet roll-up names the members that fold nothing and counts them in nothing', () => {
  const reads = [
    member('o/One', TWO_WINDOWS),
    member('o/Two', { '2026-09-10': TWO_WINDOWS['2026-09-10'] }),
    { repo: 'o/Three', declaration: { packs: [] }, tasksUsage: null },
    { repo: 'o/Broken', error: 'unreadable' },
  ];
  const f = fleetTasksMachine(reads, { now: NOW, span: 7 });

  assert.equal(f.readable, 3, 'the unreadable member is not a member that folds nothing');
  assert.equal(f.folding, 2);
  assert.deepEqual(f.absent, ['o/Three']);
  assert.equal(f.members.length, 2, 'one row per FOLDING member — the absent one is a census entry, not a row of zeroes');

  // 16 from One, 10 from Two. The absent member adds nothing, including no zero.
  assert.equal(f.cost.current.runs, 26);
  assert.equal(f.reliability.current.outcomes.done, 8 + 5);
});

test('the fleet latency quantile pools samples rather than averaging medians', () => {
  const reads = [member('o/One', TWO_WINDOWS), member('o/Two', TWO_WINDOWS)];
  const f = fleetTasksMachine(reads, { now: NOW, span: 7 });
  // Each member contributes item→pick samples 30, 40, 50 in the current window; pooled
  // that is six samples, and the count is what proves they were pooled and not folded
  // into two medians first.
  assert.equal(f.latency.current.itemToPickMinutes.n, 6);
  assert.equal(f.latency.current.itemToPickMinutes.p50, 40);
});

test('the fleet names its rates rather than averaging them', () => {
  const reads = [
    member('o/One', TWO_WINDOWS, { minuteRate: 0.008 }),
    member('o/Two', TWO_WINDOWS, { minuteRate: 0.016 }),
    member('o/Three', TWO_WINDOWS),
  ];
  const f = fleetTasksMachine(reads, { now: NOW, span: 7 });
  // Two members priced differently have no one rate, and a mean of two rates is a
  // number nothing measures.
  assert.deepEqual(f.rates.sort(), [0.008, 0.016]);
});

test('an empty fleet answers null throughout rather than zero', () => {
  const f = fleetTasksMachine([], { now: NOW, span: 7 });
  assert.equal(f.folding, 0);
  assert.equal(f.readable, 0);
  assert.equal(f.cost.current.runs, null);
  assert.equal(f.reliability.current.outcomes.done, null);
  assert.deepEqual(f.absent, []);
});
