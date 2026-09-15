import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeUsage, decodeTasksUsage, decodeRow, decodeCounters, growthSeries, queueSeries, hourSeries,
  runKind, taskDetail, dayLadder, hourLadder,
} from '../src/read/usage.mjs';
import {
  SCHEDULER_WORKFLOW_FILE, EXECUTOR_WORKFLOW_FILE,
} from '../../claudinite-tasks/shared-code/github.mjs';

const NOW = Date.parse('2026-08-21T11:30:00Z');

// A file in the shape the fold writes: positional tuples plus the header naming the
// vocabulary each is spelled in. Built by hand rather than by importing the writer —
// the whole claim under test is that this reader needs nothing from that pack.
const fileWith = (over = {}) => ({
  version: 3,
  generated: '2026-08-21T11:00:00Z',
  foldedThrough: '2026-08-20',
  fields: {
    day: ['captures', 'merges', 'sessions', 'userMessages', 'userCommands', 'tokensIn', 'tokensOut', 'tokenSessions', 'commits', 'linesAdded', 'linesRemoved', 'releases'],
    week: ['days', 'captures'],
    hour: ['scheduler', 'executor', 'agentic', 'failed'],
    checks: ['runs', 'failures', 'errors', 'blocking', 'advisory', 'ciRuns', 'ciFailures'],
    checkFindings: ['blocking', 'advisory'],
    taskExec: ['success', 'failed', 'task-gone', 'invalid'],
    queue: ['done', 'delivered', 'obsolete', 'none'],
  },
  hours: {},
  days: {},
  weeks: {},
  ...over,
});

test('a counter tuple decodes against the vocabulary the FILE declared, not this code\'s', () => {
  // The property the whole reader rests on: the file is self-describing, so a field
  // appended or retired on the writing side needs no change here and no coordinated
  // release between two independent packs.
  const invented = ['runs', 'failures', 'somethingNew'];
  assert.deepEqual(decodeCounters([3, 1, 9], invented), { runs: 3, failures: 1, somethingNew: 9 });
  // …and a slot the writer had no opinion about yields NO KEY. Unknown is a state:
  // collapsing it to zero is the one thing the format exists to prevent.
  assert.deepEqual(decodeCounters([3, null], invented), { runs: 3 });
  assert.deepEqual(decodeCounters([3], invented), { runs: 3 }, 'a short tuple says the same thing');
});

test('a row expands its counter groups and passes everything else through', () => {
  const row = { totals: [2, 1], skillLoads: { 'merge-to-main': 3 }, checks: { work: [9, 2] } };
  const out = decodeRow(row, ['captures', 'merges'], { checks: ['runs', 'failures'] });
  assert.equal(out.captures, 2);
  assert.deepEqual(out.checks.work, { runs: 9, failures: 2 });
  assert.deepEqual(out.skillLoads, { 'merge-to-main': 3 }, 'a map with no declared vocabulary is not a counter group');
});

test('a version-1 file decodes as itself, and an absent one is null — never an empty repo', () => {
  const v1 = { version: 1, days: { '2026-08-20': { captures: 2, checks: { work: { runs: 4 } } } }, weeks: {} };
  assert.equal(decodeUsage(v1).days['2026-08-20'].checks.work.runs, 4);
  assert.equal(decodeUsage(null), null);
  assert.equal(decodeUsage('not a file'), null);
  // A file predating the stamp answers null rather than borrowing another date.
  assert.equal(decodeUsage(v1).generated, null);
});

// --- the growth series -------------------------------------------------------------

test('growthSeries reads what the file carries and says which series it does not', () => {
  const usage = decodeUsage(fileWith({
    days: {
      '2026-08-20': { totals: [1, 1, 1, 4, 0], checks: { work: [9, 2, 0, 3, 0, 0, 0] }, checkFindings: { 'task-lifecycle': [3, 0] } },
      '2026-08-21': { totals: [1, 0, 1, 2, 0], checks: { world: [1, 0, 0, 0, 0, 0, 0] } },
    },
  }));
  const g = growthSeries(usage, { now: NOW, days: 3 });
  assert.deepEqual(g.days.map((d) => d.day), ['2026-08-19', '2026-08-20', '2026-08-21']);
  assert.equal(g.days[1].checkRuns, 9);
  assert.equal(g.days[1].findings, 3);
  // A day the file has no row for is null throughout — an unfolded day, not a quiet one.
  assert.equal(g.days[0].checkRuns, null);
  assert.equal(g.days[0].missing, true);
  // …and the totals only ever sum the days that HAD an opinion.
  assert.equal(g.totals.checkRuns, 10);
  // The optional series this repo does not carry are named as absent, so the panel can
  // say "not recorded" instead of drawing an empty chart that reads as zero.
  assert.deepEqual(g.carries, { checks: true, tokens: false, commits: false, releases: false });
});

test('growthSeries on a repo that folds nothing says so rather than reporting zeroes', () => {
  const g = growthSeries(null, { now: NOW, days: 3 });
  assert.equal(g.folded, false);
  assert.equal(g.totals.checkRuns, null, 'a total over no known days is null, never 0');
  assert.ok(g.days.every((d) => d.missing));
});

// --- what the queue closed ----------------------------------------------------------

test('queueSeries takes today from the live page and the days before it from the fold', () => {
  const usage = decodeUsage(fileWith({
    days: {
      '2026-08-20': { totals: [], queue: { 'p/t': [2, 0, 0, 1] } },
      '2026-08-21': { totals: [], queue: { 'p/t': [1, 0, 0, 0] } },
    },
  }));
  const series = queueSeries(usage, {
    now: NOW,
    days: 3,
    liveFrom: Date.parse('2026-08-21T00:00:00Z'),
    items: [
      { closedAt: '2026-08-21T09:00:00Z', outcome: 'done' },
      { closedAt: '2026-08-21T10:30:00Z', outcome: 'done' },
      { closedAt: '2026-08-21T10:45:00Z', outcome: 'none' },
    ],
  });
  assert.deepEqual(series.map((d) => d.source), ['none', 'folded', 'live']);
  assert.equal(series[1].done, 2, 'the folded day sums every task\'s row');
  assert.equal(series[1].none, 1);
  // Today REPLACES rather than adds: the fold has already counted part of today, and
  // adding the live count on top would double every item it had seen.
  assert.equal(series[2].done, 2);
  assert.equal(series[2].none, 1);
  assert.equal(series[0].done, null, 'a day neither source reached is unknown, not empty');
});

// --- what ran, hour by hour ----------------------------------------------------------

const schedulerRun = (at, conclusion = 'success') => ({
  name: 'Claudinite scheduler', path: `.github/workflows/${SCHEDULER_WORKFLOW_FILE}`,
  status: 'completed', conclusion, created_at: at,
});

test('a run is classified by its workflow file OR its name — either alone survives', () => {
  assert.equal(runKind({ path: `.github/workflows/${SCHEDULER_WORKFLOW_FILE}` }), 'scheduler');
  assert.equal(runKind({ path: `.github/workflows/${EXECUTOR_WORKFLOW_FILE}` }), 'executor');
  // A cache entry written before the path was projected still classifies by name…
  assert.equal(runKind({ name: 'Claudinite executor', path: null }), 'executor');
  // …and a member who renamed the display name still classifies by path.
  assert.equal(runKind({ name: 'nightly things', path: `.github/workflows/${SCHEDULER_WORKFLOW_FILE}` }), 'scheduler');
  assert.equal(runKind({ name: 'CI', path: '.github/workflows/ci.yml' }), null, 'the repo\'s own CI is not this panel\'s');
});

test('hourSeries prefers the live listing where it is complete and the fold behind it', () => {
  const usage = decodeUsage(fileWith({
    hours: {
      '2026-08-21T08': { totals: [1, 0, 0, 0] },
      '2026-08-21T09': { totals: [1, 2, 1, 0], taskExec: { 'p/t': [1, 0, 0, 0] } },
      '2026-08-21T10': { totals: [1, 0, 0, 0] },
    },
  }));
  const hours = hourSeries(usage, {
    now: NOW,
    hours: 4,
    // The oldest run in the listing lands in 09, so 09 is only PARTLY covered by it —
    // the live window therefore starts at 10, and 09 keeps the fold's complete row.
    runs: [schedulerRun('2026-08-21T09:50:00Z'), schedulerRun('2026-08-21T10:05:00Z'), schedulerRun('2026-08-21T11:05:00Z', 'failure')],
  });
  assert.deepEqual(hours.map((h) => h.hour), ['2026-08-21T08', '2026-08-21T09', '2026-08-21T10', '2026-08-21T11']);
  assert.equal(hours[1].source, 'folded');
  assert.equal(hours[1].executor, 2, 'the fold saw runs the listing no longer reaches');
  assert.equal(hours[2].source, 'live');
  assert.equal(hours[3].scheduler, 1);
  assert.equal(hours[3].failed, 1);
  // Sessions and the per-task detail have no live source at all — nothing in a run
  // listing says whether an agent ran or what it did.
  assert.equal(hours[1].agentic, 1);
  assert.deepEqual(hours[1].tasks[0].key, 'p/t');
  assert.equal(hours[3].agentic, null, 'the fold has not reached this hour, so it is unknown');
});

test('an hour no source reached is marked, so the chart can leave it blank', () => {
  const hours = hourSeries(null, { now: NOW, hours: 2, runs: [] });
  assert.deepEqual(hours.map((h) => h.source), ['none', 'none']);
  assert.deepEqual(hours.map((h) => h.scheduler), [null, null]);
});

test('taskDetail puts what failed first and drops what never happened', () => {
  const detail = taskDetail({
    'p/quiet': { success: 0, failed: 0, 'task-gone': 0, invalid: 0 },
    'p/ok': { success: 2, failed: 0, 'task-gone': 0, invalid: 0 },
    'p/broken': { success: 0, failed: 1, 'task-gone': 0, invalid: 0 },
  });
  assert.deepEqual(detail.map((t) => t.key), ['p/broken', 'p/ok']);
  assert.deepEqual(detail[1].statuses, [{ status: 'success', count: 2 }]);
});

test('the ladders are UTC and end at the current day and hour', () => {
  assert.deepEqual(dayLadder(NOW, 2), ['2026-08-20', '2026-08-21']);
  assert.deepEqual(hourLadder(NOW, 2), ['2026-08-21T10', '2026-08-21T11']);
});

// --- the machinery's own plane, beside the sessions' --------------------------------
// A second file, read the same self-describing way. Rendering it is a later change;
// what these hold is that the page can read it at all, and reads what it says rather
// than what this code assumes.

// Built by hand, like the session fixture above and for the same reason: the claim
// under test is that this reader needs nothing from the pack that writes it.
const TASKS_FILE = {
  version: 1,
  generated: '2026-08-21T11:00:00Z',
  foldedThrough: '2026-08-20',
  minuteRate: 0.008,
  fields: {
    day: ['runs', 'jobs', 'minutesBilled', 'spend', 'apiCalls', 'list', 'ask', 'drain', 'pick', 'claim', 'code-work', 'hand-off', 'converge'],
    hour: ['runs', 'jobs', 'minutesBilled', 'spend', 'apiCalls'],
    week: ['days', 'runs', 'jobs', 'minutesBilled', 'spend', 'apiCalls'],
    workflows: ['runs', 'jobs', 'minutesBilled', 'spend'],
    runCosts: ['apiCalls', 'list', 'ask', 'drain', 'pick', 'claim', 'code-work', 'hand-off', 'converge'],
    queue: ['done', 'delivered', 'obsolete', 'none'],
    parks: ['failure', 'action', 'decision', 'approval'],
    latency: ['tickToItemMinutes', 'itemToPickMinutes', 'pickToHandOffMinutes', 'handOffToConvergeMinutes'],
  },
  hours: { '2026-08-21T10': { totals: [2, 3, 7, 0.056, 12] } },
  days: {
    '2026-08-21': {
      totals: [5, 8, 21, 0.168, 40, 100, 200, 50, null, null, null, null, null],
      workflows: { scheduler: [2, 2, 4, 0.032], executor: [3, 6, 17, 0.136] },
      runCosts: { 77: [31, null, null, null, 1000, 2000, null, null, null] },
      queue: { 'p/a': [3, null, 1, null] },
      parks: { 'p/a': [1, null, null, null] },
      latency: { 42: [2, 8, 5, 15] },
    },
  },
  weeks: { '2026-W34': { totals: [7, 30, 40, 120, 0.96, 250] } },
};

test('the machinery file decodes against its own header, tuples and sub-maps alike', () => {
  const usage = decodeTasksUsage(TASKS_FILE);
  assert.equal(usage.minuteRate, 0.008);
  assert.equal(usage.days['2026-08-21'].minutesBilled, 21);
  assert.deepEqual(usage.days['2026-08-21'].workflows.scheduler, { runs: 2, jobs: 2, minutesBilled: 4, spend: 0.032 });
  assert.deepEqual(usage.days['2026-08-21'].runCosts['77'], { apiCalls: 31, pick: 1000, claim: 2000 });
  assert.deepEqual(usage.days['2026-08-21'].queue['p/a'], { done: 3, obsolete: 1 });
  assert.deepEqual(usage.days['2026-08-21'].parks['p/a'], { failure: 1 });
  assert.deepEqual(usage.days['2026-08-21'].latency['42'], {
    tickToItemMinutes: 2, itemToPickMinutes: 8, pickToHandOffMinutes: 5, handOffToConvergeMinutes: 15,
  });
  assert.equal(usage.hours['2026-08-21T10'].apiCalls, 12);
  assert.equal(usage.weeks['2026-W34'].days, 7);
});

test('a slot the file left null yields no key, so the page can say *not recorded*', () => {
  const usage = decodeTasksUsage(TASKS_FILE);
  // The day's four phase slots the scheduler never spent are `null` in the tuple,
  // and a zero there would claim a measured instant.
  assert.ok(!('pick' in usage.days['2026-08-21']));
  assert.ok(!('delivered' in usage.days['2026-08-21'].queue['p/a']));
});

test('a repo that declares no rate reads as unpriced rather than as free', () => {
  const usage = decodeTasksUsage({ ...TASKS_FILE, minuteRate: null, days: {} });
  assert.equal(usage.minuteRate, null);
});

test('a member that folds no machinery file at all reads as null, not as a quiet repo', () => {
  assert.equal(decodeTasksUsage(null), null);
  assert.equal(decodeTasksUsage('not a file'), null);
});
