import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeReader, workflowRuns, readRuns, lookbackFrom, WATCHED_WORKFLOWS, FIRST_FOLD_LOOKBACK_DAYS,
} from '../../../tasks/usage-fold/read-runs.mjs';
import { SCHEDULER_WORKFLOW_FILE, EXECUTOR_WORKFLOW_FILE } from '../../../../claudinite-tasks/signals/gh.mjs';

// A fake GitHub: `routes` maps a path SUBSTRING to a body, so a test states only the
// part of the URL it cares about. Every call is recorded, because "how many requests
// did this cost" is half of why this module was rewritten.
function fakeGh(routes, { status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const hit = Object.entries(routes).find(([frag]) => url.includes(frag));
    if (!hit) return { status: 404, json: async () => null };
    return { status, json: async () => hit[1] };
  };
  return { reader: makeReader({ token: 't', api: 'https://api.test', fetchImpl }), calls };
}

const run = (id, startedAt, conclusion = 'success') => ({ id, run_started_at: startedAt, conclusion });

test('the watched workflows are the scheduler\'s and the executor\'s own file names', () => {
  // Not re-spelled here: the two names are the engine's, and a member's vendored stub
  // is what actually files the runs. A second spelling would silently count nothing.
  assert.deepEqual(WATCHED_WORKFLOWS.map((w) => w.file), [SCHEDULER_WORKFLOW_FILE, EXECUTOR_WORKFLOW_FILE]);
  assert.deepEqual(WATCHED_WORKFLOWS.map((w) => w.workflow), ['scheduler', 'executor']);
});

test('workflowRuns skips runs at or before the watermark — the day-grained filter is not enough', () => {
  const { reader } = fakeGh({
    [SCHEDULER_WORKFLOW_FILE]: {
      workflow_runs: [
        run(3, '2026-08-21T11:00:00Z'),
        run(2, '2026-08-21T10:00:00Z'),
        run(1, '2026-08-21T09:00:00Z'),   // exactly the watermark — already folded
      ],
    },
  });
  return workflowRuns(reader, 'o/r', SCHEDULER_WORKFLOW_FILE, { since: '2026-08-21T09:00:00Z' })
    .then((runs) => {
      assert.deepEqual(runs.map((r) => r.id), [3, 2]);
      assert.deepEqual(runs[0], { id: 3, startedAt: '2026-08-21T11:00:00Z', conclusion: 'success' });
    });
});

test('readRuns labels each run with its workflow, orders them oldest first, and moves the mark', async () => {
  const { reader, calls } = fakeGh({
    [SCHEDULER_WORKFLOW_FILE]: { workflow_runs: [run(3, '2026-08-21T11:00:00Z'), run(1, '2026-08-21T09:30:00Z')] },
    [EXECUTOR_WORKFLOW_FILE]: { workflow_runs: [run(2, '2026-08-21T10:15:00Z', 'failure')] },
  });
  const out = await readRuns({ reader, repo: 'o/r', since: '2026-08-21T09:00:00Z', now: '2026-08-21T11:30:00Z' });
  assert.deepEqual(out.runs.map((r) => [r.workflow, r.startedAt]), [
    ['scheduler', '2026-08-21T09:30:00Z'],
    ['executor', '2026-08-21T10:15:00Z'],
    ['scheduler', '2026-08-21T11:00:00Z'],
  ]);
  assert.equal(out.watermark, '2026-08-21T11:00:00Z', 'the newest run read, so the next fold continues from it');
  // The cost claim the module is built on: one listing per workflow, and no job logs
  // at all. Its predecessor spent two more calls per run to read records nothing
  // writes any more.
  assert.equal(calls.length, 2);
  assert.ok(calls.every((u) => u.includes('status=completed')), 'an in-progress run has no conclusion to count');
});

test('readRuns leaves the watermark where it was when nothing new landed', async () => {
  const { reader } = fakeGh({
    [SCHEDULER_WORKFLOW_FILE]: { workflow_runs: [] },
    [EXECUTOR_WORKFLOW_FILE]: { workflow_runs: [] },
  });
  const out = await readRuns({ reader, repo: 'o/r', since: '2026-08-21T09:00:00Z', now: '2026-08-21T11:30:00Z' });
  assert.deepEqual(out.runs, []);
  assert.equal(out.watermark, '2026-08-21T09:00:00Z');
});

test('an unreadable listing costs this source and nothing else', async () => {
  const reader = { json: async () => { throw new Error('network'); } };
  const out = await readRuns({ reader, repo: 'o/r', since: '2026-08-21T09:00:00Z', now: '2026-08-21T11:30:00Z' });
  assert.deepEqual(out.runs, []);
  assert.equal(out.watermark, '2026-08-21T09:00:00Z', 'so the next fold retries exactly the same runs');
  assert.match(out.error, /could not be read/);
});

test('the first fold looks back only as far as the hour tier is wide', async () => {
  // Anything older would be read and immediately pruned, which is a request spent on
  // nothing.
  assert.equal(lookbackFrom('2026-08-21T11:00:00Z'), '2026-08-18T11:00:00.000Z');
  assert.equal(FIRST_FOLD_LOOKBACK_DAYS, 3);

  const { reader, calls } = fakeGh({
    [SCHEDULER_WORKFLOW_FILE]: { workflow_runs: [] }, [EXECUTOR_WORKFLOW_FILE]: { workflow_runs: [] },
  });
  await readRuns({ reader, repo: 'o/r', since: null, now: '2026-08-21T11:00:00Z' });
  assert.ok(calls.every((u) => u.includes('2026-08-18')), calls.join('\n'));
});
