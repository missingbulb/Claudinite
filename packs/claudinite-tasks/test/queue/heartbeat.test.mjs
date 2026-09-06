// The holder's sign of life (DESIGN §15.15) and the reclaim clock it corrects
// (#924). Two things are pinned here that no single-call test could see: that the
// beat happens WHILE work is in flight, and that a comment written by an executor
// which let the item go does not read as that item being worked on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEARTBEAT_MARKER, heartbeatComment, lastLivenessAt, withHeartbeat,
  agentBeatComment, withProgress,
} from '../../queue/heartbeat.mjs';
import { parseProgressLines, parseContextLines } from '../../queue/work-item.mjs';
import { planSchedulerRun } from '../../queue/scheduler-run.mjs';
import { CLAIM_MARKER, EPISODE_MARKER } from '../../queue/work-item.mjs';

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
//
// NOTHING BELOW READS THE CLOCK. These tests used to start a 5ms interval and
// wait 40ms of real time for at least two beats — 2 of a possible 8, which a
// loaded runner coalescing timers failed, reddening CI on changes that touched
// none of this (#1219). Mock timers make the count exact: N intervals ticked, N
// beats, which is the property the tests actually mean. Never re-introduce a
// real `setTimeout` wait here to "give the beat a chance"; that is the bug.

// The beat is dispatched through a promise chain (so the fail-soft catch can
// wrap it), so a tick schedules it rather than running it. This drains what the
// tick queued, without touching the interval.
const flush = () => new Promise(setImmediate);

test('the beat runs while the work is in flight, and stops when it ends', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const beats = [];
  let release;
  const work = new Promise((r) => { release = r; });
  const running = withHeartbeat(() => work, { intervalMs: 5, beat: (m) => beats.push(m) });

  t.mock.timers.tick(5); await flush();
  t.mock.timers.tick(5); await flush();
  assert.equal(beats.length, 2, 'two intervals elapsed while the work was in flight, two beats');

  release('done');
  assert.equal(await running, 'done');
  t.mock.timers.tick(5 * 10); await flush();
  assert.equal(beats.length, 2, 'and stopped the moment the work returned');
});

test('work that throws still stops the beat', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const beats = [];
  await assert.rejects(
    withHeartbeat(async () => { throw new Error('boom'); }, { intervalMs: 5, beat: () => beats.push(1) }),
    /boom/);
  t.mock.timers.tick(5 * 10); await flush();
  assert.equal(beats.length, 0, 'the interval was cleared on the way out, not left running');
});

// A beat that cannot post must not sink a run that is otherwise fine — but it is
// never silent, because a run whose heartbeat failed is one the leash may reclaim
// underneath it, and nothing else would say so.
test('a failing beat is reported, not swallowed, and the work still returns', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const lines = [];
  let release;
  const work = new Promise((r) => { release = r; });
  const running = withHeartbeat(() => work,
    { intervalMs: 5, beat: () => { throw new Error('403'); }, log: (l) => lines.push(l) });
  t.mock.timers.tick(5); await flush();
  release('ok');
  assert.equal(await running, 'ok');
  assert.ok(lines.some((l) => l.startsWith('!') && l.includes('403')), lines.join('\n'));
});

test('the beat says who is working and how long they have been', () => {
  const body = heartbeatComment({ executor: 'E1', at: '2026-08-20T04:15:00Z', minutes: 15 });
  assert.ok(body.startsWith(HEARTBEAT_MARKER), 'machine-readable first');
  assert.match(body, /E1/);
  assert.match(body, /15 minute/);
});

// The agent phase's beat. What is pinned is the pair that can drift apart: the writer
// (`agentBeatComment`) and the reader (`lastLivenessAt`) live in one file today, but the
// leash counts a beat by its MARKER, so a beat given a marker of its own stops resetting
// the leash with nothing going red — the case below is what notices. The session URL and
// the note are asserted for the same reason: the no-progress park reads that note, so a
// beat that drops it is a beat nothing downstream can judge.
//
// WHAT THESE CANNOT CATCH: that a session actually beats. That is prose in `executor.md`
// and nothing enforces it — these prove only that a beat, once posted, counts and that
// the progress it leaves behind accumulates.

test('an agent beat is the holder\'s own signal, counted exactly as the executor\'s is', () => {
  const beat = { created_at: '2026-08-20T06:00:00Z', body: agentBeatComment({ session: 'https://claude.ai/code/session_01AB', at: '2026-08-20T06:00:00Z', note: '3/15 groups triaged' }) };
  assert.equal(lastLivenessAt([claim('2026-08-20T04:00:00Z'), beat]), '2026-08-20T06:00:00.000Z');
  assert.match(beat.body, /session_01AB/);
  assert.match(beat.body, /3\/15 groups triaged/);
  // A session that does not know its own URL still beats, and still counts.
  assert.equal(lastLivenessAt([{ created_at: '2026-08-20T07:00:00Z', body: agentBeatComment({ at: '2026-08-20T07:00:00Z', note: 'still going' }) }]),
    '2026-08-20T07:00:00.000Z');
});

test('progress APPENDS to the item body and keeps every earlier line', () => {
  let body = '### Context\n\n- triage the touched issues\n';
  body = withProgress(body, '06:00 — 3/15 groups triaged');
  body = withProgress(body, '06:45 — 9/15 triaged; #1234 filed');
  body = withProgress(body, '07:30 — all 15 triaged; PR #1235 opened');
  assert.deepEqual(parseProgressLines(body), [
    '06:00 — 3/15 groups triaged',
    '06:45 — 9/15 triaged; #1234 filed',
    '07:30 — all 15 triaged; PR #1235 opened',
  ]);
  // One Progress section, and the Context it was born with is untouched.
  assert.equal(body.match(/^### Progress$/gm).length, 1);
  assert.deepEqual(parseContextLines(body), ['triage the touched issues']);
});
