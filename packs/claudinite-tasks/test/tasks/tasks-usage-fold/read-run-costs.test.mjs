// What a run cost, read off the listings — and what that read costs, which is the
// half of this module the issue that asked for it bounded explicitly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeReader, readRunCosts, billedMinutes, readCostFromLog,
  SCHEDULER_RUNS_PER_FOLD,
} from '../../../tasks/tasks-usage-fold/read-run-costs.mjs';
import { RUN_COST_TAG } from '../../../src/items/run-record.mjs';

const NOW = '2026-09-15T12:00:00Z';

const job = (id, from, to, conclusion = 'success') =>
  ({ id, started_at: from, completed_at: to, conclusion, name: `job-${id}` });

// A fake GitHub that records every path asked for, so a test can count the calls a
// fold makes rather than assert on a number nothing measured.
function fakeApi({ schedulerRuns = [], executorRuns = [], jobs = {}, logs = {} } = {}) {
  const paths = [];
  const fetchImpl = async (url) => {
    const path = url.replace('https://api.github.com', '');
    paths.push(path);
    let m;
    if (/claudinite-scheduler\.yml\/runs/.test(path)) {
      return { status: 200, json: async () => ({ workflow_runs: schedulerRuns }) };
    }
    if (/claudinite-executor\.yml\/runs/.test(path)) {
      return { status: 200, json: async () => ({ workflow_runs: executorRuns }) };
    }
    if ((m = /\/actions\/runs\/(\d+)\/jobs/.exec(path))) {
      const found = jobs[m[1]];
      if (!found) return { status: 404, json: async () => null };
      return { status: 200, json: async () => ({ jobs: found }) };
    }
    if ((m = /\/actions\/jobs\/(\d+)\/logs/.exec(path))) {
      const found = logs[m[1]];
      if (found === undefined) return { status: 404, text: async () => '' };
      return { status: 200, text: async () => found };
    }
    return { status: 404, json: async () => null, text: async () => '' };
  };
  return { paths, reader: makeReader({ token: 't', fetchImpl }) };
}

const run = (id, at, conclusion = 'success') => ({ id, run_started_at: at, conclusion });

test('a job is billed its wall time rounded up to a whole minute, summed over the run', () => {
  assert.equal(billedMinutes([
    job(1, '2026-09-15T10:00:00Z', '2026-09-15T10:00:30Z'),   // 30s  -> 1
    job(2, '2026-09-15T10:00:00Z', '2026-09-15T10:02:00Z'),   // 120s -> 2
    job(3, '2026-09-15T10:00:00Z', '2026-09-15T10:02:01Z'),   // 121s -> 3
  ]), 6);
});

test('a job with no completion contributes nothing, and a run of only those is unknown', () => {
  // Never a zero: a run still in flight has not been billed nothing, it has not
  // been measured.
  assert.equal(billedMinutes([job(1, '2026-09-15T10:00:00Z', null)]), null);
  assert.equal(billedMinutes([]), null);
});

test("a day's reads stay under ten calls at this repo's own cadence", async () => {
  // Two scheduler ticks and three executor runs: two run listings, one jobs listing
  // each, and one log read per tick. The budget the task's header states.
  const api = fakeApi({
    schedulerRuns: [run(1, '2026-09-15T05:10:00Z'), run(2, '2026-09-15T17:10:00Z')],
    executorRuns: [run(3, '2026-09-15T05:12:00Z'), run(4, '2026-09-15T06:00:00Z'), run(5, '2026-09-15T17:12:00Z')],
    jobs: {
      1: [job(11, '2026-09-15T05:10:00Z', '2026-09-15T05:10:40Z')],
      2: [job(12, '2026-09-15T17:10:00Z', '2026-09-15T17:10:40Z')],
      3: [job(13, '2026-09-15T05:12:00Z', '2026-09-15T05:14:00Z')],
      4: [job(14, '2026-09-15T06:00:00Z', '2026-09-15T06:01:00Z')],
      5: [job(15, '2026-09-15T17:12:00Z', '2026-09-15T17:13:00Z')],
    },
    logs: {
      11: `${RUN_COST_TAG} v1 scheduler [1] calls=6 list=100 ask=200 drain=50`,
      12: `${RUN_COST_TAG} v1 scheduler [2] calls=6 list=100 ask=200 drain=50`,
    },
  });
  const read = await readRunCosts({ reader: api.reader, repo: 'o/r', since: '2026-09-14T00:00:00Z', now: NOW });

  assert.equal(read.runs.length, 5);
  assert.ok(api.paths.length < 10, `expected under ten calls, made ${api.paths.length}: ${api.paths.join(' ')}`);
});

test('the log read is bounded at two ticks however many scheduler runs are waiting', async () => {
  const ticks = [1, 2, 3, 4].map((n) => run(n, `2026-09-15T0${n}:10:00Z`));
  const api = fakeApi({
    schedulerRuns: ticks,
    jobs: Object.fromEntries(ticks.map((t) => [String(t.id), [job(t.id * 10, '2026-09-15T05:10:00Z', '2026-09-15T05:11:00Z')]])),
    logs: Object.fromEntries(ticks.map((t) => [String(t.id * 10), `${RUN_COST_TAG} v1 scheduler [${t.id}] calls=6`])),
  });
  await readRunCosts({ reader: api.reader, repo: 'o/r', since: '2026-09-14T00:00:00Z', now: NOW });

  const logReads = api.paths.filter((p) => /\/logs$/.test(p));
  assert.equal(logReads.length, SCHEDULER_RUNS_PER_FOLD);
});

test('an executor run reads no log at all — its record arrives with its items', async () => {
  const api = fakeApi({
    executorRuns: [run(9, '2026-09-15T05:12:00Z')],
    jobs: { 9: [job(90, '2026-09-15T05:12:00Z', '2026-09-15T05:13:00Z')] },
  });
  await readRunCosts({ reader: api.reader, repo: 'o/r', since: '2026-09-14T00:00:00Z', now: NOW });
  assert.equal(api.paths.filter((p) => /\/logs$/.test(p)).length, 0);
});

test('a run whose jobs listing 404s keeps its row and loses only its minutes', async () => {
  const api = fakeApi({ executorRuns: [run(9, '2026-09-15T05:12:00Z')] });
  const read = await readRunCosts({ reader: api.reader, repo: 'o/r', since: '2026-09-14T00:00:00Z', now: NOW });
  assert.equal(read.runs.length, 1);
  assert.equal(read.runs[0].jobs, null);
  assert.equal(read.runs[0].minutesBilled, null);
});

test('the cap stops the read and leaves the watermark at the last run measured', async () => {
  const runs = [1, 2, 3, 4, 5].map((n) => run(n, `2026-09-15T0${n}:00:00Z`));
  const api = fakeApi({
    executorRuns: runs,
    jobs: Object.fromEntries(runs.map((r) => [String(r.id), [job(r.id * 10, '2026-09-15T05:00:00Z', '2026-09-15T05:01:00Z')]])),
  });
  const read = await readRunCosts({
    reader: api.reader, repo: 'o/r', since: '2026-09-14T00:00:00Z', now: NOW, maxRunReads: 2,
  });
  assert.equal(read.truncated, true);
  assert.equal(read.runs.length, 2);
  // The next fold continues from exactly where this one stopped, not from the
  // newest run it merely listed.
  assert.equal(read.watermark, '2026-09-15T02:00:00Z');
});

test('a tick whose log carries no record is a tick with no cost, not a failed read', async () => {
  const api = fakeApi({
    schedulerRuns: [run(1, '2026-09-15T05:10:00Z')],
    jobs: { 1: [job(11, '2026-09-15T05:10:00Z', '2026-09-15T05:11:00Z')] },
    logs: { 11: 'nothing of interest here' },
  });
  const read = await readRunCosts({ reader: api.reader, repo: 'o/r', since: '2026-09-14T00:00:00Z', now: NOW });
  assert.equal(read.runs[0].cost, null);
  assert.equal(read.runs[0].minutesBilled, 1);
});

test('a skipped job is never opened — it has no log to spend a call on', async () => {
  const api = fakeApi({ jobs: {}, logs: { 22: `${RUN_COST_TAG} v1 scheduler [1] calls=1` } });
  const reads = await readCostFromLog(api.reader, 'o/r', [
    job(21, '2026-09-15T05:10:00Z', null, 'skipped'),
    job(22, '2026-09-15T05:10:00Z', '2026-09-15T05:11:00Z'),
  ]);
  assert.equal(reads.reads, 1);
  assert.equal(reads.record.runId, '1');
});
