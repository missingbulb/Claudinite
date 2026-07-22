import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mostRecentSlot, dueSlots, normalizeSchedule, DEFAULT_SCHEDULE } from '../../engine/scheduler/slots.mjs';

// Default anchor: dailyHour 4, weeklyDay Sun, monthlyDay 1 (all UTC).
const D = DEFAULT_SCHEDULE;

// --- normalizeSchedule: fills absent keys, keeps present ones ---
test('normalizeSchedule fills the documented defaults for absent keys', () => {
  assert.deepEqual(normalizeSchedule(undefined), D);
  assert.deepEqual(normalizeSchedule({}), D);
  assert.deepEqual(normalizeSchedule({ dailyHour: 9 }), { dailyHour: 9, weeklyDay: 'Sun', monthlyDay: 1 });
  assert.deepEqual(normalizeSchedule({ weeklyDay: 'Wed', monthlyDay: 15 }), { dailyHour: 4, weeklyDay: 'Wed', monthlyDay: 15 });
});

// --- hourly: top of the current hour, id at hour granularity ---
test('hourly slot is the top of the current hour regardless of the minute', () => {
  const s = mostRecentSlot('hourly', D, '2026-07-22T14:37:11Z');
  assert.equal(s.id, 'h2026-07-22T14Z');
  assert.equal(s.time.toISOString(), '2026-07-22T14:00:00.000Z');
});

// --- daily family: anchor hour ± offset, anchor-dated id ---
test('the four daily slots offset the anchor hour and share the anchor date', () => {
  const now = '2026-07-22T10:00:00Z';
  assert.deepEqual(pick('daily-2h', now), { id: 'd2026-07-22', time: '2026-07-22T02:00:00.000Z' });
  assert.deepEqual(pick('daily-1h', now), { id: 'd2026-07-22', time: '2026-07-22T03:00:00.000Z' });
  assert.deepEqual(pick('daily', now), { id: 'd2026-07-22', time: '2026-07-22T04:00:00.000Z' });
  assert.deepEqual(pick('daily+1h', now), { id: 'd2026-07-22', time: '2026-07-22T05:00:00.000Z' });
});

test('daily rolls to yesterday when now is before the anchor hour', () => {
  // 03:00, anchor 04:00 not yet reached today.
  assert.deepEqual(pick('daily', '2026-07-22T03:00:00Z'), { id: 'd2026-07-21', time: '2026-07-21T04:00:00.000Z' });
});

test('daily-2h with dailyHour < 2 wraps into the previous calendar day but keeps the anchor date', () => {
  const s = mostRecentSlot('daily-2h', { ...D, dailyHour: 1 }, '2026-07-22T10:00:00Z');
  assert.equal(s.id, 'd2026-07-22'); // anchor date, not the instant's date
  assert.equal(s.time.toISOString(), '2026-07-21T23:00:00.000Z'); // 01:00 − 2h = previous day 23:00
});

// --- weekly: most recent weeklyDay at the anchor hour ---
test('weekly resolves to the most recent weeklyDay at the anchor hour', () => {
  // 2026-07-19 is a Sunday (the DESIGN example slot).
  assert.deepEqual(pick('weekly', '2026-07-22T10:00:00Z'), { id: 'w2026-07-19', time: '2026-07-19T04:00:00.000Z' });
});

test('weekly on the weekly day but before the anchor hour rolls back a full week', () => {
  // Sunday 2026-07-19 at 02:00, anchor 04:00 not yet reached → previous Sunday.
  assert.deepEqual(pick('weekly', '2026-07-19T02:00:00Z'), { id: 'w2026-07-12', time: '2026-07-12T04:00:00.000Z' });
});

// --- monthly: monthlyDay clamped to month length ---
test('monthly resolves to the configured day of the current month', () => {
  assert.deepEqual(pick('monthly', '2026-07-22T10:00:00Z'), { id: 'm2026-07', time: '2026-07-01T04:00:00.000Z' });
});

test('monthly rolls to the previous month when the day is not yet reached', () => {
  assert.deepEqual(pick('monthly', '2026-07-10T10:00:00Z', { monthlyDay: 15 }),
    { id: 'm2026-06', time: '2026-06-15T04:00:00.000Z' });
});

test('monthly clamps monthlyDay 31 to the last day of a short month', () => {
  // 2026 is not a leap year → Feb has 28 days; day 31 clamps to the 28th.
  assert.deepEqual(pick('monthly', '2026-03-15T10:00:00Z', { monthlyDay: 31 }),
    { id: 'm2026-02', time: '2026-02-28T04:00:00.000Z' });
});

// --- dueSlots: (lastSuccess, now] window semantics ---
test('first run (no prior success) makes every declared frequency due', () => {
  const due = dueSlots(['hourly', 'daily', 'weekly', 'monthly'], D, '2026-07-22T14:00:00Z', null);
  assert.deepEqual(due.map((d) => d.frequency), ['hourly', 'daily', 'weekly', 'monthly']);
});

test('a slot already covered by the last successful run is not due again (double-run dedupe)', () => {
  // Ran the daily slot at 04:20; a second run at 05:00 sees 04:00 ≤ lastSuccess → skip.
  const due = dueSlots(['daily'], D, '2026-07-22T05:00:00Z', '2026-07-22T04:20:00Z');
  assert.deepEqual(due, []);
});

test('a missed slot catches up on the next successful run — exactly one, never a backfill storm', () => {
  // 3-day outage; only the most-recent daily slot (the 25th) is evaluated.
  const due = dueSlots(['daily'], D, '2026-07-25T10:00:00Z', '2026-07-22T04:30:00Z');
  assert.equal(due.length, 1);
  assert.equal(due[0].slotId, 'd2026-07-25');
});

test('hourly never backfills: after an outage only the current hour is due', () => {
  const due = dueSlots(['hourly'], D, '2026-07-25T10:15:00Z', '2026-07-22T09:00:00Z');
  assert.equal(due.length, 1);
  assert.equal(due[0].slotId, 'h2026-07-25T10Z');
});

test('hourly is not due twice within the same hour', () => {
  const due = dueSlots(['hourly'], D, '2026-07-22T14:50:00Z', '2026-07-22T14:12:00Z');
  assert.deepEqual(due, []);
});

test('the daily growth chain is all due together on a fresh morning run', () => {
  // A single 06:00 run after yesterday's successful run: all four daily slots
  // (02:00–05:00 today) fall in the window, in declaration order.
  const chain = ['daily-2h', 'daily-1h', 'daily', 'daily+1h'];
  const due = dueSlots(chain, D, '2026-07-22T06:00:00Z', '2026-07-21T06:00:00Z');
  assert.deepEqual(due.map((d) => [d.frequency, d.slotId]), [
    ['daily-2h', 'd2026-07-22'],
    ['daily-1h', 'd2026-07-22'],
    ['daily', 'd2026-07-22'],
    ['daily+1h', 'd2026-07-22'],
  ]);
});

test('an unknown frequency token is silently never due', () => {
  assert.deepEqual(dueSlots(['nightly'], D, '2026-07-22T14:00:00Z', null), []);
});

// Compact assertion helper: id + ISO time for a most-recent slot.
function pick(frequency, now, scheduleOverride = {}) {
  const s = mostRecentSlot(frequency, { ...D, ...scheduleOverride }, now);
  return { id: s.id, time: s.time.toISOString() };
}
