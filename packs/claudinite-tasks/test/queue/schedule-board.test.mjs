// The schedule board's schema (#1115) — one module owns parse/serialize, and a
// board in any state of disrepair degrades to "absent" per-row, never throws:
// it fails toward evaluating, never toward skipping.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEDULE_PREFIX, scheduleBoardTitle, isScheduleBoardTitle,
  renderScheduleBoard, parseScheduleBoard, findScheduleBoard, SCHEDULE_BOARD_LABEL, writeScheduleBoard,
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

// #1677 — the board is a machine artifact nobody acts on, so it is kept CLOSED
// and out of the repo's issue list. Which makes finding it again the whole
// problem: paging a long-lived repo's closed history every hour is not an
// option, so the board carries a label and the closed lookup is scoped to it.
test('findScheduleBoard: a closed board is found by its label, without paging the closed history', async () => {
  const seen = [];
  const gh = async (path) => {
    seen.push(path);
    if (path.includes('state=open')) return { status: 200, json: [{ number: 3, title: '[claudinite-work] p/t' }] };
    if (path.includes(`labels=${SCHEDULE_BOARD_LABEL.name}`)) {
      return { status: 200, json: [{ number: 7, title: scheduleBoardTitle(), body: 'b', state: 'closed', labels: [{ name: SCHEDULE_BOARD_LABEL.name }] }] };
    }
    return { status: 200, json: [] };
  };
  const found = await findScheduleBoard(gh, 'o/r');
  assert.equal(found.readable, true);
  assert.equal(found.issue.number, 7);
  assert.equal(found.issue.state, 'closed');
  assert.equal(found.issue.labeled, true, 'no relabel write is owed');
  assert.ok(seen.every((p) => p.includes('state=open') || p.includes(`labels=${SCHEDULE_BOARD_LABEL.name}`)),
    `the closed half is only ever read through the label: ${seen.join(' ')}`);
});

test('findScheduleBoard: an OPEN board is adopted — it predates the label, or someone reopened it', async () => {
  const gh = async (path) => (path.includes('state=open')
    ? { status: 200, json: [{ number: 4, title: scheduleBoardTitle(), body: 'a', state: 'open', labels: [] }] }
    : { status: 200, json: [] });
  const found = await findScheduleBoard(gh, 'o/r');
  assert.equal(found.issue.number, 4);
  assert.equal(found.issue.state, 'open', 'the write closes it');
  assert.equal(found.issue.labeled, false, 'and labels it');
});

test('findScheduleBoard: an unreadable label listing forbids the write too', async () => {
  const gh = async (path) => (path.includes('state=open')
    ? { status: 200, json: [] } : { status: 500, json: null });
  assert.equal((await findScheduleBoard(gh, 'o/r')).readable, false);
});


// The write is where "kept closed" is actually enforced (#1677): the state and
// the label are stated on EVERY write, which is what converges a board filed
// before either rule and one somebody reopened.
const recorder = (over = {}) => {
  const calls = [];
  const gh = async (path, opts = {}) => {
    calls.push({ path, method: opts.method ?? 'GET', body: opts.body ?? null });
    for (const [re, res] of Object.entries(over)) if (new RegExp(re).test(path)) return res;
    if (opts.method === 'POST' && /\/issues$/.test(path)) return { status: 201, json: { number: 42 } };
    return { status: 200, json: {} };
  };
  return { gh, calls };
};

test('the board is created CLOSED and labelled', async () => {
  const { gh, calls } = recorder();
  const line = await writeScheduleBoard(gh, 'o/r', { issue: null, rows, schedule: SCHEDULE, now: new Date('2026-08-14T10:00:00Z') });
  const label = calls.find((c) => c.path === '/repos/o/r/labels');
  assert.equal(label?.body?.name, SCHEDULE_BOARD_LABEL.name, 'the label is ensured before it is applied');
  const create = calls.find((c) => c.method === 'POST' && c.path === '/repos/o/r/issues');
  assert.deepEqual(create.body.labels, [SCHEDULE_BOARD_LABEL.name]);
  assert.equal(create.body.title, scheduleBoardTitle());
  const shut = calls.find((c) => c.method === 'PATCH' && c.path === '/repos/o/r/issues/42');
  assert.deepEqual(shut.body, { state: 'closed', state_reason: 'completed' });
  assert.match(line, /created closed as #42/);
});

test('an open, unlabelled board is rewritten, closed and labelled in one write', async () => {
  const { gh, calls } = recorder();
  const line = await writeScheduleBoard(gh, 'o/r', {
    issue: { number: 4, body: 'old', state: 'open', labeled: false },
    rows, schedule: SCHEDULE, now: new Date('2026-08-14T10:00:00Z'),
  });
  const patch = calls.find((c) => c.method === 'PATCH' && c.path === '/repos/o/r/issues/4');
  assert.equal(patch.body.state, 'closed');
  assert.equal(patch.body.state_reason, 'completed');
  assert.match(patch.body.body, /p\/daily1/, 'the rows are written in the same call');
  assert.deepEqual(calls.find((c) => c.path === '/repos/o/r/issues/4/labels')?.body,
    { labels: [SCHEDULE_BOARD_LABEL.name] });
  assert.match(line, /updated and closed/);
});

test('an already-labelled board is not relabelled, and a failed create is reported, not closed', async () => {
  const { gh, calls } = recorder();
  await writeScheduleBoard(gh, 'o/r', {
    issue: { number: 7, body: '', state: 'closed', labeled: true },
    rows, schedule: SCHEDULE, now: new Date('2026-08-14T10:00:00Z'),
  });
  assert.equal(calls.some((c) => c.path.endsWith('/issues/7/labels')), false);

  const denied = recorder({ '/issues$': { status: 403, json: { message: 'no' } } });
  const line = await writeScheduleBoard(denied.gh, 'o/r', { issue: null, rows, schedule: SCHEDULE });
  assert.match(line, /^! could not create the schedule board: 403/);
  assert.equal(denied.calls.some((c) => c.method === 'PATCH'), false, 'nothing to close');
});
