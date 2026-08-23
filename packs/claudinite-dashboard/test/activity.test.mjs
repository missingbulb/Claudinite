import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activitySeries, fleetBenefits, dayLadder, dayKey, delta, commitDays, bucketWeekly,
} from '../activity.mjs';
import {
  READY, NEEDS_HUMAN, OUTCOME_DONE, OUTCOME_DELIVERED, OUTCOME_OBSOLETE,
} from '../../../engine/scheduler/queue/work-item.mjs';

const NOW = Date.parse('2026-08-18T12:00:00Z');
const DAY = 86400e3;

const closedWork = (closedAt, labels = [OUTCOME_DONE]) => ({
  number: 1,
  title: '[claudinite-work] basics/task-janitor',
  state: 'closed',
  labels,
  created_at: new Date(Date.parse(closedAt) - DAY).toISOString(),
  updated_at: closedAt,
  closed_at: closedAt,
});

const read = (over = {}) => ({
  repo: 'o/a',
  declaration: { packs: ['core'], claudinite: { updated: '2026-08-18T02:00:00Z' } },
  items: [],
  itemsComplete: true,
  runs: [],
  head: { sha: 'abc', committedAt: null },
  ...over,
});

test('the ladder is UTC days, oldest first, ending today', () => {
  const days = dayLadder(NOW, 3);
  assert.deepEqual(days, ['2026-08-16', '2026-08-17', '2026-08-18']);
  assert.equal(dayKey(NOW), '2026-08-18');
});

test('closed work lands on its own day, stacked by outcome', () => {
  const s = activitySeries([read({
    items: [
      closedWork('2026-08-17T09:00:00Z', [OUTCOME_DONE]),
      closedWork('2026-08-17T22:00:00Z', [OUTCOME_DELIVERED]),
      closedWork('2026-08-18T01:00:00Z', [OUTCOME_OBSOLETE]),
      closedWork('2026-08-18T02:00:00Z', []),
    ],
  })], { now: NOW, days: 3 });

  const byDay = Object.fromEntries(s.days.map((d) => [d.day, d]));
  assert.equal(byDay['2026-08-17'].work.done, 1);
  assert.equal(byDay['2026-08-17'].work.delivered, 1);
  assert.equal(byDay['2026-08-18'].work.obsolete, 1);
  assert.equal(byDay['2026-08-18'].work.none, 1);
  assert.equal(byDay['2026-08-16'].workClosed, 0);
  assert.equal(s.totals.workClosed, 4);
});

test('an issue that is not a work item is counted apart from the queue', () => {
  const s = activitySeries([read({
    items: [{ ...closedWork('2026-08-18T01:00:00Z'), title: 'a plain issue', labels: [] }],
  })], { now: NOW, days: 3 });
  assert.equal(s.totals.workClosed, 0);
  assert.equal(s.totals.otherClosed, 1);
});

test('runs are bucketed by conclusion, and in-flight is neither pass nor fail', () => {
  const s = activitySeries([read({
    runs: [
      { created_at: '2026-08-18T01:00:00Z', status: 'completed', conclusion: 'success' },
      { created_at: '2026-08-18T02:00:00Z', status: 'completed', conclusion: 'failure' },
      { created_at: '2026-08-18T03:00:00Z', status: 'in_progress', conclusion: null },
    ],
  })], { now: NOW, days: 3 });
  const today = s.days.at(-1);
  assert.equal(today.runs.success, 1);
  assert.equal(today.runs.failure, 1);
  assert.equal(today.runs.other, 1);
  assert.equal(s.totals.runsFailed, 1);
});

test('a member that did nothing is quiet, and one that could not be read is neither', () => {
  const s = activitySeries([
    read({ repo: 'o/busy', runs: [{ created_at: '2026-08-18T01:00:00Z', status: 'completed', conclusion: 'success' }] }),
    read({ repo: 'o/quiet' }),
    { repo: 'o/private', error: { status: 404 } },
  ], { now: NOW, days: 3 });

  assert.deepEqual(s.moved, ['o/busy']);
  assert.deepEqual(s.quiet, ['o/quiet']);
  assert.equal(s.members, 2);
  assert.equal(s.unread, 1);
});

test('a default-branch commit counts as movement even with nothing closed', () => {
  const s = activitySeries([read({ head: { sha: 'abc', committedAt: '2026-08-17T10:00:00Z' } })],
    { now: NOW, days: 3 });
  assert.deepEqual(s.moved, ['o/a']);
  assert.equal(s.days.find((d) => d.day === '2026-08-17').moved, 1);
});

test('an incomplete issue page declares the day its counts become a floor', () => {
  const s = activitySeries([read({
    itemsComplete: false,
    items: [closedWork('2026-08-17T09:00:00Z')],
  })], { now: NOW, days: 5 });
  // The oldest issue the page could see is the closed item's creation, a day before it.
  assert.equal(s.horizon.issues, '2026-08-16');
});

test('a complete issue page has no horizon — every day is a real count', () => {
  const s = activitySeries([read({ items: [closedWork('2026-08-17T09:00:00Z')] })], { now: NOW, days: 5 });
  assert.equal(s.horizon.issues, null);
});

// --- benefits -------------------------------------------------------------------

test('the benefit figures are windowed, and compared against the window before', () => {
  const b = fleetBenefits([read({
    items: [
      closedWork('2026-08-17T09:00:00Z', [OUTCOME_DONE]),
      closedWork('2026-08-16T09:00:00Z', [OUTCOME_DELIVERED]),
      closedWork('2026-08-08T09:00:00Z', [OUTCOME_DONE]),
      closedWork('2026-08-01T09:00:00Z', [OUTCOME_DONE]),     // before both windows
    ],
  })], { now: NOW, windowDays: 7 });

  assert.equal(b.current.completed, 2);
  assert.equal(b.previous.completed, 1);
  assert.deepEqual(delta(b.current.completed, b.previous.completed), { dir: 'up', by: 1 });
});

test('an item closed while parked is completed work a human was pulled into', () => {
  const b = fleetBenefits([read({
    items: [
      closedWork('2026-08-17T09:00:00Z', [OUTCOME_DONE]),
      closedWork('2026-08-17T10:00:00Z', [OUTCOME_DONE, NEEDS_HUMAN]),
    ],
  })], { now: NOW, windowDays: 7 });

  assert.equal(b.current.completed, 2);
  assert.equal(b.current.unattended, 1);
  assert.equal(b.current.parked, 1);
});

test('an item still sitting parked counts as one that needed a person', () => {
  const b = fleetBenefits([read({
    items: [{
      ...closedWork('2026-08-17T09:00:00Z', [NEEDS_HUMAN]),
      state: 'open',
      closed_at: null,
      updated_at: '2026-08-17T09:00:00Z',
    }],
  })], { now: NOW, windowDays: 7 });
  assert.equal(b.current.parked, 1);
  assert.equal(b.current.completed, 0);
});

test('an outcome-less closure is not counted as completed work', () => {
  const b = fleetBenefits([read({ items: [closedWork('2026-08-17T09:00:00Z', [READY])] })],
    { now: NOW, windowDays: 7 });
  assert.equal(b.current.completed, 0);
});

test('converging counts only the current window — a stamp carries one date', () => {
  const b = fleetBenefits([
    read({ repo: 'o/fresh', declaration: { claudinite: { updated: '2026-08-18T02:00:00Z' } } }),
    read({ repo: 'o/stopped', declaration: { claudinite: { updated: '2026-06-01T02:00:00Z' } } }),
  ], { now: NOW, windowDays: 7 });
  assert.equal(b.converged, 1);
  assert.equal(b.members, 2);
});

test('digests are counted from what was actually found, and null when none was looked for', () => {
  const withDigests = fleetBenefits([read()], { now: NOW, digests: [{ text: 'a' }, { text: null }] });
  assert.equal(withDigests.digests, 1);
  assert.equal(fleetBenefits([read()], { now: NOW }).digests, null);
});

// --- commitDays ------------------------------------------------------------------

// A week as `/stats/commit_activity` sends it: a UTC-Sunday epoch second, and seven
// daily counts from Sunday.
const week = (sundayIso, days) => ({ week: Date.parse(sundayIso) / 1000, days });

test('a week of counts lands on its own UTC days, Sunday first', () => {
  const r = commitDays([week('2026-08-16T00:00:00Z', [1, 2, 0, 4, 0, 0, 0])], { now: NOW, days: 7 });
  const by = Object.fromEntries(r.days.map((d) => [d.day, d.count]));
  assert.equal(by['2026-08-16'], 1);
  assert.equal(by['2026-08-17'], 2);
  assert.equal(by['2026-08-18'], 0);
  assert.equal(r.total, 3);      // the window ends today, so Tuesday's 4 is not in it
  assert.equal(r.peak, 2);
});

test('the window ends today and runs back N days', () => {
  const r = commitDays([], { now: NOW, days: 90 });
  assert.equal(r.days.length, 90);
  assert.equal(r.days[89].day, dayKey(NOW));
});

// The three empty answers the graph has to keep apart. A page that renders all of
// them as blank squares tells a viewer a repo was quiet when in fact it was not read.
test('a read that did not happen is null, and is not a quiet repo', () => {
  assert.equal(commitDays(null, { now: NOW }), null);
  assert.equal(commitDays(undefined, { now: NOW }), null);
});

test('a day the reported year does not cover is unread, never a zero', () => {
  const r = commitDays([week('2026-08-16T00:00:00Z', [1, 0, 0, 0, 0, 0, 0])], { now: NOW, days: 7 });
  assert.equal(r.days[0].count, null);          // 2026-08-12, outside the one week given
  assert.equal(r.days[0].day, '2026-08-12');
  assert.equal(r.unread, 4);   // 12th-15th precede the single week supplied
  assert.equal(r.total, 1);
});

test('a repo with commits reported and none made is quiet, not unread', () => {
  const r = commitDays([week('2026-08-16T00:00:00Z', [0, 0, 0, 0, 0, 0, 0])], { now: NOW, days: 3 });
  assert.deepEqual(r.days.map((d) => d.count), [0, 0, 0]);
  assert.equal(r.unread, 0);
  assert.equal(r.total, 0);
  assert.equal(r.peak, 0);
});

test('a malformed week is skipped rather than throwing the row away', () => {
  const r = commitDays([{ week: null, days: [9] }, week('2026-08-16T00:00:00Z', [3, 0, 0, 0, 0, 0, 0])],
    { now: NOW, days: 3 });
  assert.equal(r.total, 3);
});

// --- weekly buckets ----------------------------------------------------------------

// A quarter of history drawn day by day is a sawtooth: an ordinary repo's weekend is a
// trough and its Tuesday a spike, and a sawtooth has no shape to read. The daily counts
// stay — they are the total, the peak and the hover — and only the drawn line smooths.
test('the window buckets into weeks, running back from today', () => {
  const r = commitDays([week('2026-08-16T00:00:00Z', [1, 2, 3, 0, 0, 0, 0])], { now: NOW, days: 21 });
  assert.equal(r.buckets.length, 3);
  assert.equal(r.buckets[2].to, dayKey(NOW), 'the newest bucket ends today');
  assert.equal(r.buckets[2].count, 6);
  assert.equal(r.total, 6, 'the daily total is unchanged by the bucketing');
});

// The OLDEST bucket is the short one, because the newest has to end on today — a
// window that ended a partial week early would drop the days a reader looks at first.
test('an uneven window leaves the short bucket at the old end', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ day: `d${i}`, count: 1 }));
  const b = bucketWeekly(rows);
  assert.deepEqual(b.map((x) => x.days), [3, 7]);
  assert.deepEqual(b.map((x) => x.count), [3, 7]);
});

// Unread is not quiet, at the week level too: a week nothing was read for is null and
// breaks the curve, where a week that was PARTLY read is a real sum over what there was.
test('a week is null only when every day in it was unread', () => {
  const b = bucketWeekly([
    ...Array.from({ length: 7 }, (_, i) => ({ day: `a${i}`, count: null })),
    ...Array.from({ length: 7 }, (_, i) => ({ day: `b${i}`, count: i < 3 ? null : 2 })),
  ]);
  assert.equal(b[0].count, null);
  assert.equal(b[1].count, 8, 'four read days at 2 each');
});
