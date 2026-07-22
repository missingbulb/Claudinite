import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dispatchTitle, dispatchTaskKey, parseDispatchTitle, isDispatchTitle,
  dispatchBody, planDispatch, staleDispatchIssues, staleEscalationComment,
  READY_LABEL, NEEDS_HUMAN_LABEL,
} from '../../engine/scheduler/dispatch.mjs';

// --- identity: title / key / parse round-trip ---
test('dispatch title and key follow the [claudinite-task] <pack>/<task> <slot> shape', () => {
  assert.equal(dispatchTitle({ pack: 'gcec', task: 'create-extractor', slotId: 'h2026-07-22T14Z' }),
    '[claudinite-task] gcec/create-extractor h2026-07-22T14Z');
  assert.equal(dispatchTaskKey({ pack: 'gcec', task: 'create-extractor' }),
    '[claudinite-task] gcec/create-extractor');
});

test('parseDispatchTitle round-trips a title and rejects non-dispatch titles', () => {
  const t = dispatchTitle({ pack: 'basics', task: 'baselining', slotId: 'd2026-07-22' });
  assert.deepEqual(parseDispatchTitle(t), { pack: 'basics', task: 'baselining', slotId: 'd2026-07-22' });
  assert.equal(parseDispatchTitle('Claudinite tracker: Repo Tidy'), null);
  assert.equal(parseDispatchTitle('[claudinite-task] malformed'), null);
  assert.equal(isDispatchTitle(t), true);
  assert.equal(isDispatchTitle('some feature request'), false);
});

// --- body: first line is the task path; Context only when the precondition emits it ---
test('dispatchBody puts the task path first and includes Context only when present', () => {
  const withCtx = dispatchBody({
    taskPath: '.claudinite/local/packs/gcec/tasks/create-extractor/task.md',
    pack: 'gcec', task: 'create-extractor', slotId: 'h2026-07-22T14Z',
    context: ['Eligible requests: #123, #125. #124 is blocked — do not touch it.'],
  });
  const lines = withCtx.split('\n');
  assert.equal(lines[0], '.claudinite/local/packs/gcec/tasks/create-extractor/task.md');
  assert.match(withCtx, /binding scope — do not re-decide it/);
  assert.match(withCtx, /### Context\n- Eligible requests: #123, #125\./);

  const noCtx = dispatchBody({ taskPath: 'p/task.md', pack: 'basics', task: 'baselining', slotId: 'd2026-07-22' });
  assert.equal(noCtx.split('\n')[0], 'p/task.md');
  assert.doesNotMatch(noCtx, /### Context/);
  assert.doesNotMatch(noCtx, /binding scope/); // no scope sentence with nothing to bind
});

// --- planDispatch: exactly-once, at-most-one-open, create ---
test('planDispatch creates when no issue exists for the task family', () => {
  const v = planDispatch({ existing: [], pack: 'gcec', task: 'create-extractor', slotId: 'h2026-07-22T14Z' });
  assert.equal(v.action, 'create');
  assert.equal(v.title, '[claudinite-task] gcec/create-extractor h2026-07-22T14Z');
  assert.equal(v.label, READY_LABEL);
});

test('planDispatch skips when this exact slot already exists in any state (exactly-once)', () => {
  const existing = [{ number: 9, title: '[claudinite-task] gcec/create-extractor h2026-07-22T14Z', state: 'closed' }];
  const v = planDispatch({ existing, pack: 'gcec', task: 'create-extractor', slotId: 'h2026-07-22T14Z' });
  assert.equal(v.action, 'skip');
});

test('planDispatch suppresses a new filing while any slot of the task is still open (at-most-one-open)', () => {
  const existing = [{ number: 12, title: '[claudinite-task] gcec/create-extractor h2026-07-22T13Z', state: 'open' }];
  const v = planDispatch({ existing, pack: 'gcec', task: 'create-extractor', slotId: 'h2026-07-22T14Z' });
  assert.equal(v.action, 'suppress');
  assert.equal(v.openIssue, 12);
});

test('planDispatch does not confuse a task whose name prefixes another (the trailing-space guard)', () => {
  // An open `extract-more` issue must not suppress `extract`, and vice versa.
  const existing = [{ number: 5, title: '[claudinite-task] gcec/extract-more h2026-07-22T13Z', state: 'open' }];
  const v = planDispatch({ existing, pack: 'gcec', task: 'extract', slotId: 'h2026-07-22T14Z' });
  assert.equal(v.action, 'create');
});

test('planDispatch prefers the exactly-once skip over the open-suppress when both could apply', () => {
  const existing = [
    { number: 20, title: '[claudinite-task] gcec/create-extractor h2026-07-22T14Z', state: 'open' },
  ];
  const v = planDispatch({ existing, pack: 'gcec', task: 'create-extractor', slotId: 'h2026-07-22T14Z' });
  assert.equal(v.action, 'skip'); // the exact-slot match wins — never re-file the same slot
});

// --- staleDispatchIssues: older than ~2 periods, by slot kind ---
test('staleDispatchIssues flags issues older than 2 of their own period and spares fresh ones', () => {
  const now = '2026-07-22T12:00:00Z';
  const open = [
    { number: 1, title: '[claudinite-task] gcec/create-extractor h2026-07-22T09Z', created_at: '2026-07-22T09:05:00Z' }, // hourly, ~3h old > 2h → stale
    { number: 2, title: '[claudinite-task] gcec/create-extractor h2026-07-22T11Z', created_at: '2026-07-22T11:20:00Z' }, // hourly, <2h → fresh
    { number: 3, title: '[claudinite-task] basics/baselining d2026-07-21', created_at: '2026-07-21T02:00:00Z' }, // daily, ~34h < 48h → fresh
    { number: 4, title: 'unrelated feature request', created_at: '2020-01-01T00:00:00Z' }, // not a dispatch issue → ignored
  ];
  const stale = staleDispatchIssues(open, now);
  assert.deepEqual(stale.map((i) => i.number), [1]);
});

test('staleDispatchIssues respects a daily issue crossing the 2-day threshold', () => {
  const now = '2026-07-24T05:00:00Z';
  const open = [{ number: 7, title: '[claudinite-task] basics/baselining d2026-07-21', created_at: '2026-07-21T02:00:00Z' }]; // ~3d old > 2d
  assert.deepEqual(staleDispatchIssues(open, now).map((i) => i.number), [7]);
});

test('staleEscalationComment names the task and the needs-human label', () => {
  const c = staleEscalationComment({ number: 1, title: '[claudinite-task] gcec/create-extractor h2026-07-22T09Z' });
  assert.match(c, /gcec\/create-extractor \(slot h2026-07-22T09Z\)/);
  assert.match(c, new RegExp(NEEDS_HUMAN_LABEL));
});
