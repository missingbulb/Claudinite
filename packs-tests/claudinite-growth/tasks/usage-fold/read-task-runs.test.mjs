import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeReader, schedulerRuns, runLogText, readTaskRuns, lookbackFrom,
  MAX_RUNS_PER_FOLD, FIRST_FOLD_LOOKBACK_DAYS,
} from '../../../../packs/claudinite-growth/tasks/usage-fold/read-task-runs.mjs';
import { TASK_RUN_TAG } from '../../../../engine/scheduler/run-record.mjs';

// A fake API: paths → responses, so the whole read is exercised without a network.
// Every response shape below is the one GitHub actually answers with — a runs list
// under `workflow_runs`, a jobs list under `jobs`, and a job log as plain text with
// Actions' own timestamp in front of every line.
function fakeApi(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const path = url.replace('https://api.github.com', '');
    const hit = Object.entries(routes).find(([prefix]) => path.startsWith(prefix));
    if (!hit) return { status: 404, json: async () => null, text: async () => '' };
    const value = typeof hit[1] === 'function' ? hit[1](path) : hit[1];
    if (typeof value === 'string') return { status: 200, json: async () => null, text: async () => value };
    return { status: 200, json: async () => value, text: async () => JSON.stringify(value) };
  };
  return { reader: makeReader({ token: 't', fetchImpl }), calls };
}

const stamped = (line) => `2026-07-29T04:44:12.3456789Z ${line}`;
// A record line as the retired slot scheduler wrote it. Spelled out here rather
// than rendered: the writer is gone (#974) and this reader's job is exactly to keep
// reading logs it already left, so the fixture must be the literal past shape.
const jobLog = (...lines) => [
  stamped('##[group]Run node <the retired slot scheduler>'),
  stamped('## Claudinite scheduler'),
  ...lines.map(stamped),
].join('\n');

const run = (pack, task, outcome) => `${TASK_RUN_TAG} v1 ${pack}/${task} [d2026-07-29] ${outcome}`;

test('schedulerRuns takes completed runs past the watermark, oldest first', () => {
  const { reader } = fakeApi({
    '/repos/o/r/actions/workflows/claudinite-scheduler.yml/runs': {
      workflow_runs: [
        { id: 3, run_started_at: '2026-07-29T06:44:00Z' },
        { id: 2, run_started_at: '2026-07-29T05:44:00Z' },
        { id: 1, run_started_at: '2026-07-29T04:44:00Z' },   // == watermark: already folded
      ],
    },
  });
  return schedulerRuns(reader, 'o/r', { since: '2026-07-29T04:44:00Z' }).then((runs) => {
    assert.deepEqual(runs.map((r) => r.id), [2, 3], 'oldest first, watermark run excluded');
  });
});

test('schedulerRuns asks only for completed runs — an in-progress log is still being written', async () => {
  const { reader, calls } = fakeApi({ '/repos/o/r/actions/workflows': { workflow_runs: [] } });
  await schedulerRuns(reader, 'o/r', { since: '2026-07-29T04:44:00Z' });
  assert.ok(calls[0].includes('status=completed'), calls[0]);
  assert.ok(calls[0].includes('created='), 'and bounds the listing by date rather than paging all of history');
});

test('runLogText concatenates every job log of the run', async () => {
  const { reader } = fakeApi({
    '/repos/o/r/actions/runs/9/jobs': { jobs: [{ id: 11 }, { id: 12 }] },
    '/repos/o/r/actions/jobs/11/logs': 'first job\n',
    '/repos/o/r/actions/jobs/12/logs': 'second job\n',
  });
  const text = await runLogText(reader, 'o/r', 9);
  assert.match(text, /first job/);
  assert.match(text, /second job/);
});

test('readTaskRuns dates each record by the run it came from, and advances the watermark', async () => {
  const { reader } = fakeApi({
    '/repos/o/r/actions/workflows': {
      workflow_runs: [
        { id: 2, run_started_at: '2026-07-29T04:44:00Z' },
        { id: 1, run_started_at: '2026-07-28T04:44:00Z' },
      ],
    },
    '/repos/o/r/actions/runs/1/jobs': { jobs: [{ id: 101 }] },
    '/repos/o/r/actions/runs/2/jobs': { jobs: [{ id: 102 }] },
    '/repos/o/r/actions/jobs/101/logs': jobLog(run('tidy-repo', 'tidy-issues', 'agent')),
    '/repos/o/r/actions/jobs/102/logs': jobLog(
      run('claudinite-growth', 'usage-fold', 'preprocess'),
      run('tidy-repo', 'tidy-issues', 'skipped'),
    ),
  });
  const { records, watermark, remaining } = await readTaskRuns({
    reader, repo: 'o/r', since: '2026-07-27T04:44:00Z', now: '2026-07-29T05:00:00Z',
  });
  assert.deepEqual(records, [
    { date: '2026-07-28', pack: 'tidy-repo', task: 'tidy-issues', slotId: 'd2026-07-29', outcome: 'agent' },
    { date: '2026-07-29', pack: 'claudinite-growth', task: 'usage-fold', slotId: 'd2026-07-29', outcome: 'code-work' },
    { date: '2026-07-29', pack: 'tidy-repo', task: 'tidy-issues', slotId: 'd2026-07-29', outcome: 'skipped' },
  ]);
  assert.equal(watermark, '2026-07-29T04:44:00Z');
  assert.equal(remaining, 0);
});

test('an idle run advances the watermark too — otherwise every quiet hour is re-read forever', async () => {
  const { reader } = fakeApi({
    '/repos/o/r/actions/workflows': { workflow_runs: [{ id: 1, run_started_at: '2026-07-29T04:44:00Z' }] },
    '/repos/o/r/actions/runs/1/jobs': { jobs: [{ id: 101 }] },
    '/repos/o/r/actions/jobs/101/logs': stamped('- no tasks due'),
  });
  const { records, watermark } = await readTaskRuns({ reader, repo: 'o/r', since: '2026-07-29T03:00:00Z', now: '2026-07-29T05:00:00Z' });
  assert.deepEqual(records, []);
  assert.equal(watermark, '2026-07-29T04:44:00Z');
});

test('the per-fold cap truncates forward, reports the remainder, and leaves a resumable watermark', async () => {
  const runs = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, run_started_at: `2026-07-29T0${i}:44:00Z` }));
  const { reader } = fakeApi({
    '/repos/o/r/actions/workflows': { workflow_runs: runs },
    '/repos/o/r/actions/runs/': (path) => ({ jobs: [{ id: Number(path.split('/runs/')[1].split('/')[0]) }] }),
    '/repos/o/r/actions/jobs/': jobLog(run('p', 't', 'agent')),
  });
  const { records, watermark, remaining } = await readTaskRuns({
    reader, repo: 'o/r', since: '2026-07-28T00:00:00Z', now: '2026-07-29T06:00:00Z', max: 2,
  });
  assert.equal(records.length, 2);
  assert.equal(remaining, 3, 'the caller logs this — a silent cap reads as full coverage');
  assert.equal(watermark, '2026-07-29T01:44:00Z', 'the next fold resumes at run 3, losing nothing');
});

test('an unreadable ledger costs this source only, and never moves the watermark', async () => {
  const { reader } = fakeApi({});          // every path 404s
  const { records, watermark } = await readTaskRuns({
    reader, repo: 'o/r', since: '2026-07-28T00:00:00Z', now: '2026-07-29T06:00:00Z',
  });
  assert.deepEqual(records, []);
  assert.equal(watermark, '2026-07-28T00:00:00Z', 'so the next fold retries exactly these runs');
});

test('the first fold looks back a short, stated window rather than all of history', () => {
  assert.equal(lookbackFrom('2026-07-29T06:00:00Z'), '2026-07-27T06:00:00.000Z');
  assert.equal(FIRST_FOLD_LOOKBACK_DAYS, 2);
  assert.ok(MAX_RUNS_PER_FOLD >= 24, 'and a normal daily catch-up is never truncated');
});
