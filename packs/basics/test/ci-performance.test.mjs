// The ci-performance task's verdict logic. What counts as a regression decides
// whether a member spends an agent, so it is pure code with its own tests rather
// than something inferred from a live repo's weather.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarize, median, runSeconds, slowestSteps, reportBody,
  MIN_RUNS_PER_WINDOW, REGRESSION_SECONDS,
} from '../tasks/ci-performance/worker.mjs';
import decl from '../tasks/ci-performance/task.mjs';
import { evaluatePrecondition } from '../../../engine/scheduler/queue/executor.mjs';

const NOW = Date.parse('2026-08-15T12:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86400 * 1000).toISOString();

// A completed run of `name`, `seconds` long, started `d` days ago.
const run = (name, seconds, d) => ({
  name, status: 'completed',
  run_started_at: daysAgo(d),
  updated_at: new Date(Date.parse(daysAgo(d)) + seconds * 1000).toISOString(),
});

const runs = (name, seconds, d, n) => Array.from({ length: n }, () => run(name, seconds, d));

test('median takes the middle, and averages the two middles on an even count', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([10, 20, 30, 40]), 25);
  assert.equal(median([]), null);
});

test('runSeconds measures the run, not the queue, and rejects what it cannot measure', () => {
  assert.equal(runSeconds(run('CI', 63, 1)), 63);
  // created_at is earlier than run_started_at: the gap is queue time and is not ours.
  assert.equal(runSeconds({
    created_at: '2026-08-15T11:00:00Z', run_started_at: '2026-08-15T11:05:00Z', updated_at: '2026-08-15T11:06:00Z',
  }), 60);
  assert.equal(runSeconds({ run_started_at: 'nonsense', updated_at: daysAgo(1) }), null);
  assert.equal(runSeconds({ run_started_at: daysAgo(1), updated_at: daysAgo(2) }), null); // ends before it starts
});

test('a workflow that got materially slower is a regression', () => {
  const { regressions, workflows } = summarize([
    ...runs('CI', 120, 2, 3),
    ...runs('CI', 60, 9, 3),
  ], NOW);
  assert.deepEqual(regressions.map((w) => w.name), ['CI']);
  assert.equal(workflows[0].current, 120);
  assert.equal(workflows[0].previous, 60);
});

test('neither bar alone fires it — a big ratio on a tiny workflow, or a big delta on a huge one', () => {
  // 4s -> 12s: 3x, but well under the absolute floor. Runner weather on a fast job.
  const tiny = summarize([...runs('lint', 12, 2, 3), ...runs('lint', 4, 9, 3)], NOW);
  assert.deepEqual(tiny.regressions, []);
  assert.ok(12 - 4 < REGRESSION_SECONDS);

  // 1000s -> 1100s: +100s, but only 1.1x — inside a long job's ordinary spread.
  const huge = summarize([...runs('e2e', 1100, 2, 3), ...runs('e2e', 1000, 9, 3)], NOW);
  assert.deepEqual(huge.regressions, []);
});

test('too few runs to compare is reported as such, never as a workflow that was cleared', () => {
  const { workflows, regressions } = summarize([
    ...runs('CI', 200, 2, MIN_RUNS_PER_WINDOW - 1),
    ...runs('CI', 20, 9, MIN_RUNS_PER_WINDOW),
  ], NOW);
  assert.equal(workflows[0].comparable, false);
  assert.equal(workflows[0].regressed, false);
  assert.deepEqual(regressions, []);
  // …and the report says so rather than printing a bare delta.
  assert.match(reportBody({ workflows, regressions }, { repo: 'o/r', nowIso: 'now' }), /too few runs/);
});

test('runs outside both windows, still running, or unmeasurable are dropped', () => {
  const { workflows } = summarize([
    ...runs('CI', 60, 2, 3),
    ...runs('CI', 60, 9, 3),
    run('CI', 9999, 30),                                    // older than both windows
    { name: 'CI', status: 'in_progress', run_started_at: daysAgo(0) },
    { name: 'CI', status: 'completed', run_started_at: 'nonsense', updated_at: 'nonsense' },
  ], NOW);
  assert.equal(workflows[0].runs, 3);
  assert.equal(workflows[0].priorRuns, 3);
  assert.equal(workflows[0].current, 60);
});

test('workflows are reported independently, slowest first', () => {
  const { workflows, regressions } = summarize([
    ...runs('CI', 300, 2, 3), ...runs('CI', 290, 9, 3),
    ...runs('release', 100, 2, 3), ...runs('release', 40, 9, 3),
  ], NOW);
  assert.deepEqual(workflows.map((w) => w.name), ['CI', 'release']);
  assert.deepEqual(regressions.map((w) => w.name), ['release']);
});

test('slowestSteps ranks a job by step duration and skips steps that never ran', () => {
  const steps = slowestSteps({
    steps: [
      { name: 'checkout', started_at: '2026-08-15T10:00:00Z', completed_at: '2026-08-15T10:00:04Z' },
      { name: 'tests', started_at: '2026-08-15T10:00:04Z', completed_at: '2026-08-15T10:00:52Z' },
      { name: 'sweep', started_at: '2026-08-15T10:00:52Z', completed_at: '2026-08-15T10:00:54Z' },
      { name: 'skipped', started_at: null, completed_at: null },
    ],
  }, 2);
  assert.deepEqual(steps, [{ name: 'tests', seconds: 48 }, { name: 'checkout', seconds: 4 }]);
});

test('an empty ledger produces a report rather than an error', () => {
  const summary = summarize([], NOW);
  assert.deepEqual(summary.workflows, []);
  assert.deepEqual(summary.regressions, []);
  assert.match(reportBody(summary, { repo: 'o/r', nowIso: 'now' }), /no completed runs/);
});

// Driven through evaluatePrecondition — the executor's own caller — rather than by
// calling the precondition directly. Calling it directly proves only that it does
// what the test imagines it is passed: this precondition was first written to take
// `{ signals }`, its direct-call test passed, and the real caller (which passes the
// signals object itself) got `precondition threw` on every run.
test('the precondition gates on movement in the window, not on CI existing', () => {
  const verdict = (signals) => evaluatePrecondition({ decl }, signals, {});
  assert.equal(verdict({ commits: { count: 0 }, prs: { touched: [] } }).run, false);
  assert.equal(verdict({ commits: { count: 4 }, prs: { touched: [] } }).run, true);
  assert.equal(verdict({ commits: { count: 0 }, prs: { touched: [7] } }).run, true);
  // A collector that returned nothing must read as no movement, not throw.
  const empty = verdict({});
  assert.equal(empty.run, false);
  assert.doesNotMatch(empty.reason, /threw/);
});
