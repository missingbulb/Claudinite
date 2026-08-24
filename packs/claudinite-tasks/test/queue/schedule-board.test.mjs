// The schedule board's schema (#1115) — one module owns parse/serialize, and a
// board in any state of disrepair degrades to "absent" per-row, never throws:
// it fails toward evaluating, never toward skipping.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEDULE_PREFIX, scheduleBoardTitle, isScheduleBoardTitle,
  renderScheduleBoard, parseScheduleBoard, findScheduleBoard,
} from '../../queue/schedule-board.mjs';
import { isWorkItemTitle } from '../../queue/work-item.mjs';

const SCHEDULE = { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 };
const rows = [
  { task: 'p/daily1', frequency: 'daily', lastAsked: '2026-08-14T04:00:00.000Z', verdict: 'no', reason: 'nothing touched | nothing merged' },
  { task: 'p/daily2', frequency: 'daily', lastAsked: '2026-08-14T09:00:00.000Z', verdict: 'go', reason: '' },
];

test('render/parse round-trips the authoritative columns', () => {
  const body = renderScheduleBoard(rows, { now: new Date('2026-08-14T10:00:00Z'), schedule: SCHEDULE });
  const back = parseScheduleBoard(body);
  assert.equal(back.size, 2);
  const r = back.get('p/daily1');
  assert.equal(r.frequency, 'daily');
  assert.equal(r.lastAsked, '2026-08-14T04:00:00.000Z');
  assert.equal(r.verdict, 'no');
  assert.equal(r.reason, 'nothing touched | nothing merged', 'a reason may carry the cell separator');
  // the derived next-window column rendered too — display, never data
  assert.match(body, /2026-08-15T04:00:00\.000Z/);
});

test('a mangled body degrades to absent per-row and never throws', () => {
  assert.deepEqual([...parseScheduleBoard(null)], []);
  assert.deepEqual([...parseScheduleBoard('just prose, no table')], []);
  const half = renderScheduleBoard(rows, { now: new Date('2026-08-14T10:00:00Z'), schedule: SCHEDULE })
    .replace('| p/daily1 |', '|| broken'); // one row mangled
  const back = parseScheduleBoard(half);
  assert.equal(back.has('p/daily1'), false, 'the mangled row reads as absent');
  assert.equal(back.has('p/daily2'), true, 'the intact row survives');
});

test('the body is budgeted two-tier against the field cap — complete first, detail rationed', () => {
  const many = Array.from({ length: 3000 }, (_, i) => ({
    task: `p/t${i}`, frequency: 'daily', lastAsked: '2026-08-14T04:00:00.000Z',
    verdict: 'no', reason: 'x'.repeat(200),
  }));
  const body = renderScheduleBoard(many, { now: new Date('2026-08-14T10:00:00Z'), schedule: SCHEDULE });
  assert.ok(body.length < 64_000, 'never a write the ~64KB cap can 422');
  assert.match(body, /more row\(s\) omitted for size/, 'omissions are counted, never silent');
});

test('the board is invisible to every work-item reader, and vice versa', () => {
  assert.equal(isWorkItemTitle(scheduleBoardTitle()), false);
  assert.equal(isScheduleBoardTitle('[claudinite-work] p/t'), false);
  assert.ok(isScheduleBoardTitle(`${SCHEDULE_PREFIX} the schedule board`));
});

test('findScheduleBoard: oldest open board wins; an unreadable list forbids the write', async () => {
  const listing = (issues) => async () => ({ status: 200, json: issues });
  const two = await findScheduleBoard(listing([
    { number: 5, title: `${SCHEDULE_PREFIX} the schedule board`, body: 'a' },
    { number: 9, title: `${SCHEDULE_PREFIX} the schedule board`, body: 'b' },
  ]), 'o/r');
  assert.equal(two.issue.number, 5, 'deterministic: every run converges on the oldest');
  const none = await findScheduleBoard(listing([{ number: 3, title: '[claudinite-work] p/t' }]), 'o/r');
  assert.equal(none.readable, true);
  assert.equal(none.issue, null);
  const broken = await findScheduleBoard(async () => ({ status: 500, json: null }), 'o/r');
  assert.equal(broken.readable, false, 'never write what could not be read');
});
