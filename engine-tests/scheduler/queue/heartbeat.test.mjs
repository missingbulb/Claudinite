// The holder's sign of life (DESIGN §15.15) and the reclaim clock it corrects
// (#924). Two things are pinned here that no single-call test could see: that the
// beat happens WHILE work is in flight, and that a comment written by an executor
// which let the item go does not read as that item being worked on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEARTBEAT_MARKER, heartbeatComment, lastLivenessAt, withHeartbeat,
} from '../../../engine/scheduler/queue/heartbeat.mjs';
import { planSchedulerRun } from '../../../engine/scheduler/queue/scheduler-run.mjs';
import { CLAIM_MARKER, EPISODE_MARKER } from '../../../engine/scheduler/queue/work-item.mjs';

const claim = (at, extra = '') => ({ created_at: at, body: `${CLAIM_MARKER}\nClaimed by executor \`E1\`.${extra}` });
const beat = (at) => ({ created_at: at, body: heartbeatComment({ executor: 'E1', at, minutes: 15 }) });

test('liveness is the newest live claim or heartbeat', () => {
  assert.equal(lastLivenessAt([claim('2026-08-20T04:00:00Z'), beat('2026-08-20T04:15:00Z')]),
    '2026-08-20T04:15:00.000Z');
  assert.equal(lastLivenessAt([]), null);
  // Ordinary prose on the item is not a sign that anyone is working on it.
  assert.equal(lastLivenessAt([{ created_at: '2026-08-20T05:00:00Z', body: 'just a comment' }]), null);
});

// #924, exactly: an executor that LOST the claim race strikes its own claim and
// walks away. That strike is a comment, so the issue's `updated_at` moves — and a
// clock read off the issue would defer the reclaim of an item nobody holds.
test('a struck claim is not a sign of life', async () => {
  const struck = claim('2026-08-20T05:00:00Z', `\n\n${EPISODE_MARKER}\nThis claim is spent.`);
  assert.equal(lastLivenessAt([claim('2026-08-20T04:00:00Z'), struck]), '2026-08-20T04:00:00.000Z');
  assert.equal(lastLivenessAt([struck]), null);
});

// --- the reclaim reads it ------------------------------------------------------

const SCHEDULE = { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 };
const executing = (over = {}) => ({
  number: 1, title: '[claudinite-work] p/a', state: 'open', labels: ['task:executing'],
  body: 'packs/p/tasks/a/task.md\n', created_at: '2026-08-20T03:00:00Z',
  updated_at: '2026-08-20T03:00:00Z', ...over,
});
const reclaims = async (item, now) => (await planSchedulerRun({
  tasks: [], items: [item], now: new Date(now), schedule: SCHEDULE,
})).ops.filter((o) => o.kind === 'reclaim');

test('a beating holder is not reclaimed, however long its work runs', async () => {
  const item = executing({ livenessAt: '2026-08-20T09:50:00Z', updated_at: '2026-08-20T09:50:00Z' });
  assert.deepEqual(await reclaims(item, '2026-08-20T10:00:00Z'), [], 'six hours in and still alive');
});

test('a silent holder is reclaimed even though the item was commented on', async () => {
  // The item was touched ten minutes ago — by somebody else — while its holder
  // has said nothing for two hours. The issue's clock says fresh; the holder's
  // says dead, and the holder's is the one that decides.
  const item = executing({ livenessAt: '2026-08-20T08:00:00Z', updated_at: '2026-08-20T09:50:00Z' });
  assert.equal((await reclaims(item, '2026-08-20T10:00:00Z')).length, 1);
});

test('an unreadable liveness falls back to the issue clock rather than reclaiming blind', async () => {
  const fresh = executing({ livenessAt: null, updated_at: '2026-08-20T09:50:00Z' });
  assert.deepEqual(await reclaims(fresh, '2026-08-20T10:00:00Z'), []);
  const stale = executing({ livenessAt: null, updated_at: '2026-08-20T08:00:00Z' });
  assert.equal((await reclaims(stale, '2026-08-20T10:00:00Z')).length, 1);
});

// --- the beat itself -----------------------------------------------------------

test('the beat runs while the work is in flight, and stops when it ends', async () => {
  const beats = [];
  let release;
  const work = new Promise((r) => { release = r; });
  const running = withHeartbeat(() => work, { intervalMs: 5, beat: (m) => beats.push(m) });
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(beats.length >= 2, `beat while the work ran (got ${beats.length})`);
  release('done');
  assert.equal(await running, 'done');
  const after = beats.length;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(beats.length, after, 'and stopped the moment the work returned');
});

test('work that throws still stops the beat', async () => {
  const beats = [];
  await assert.rejects(
    withHeartbeat(async () => { throw new Error('boom'); }, { intervalMs: 5, beat: () => beats.push(1) }),
    /boom/);
  const after = beats.length;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(beats.length, after);
});

// A beat that cannot post must not sink a run that is otherwise fine — but it is
// never silent, because a run whose heartbeat failed is one the leash may reclaim
// underneath it, and nothing else would say so.
test('a failing beat is reported, not swallowed, and the work still returns', async () => {
  const lines = [];
  const res = await withHeartbeat(
    async () => { await new Promise((r) => setTimeout(r, 30)); return 'ok'; },
    { intervalMs: 5, beat: () => { throw new Error('403'); }, log: (l) => lines.push(l) });
  assert.equal(res, 'ok');
  assert.ok(lines.some((l) => l.startsWith('!') && l.includes('403')), lines.join('\n'));
});

test('the beat says who is working and how long they have been', () => {
  const body = heartbeatComment({ executor: 'E1', at: '2026-08-20T04:15:00Z', minutes: 15 });
  assert.ok(body.startsWith(HEARTBEAT_MARKER), 'machine-readable first');
  assert.match(body, /E1/);
  assert.match(body, /15 minute/);
});
