// The task-janitor's sweep — dispatch-issue recovery as the THIRD responsibility
// (owner, 2026-08-06: scheduler creates, executor executes its one issue, janitor
// cleans up). These are the recovery backstops that used to run inside the
// scheduler's hourly pass (maintainDispatchIssues), moved here with the code.
// The verdicts themselves are dispatch.mjs's pure rules, tested in
// engine-tests/scheduler/dispatch.test.mjs; this file tests the janitor's I/O
// shell over the GitHub calls it actually makes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sweep } from '../tasks/task-janitor/worker.mjs';
import { SCHEDULER_LABELS, READY_LABEL, READY_FLEET_LABEL, AGENT_RUNNING_LABEL, NEEDS_HUMAN_LABEL } from '../../../engine/scheduler/dispatch.mjs';

// A fake gh that serves one search result set and records every write.
const janitorGh = (items) => {
  const calls = [];
  const gh = async (path, opts = {}) => {
    calls.push({ path, method: opts.method ?? 'GET', body: opts.body });
    if (path.startsWith('/search/issues')) return { status: 200, json: { items } };
    return { status: opts.method === 'POST' && path.endsWith('/labels') ? 201 : 200, json: null };
  };
  return { gh, calls };
};
const quiet = async (fn) => {
  const orig = console.log; console.log = () => {};
  try { return await fn(); } finally { console.log = orig; }
};

test('sweep re-arms a lost trigger by removing and re-adding its own ready label', async () => {
  const { gh, calls } = janitorGh([
    { number: 11, title: '[claudinite-task] basics/baselining d2026-07-22', labels: [{ name: READY_FLEET_LABEL }], created_at: '2026-07-22T01:00:00Z', updated_at: '2026-07-22T01:00:00Z', comments: 0 },
  ]);
  const out = await quiet(() => sweep(gh, 'o/r', '2026-07-22T02:00:00Z'));
  assert.deepEqual(out.rearmed, [11]);

  // Remove then re-add — a bare re-apply emits no `labeled` event, so both halves
  // are load-bearing, and the label must be the fleet one the issue already had.
  const del = calls.find((c) => c.method === 'DELETE');
  assert.equal(del.path, `/repos/o/r/issues/11/labels/${encodeURIComponent(READY_FLEET_LABEL)}`);
  const add = calls.find((c) => c.method === 'POST' && c.path === '/repos/o/r/issues/11/labels');
  assert.deepEqual(add.body.labels, [READY_FLEET_LABEL]);
  assert.ok(calls.indexOf(del) < calls.indexOf(add));
});

test('sweep leaves a fresh, claimed, or commented issue completely alone', async () => {
  const { gh, calls } = janitorGh([
    { number: 1, title: '[claudinite-task] basics/baselining d2026-07-22', labels: [{ name: READY_LABEL }], created_at: '2026-07-22T01:55:00Z', updated_at: '2026-07-22T01:55:00Z', comments: 0 }, // 5m old
    { number: 2, title: '[claudinite-task] p/b d2026-07-22', labels: [{ name: AGENT_RUNNING_LABEL }], created_at: '2026-07-22T01:00:00Z', updated_at: '2026-07-22T01:58:00Z', comments: 1 }, // live claim
    { number: 3, title: '[claudinite-task] p/c d2026-07-22', labels: [{ name: READY_LABEL }], created_at: '2026-07-22T01:00:00Z', updated_at: '2026-07-22T01:30:00Z', comments: 2 }, // engaged
  ]);
  const out = await quiet(() => sweep(gh, 'o/r', '2026-07-22T02:00:00Z'));
  assert.deepEqual(out, { open: 3, stale: [], deadClaims: [], rearmed: [] });
  assert.equal(calls.filter((c) => c.method !== 'GET').length, 0); // read-only run
});

test('sweep escalates a stale issue and does NOT also re-arm it', async () => {
  const { gh, calls } = janitorGh([
    { number: 21, title: '[claudinite-task] basics/baselining d2026-07-22', labels: [{ name: READY_LABEL }], created_at: '2026-07-22T01:00:00Z', updated_at: '2026-07-22T01:00:00Z', comments: 0 },
  ]);
  const out = await quiet(() => sweep(gh, 'o/r', '2026-07-25T05:00:00Z')); // ~3d → past 2 daily periods
  assert.deepEqual(out.stale, [21]);
  assert.deepEqual(out.rearmed, []); // the two rules overlap here; stale has to win

  assert.ok(calls.some((c) => c.path === '/repos/o/r/issues/21/comments' && c.method === 'POST'));
  // The ready label comes off, so an escalated issue stops being armed.
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.path.endsWith(encodeURIComponent(READY_LABEL))));
  const add = calls.find((c) => c.method === 'POST' && c.path === '/repos/o/r/issues/21/labels');
  assert.deepEqual(add.body.labels, [NEEDS_HUMAN_LABEL]);
});

test('sweep reclaims a dead agent-running claim', async () => {
  const { gh, calls } = janitorGh([
    { number: 31, title: '[claudinite-task] p/a d2026-07-22', labels: [{ name: AGENT_RUNNING_LABEL }], created_at: '2026-07-22T01:00:00Z', updated_at: '2026-07-22T02:00:00Z', comments: 1 },
  ]);
  const out = await quiet(() => sweep(gh, 'o/r', '2026-07-22T12:00:00Z')); // 10h idle
  assert.deepEqual(out.deadClaims, [31]);
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.path.endsWith(AGENT_RUNNING_LABEL)));
  const add = calls.find((c) => c.method === 'POST' && c.path === '/repos/o/r/issues/31/labels');
  assert.deepEqual(add.body.labels, [NEEDS_HUMAN_LABEL]);
});

test('sweep ensures the labels before applying needs-human', async () => {
  const { gh, calls } = janitorGh([
    { number: 41, title: '[claudinite-task] p/a d2026-07-22', labels: [{ name: READY_LABEL }], created_at: '2026-07-22T01:00:00Z', updated_at: '2026-07-22T01:00:00Z', comments: 0 },
  ]);
  await quiet(() => sweep(gh, 'o/r', '2026-07-25T05:00:00Z'));
  // GitHub 422s on applying an unknown label, so the ensure has to precede the write.
  const ensured = calls.filter((c) => c.path === '/repos/o/r/labels');
  assert.equal(ensured.length, SCHEDULER_LABELS.length);
  const firstWrite = calls.findIndex((c) => c.path.startsWith('/repos/o/r/issues/41'));
  assert.ok(calls.indexOf(ensured.at(-1)) < firstWrite);
});

test('an idle repo with no open dispatch issues writes nothing — not even the label ensure', async () => {
  const { gh, calls } = janitorGh([]);
  const out = await quiet(() => sweep(gh, 'o/r', '2026-07-22T02:00:00Z'));
  assert.deepEqual(out, { open: 0, stale: [], deadClaims: [], rearmed: [] });
  assert.equal(calls.filter((c) => c.method !== 'GET').length, 0);
});

test('an unreadable dispatch-issue search fails the run rather than reporting a clean sweep', async () => {
  const gh = async () => ({ status: 403, json: null });
  await assert.rejects(() => quiet(() => sweep(gh, 'o/r', '2026-07-22T02:00:00Z')), /could not list/);
});
