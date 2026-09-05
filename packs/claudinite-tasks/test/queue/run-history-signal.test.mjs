import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSignals, SIGNAL_COLLECTORS, RUN_HORIZON_DAYS } from '../../signals/index.mjs';
import { collectSignalsForTask, windowFromRuns, defaultWindowMs, windowDaysOf } from '../../queue/signals.mjs';
import { workItemBody } from '../../queue/work-item.mjs';

// The `runs` signal (tasks-dispatch DESIGN §5) — a task's own run history, read
// off the queue — and the window every other signal is then collected over. The
// scheduler run hands the collector the queue it fetched; the executor lets it
// read for itself.

const NOW = '2026-09-05T16:00:00Z';
const item = (number, over = {}) => ({
  number, title: '[claudinite-work] p/t', body: 'packs/p/tasks/t/task.md\n', state: 'closed',
  labels: ['task:status:done', 'task:origin:planned'],
  created_at: '2026-09-03T04:05:00Z', closed_at: '2026-09-03T04:30:00Z', updated_at: '2026-09-03T04:30:00Z', ...over,
});
const ctx = (over = {}) => ({ repo: 'o/r', defaultBranch: 'main', now: NOW, sinceIso: null, task: { pack: 'p', id: 't' }, ...over });
const noGh = async () => { throw new Error('the collector must not read when the queue was handed in'); };

test('runs is a collector of its own, read off the queue the caller holds', async () => {
  assert.ok(SIGNAL_COLLECTORS.includes('runs'));
  const items = [
    item(7),
    item(8, { labels: ['task:status:rejected'], created_at: '2026-09-04T04:05:00Z', closed_at: '2026-09-04T04:06:00Z' }),
    item(9, { state: 'open', labels: ['task:status:needs-human-failure'], created_at: '2026-09-05T04:05:00Z', closed_at: null, body: workItemBody({ taskPath: 'packs/p/tasks/t/task.md', woken: '2026-09-05T04:00:00Z' }) }),
    item(10, { title: '[claudinite-work] p/t — one target', created_at: '2026-09-05T10:00:00Z' }),
    item(11, { title: '[claudinite-work] p/other', created_at: '2026-09-05T10:00:00Z' }),
  ];
  const { runs } = await collectSignals(noGh, ctx({ items }), ['runs']);
  assert.equal(runs.horizonDays, RUN_HORIZON_DAYS);
  assert.deepEqual(runs.list.map((r) => r.number), [9, 8, 7], 'this task\'s unqualified items, newest first — the qualified one and the other task are not runs');
  assert.deepEqual(runs.list.map((r) => [r.outcome, r.park, r.state, r.woken]), [
    [null, 'failure', 'open', true],
    ['obsolete', null, 'closed', false],
    ['done', null, 'closed', false],
  ]);
  assert.equal(runs.list[0].status, 'task:status:needs-human-failure');
  assert.equal(runs.list[2].createdAt, '2026-09-03T04:05:00Z');
});

// A run begins at the pick. An item still wearing the status it waited in was
// never picked — open, or closed beside the terminal label the scheduler's
// dedupe, orphan and supersede writes add (a person's close adds nothing). It
// never ran and never declined, so it is not a run: counted, two twins would
// decline each other at pick and a deduped one would spend the period on the
// survivor (SCENARIOS F32), and a hand-closed item would stand between
// `last-run-not-failed` and the failure park behind it.
test('runs excludes an item nobody picked, open or closed; one declined at pick stays a run', async () => {
  const items = [
    item(14, { state: 'open', labels: ['task:status:running-agent', 'task:origin:planned'], created_at: '2026-09-05T15:00:00Z', closed_at: null }),
    item(13, { state: 'open', labels: ['task:status:waiting-for-executor', 'task:origin:planned'], created_at: '2026-09-05T14:00:00Z', closed_at: null }),
    item(12, { labels: ['task:status:rejected', 'task:origin:planned'], created_at: '2026-09-05T04:05:00Z', closed_at: '2026-09-05T04:20:00Z' }),
    item(11, { labels: ['task:status:waiting-for-executor', 'task:status:rejected', 'task:origin:planned'], created_at: '2026-09-05T04:04:00Z', closed_at: '2026-09-05T04:05:30Z' }),
    item(10, { labels: ['task:status:blocked', 'task:origin:planned'], created_at: '2026-09-04T04:05:00Z', closed_at: '2026-09-04T09:00:00Z' }),
  ];
  const { runs } = await collectSignals(noGh, ctx({ items }), ['runs']);
  assert.deepEqual(runs.list.map((r) => r.number), [14, 12],
    'the waiting twin (#13), the deduped twin (#11) and the hand-closed waiting item (#10) were never picked; the running item and the pick-time decline are runs');
});

test('runs excludes the item under evaluation — an item is never its own history', async () => {
  const items = [item(9), item(8, { created_at: '2026-09-05T04:05:00Z', closed_at: null, state: 'open', labels: ['task:status:running-executor'] })];
  const { runs } = await collectSignals(noGh, ctx({ items, item: { number: 8, woken: false } }), ['runs']);
  assert.deepEqual(runs.list.map((r) => r.number), [9]);
});

test('runs reads the issues list for itself when no queue was handed in, bounded to the horizon', async () => {
  const seen = [];
  const gh = async (path) => {
    seen.push(path);
    return { status: 200, json: [item(9), { number: 4, title: 'a pull request', pull_request: {}, created_at: NOW }, { number: 3, title: 'an ordinary issue', labels: [], created_at: NOW }] };
  };
  const { runs } = await collectSignals(gh, ctx(), ['runs']);
  assert.deepEqual(runs.list.map((r) => r.number), [9]);
  assert.equal(seen.length, 1);
  assert.match(seen[0], /\/repos\/o\/r\/issues\?state=all/);
  const since = decodeURIComponent(/since=([^&]+)/.exec(seen[0])[1]);
  assert.equal(since, new Date(Date.parse(NOW) - RUN_HORIZON_DAYS * 86400e3).toISOString());
});

test('an unreadable page is an unreadable history, never a shorter one', async () => {
  const gh = async () => ({ status: 502, json: null });
  const { runs } = await collectSignals(gh, ctx(), ['runs']);
  assert.match(runs.error, /could not be read/);
});

test('runs needs the task whose history it reads', async () => {
  const { runs } = await collectSignals(noGh, ctx({ task: null, items: [] }), ['runs']);
  assert.match(runs.error, /needs the task/);
});

// --- the window ---------------------------------------------------------------

const task = (preconditions) => ({ pack: 'p', id: 't', decl: { preconditions }, terms: new Map() });

test('the window opens at the newest run that actually ran', () => {
  const runs = { list: [
    { number: 8, createdAt: '2026-09-04T04:05:00Z', outcome: 'obsolete' },
    { number: 9, createdAt: '2026-09-03T04:05:00Z', outcome: 'done' },
  ] };
  const w = windowFromRuns(task(['due:daily', 'substantive-change']), runs, NOW);
  assert.equal(w.sinceIso, '2026-09-03T04:05:00.000Z', 'the rejected #8 did nothing, so it does not move the seam');
  assert.ok(Math.abs(w.days - 2.4965) < 0.001);
  // A parked run started, so it counts.
  const parked = { list: [{ number: 10, createdAt: '2026-09-05T04:05:00Z', outcome: null, park: 'failure' }] };
  assert.equal(windowFromRuns(task(['due:daily']), parked, NOW).sinceIso, '2026-09-05T04:05:00.000Z');
});

test('with no run in the horizon the window is the task\'s own cadence plus slack, a day where it states none', () => {
  const DAY = 86400e3;
  assert.equal(defaultWindowMs(task(['due:weekly', 'repo-active'])), 7 * DAY + 3600e3);
  assert.equal(defaultWindowMs(task(['due:monthly'])), 31 * DAY + 3600e3);
  assert.equal(defaultWindowMs(task(['last-run-over:3d'])), 3 * DAY + 3600e3);
  assert.equal(defaultWindowMs(task(['substantive-change'])), DAY + 3600e3);
  assert.equal(defaultWindowMs(task(['woken'])), DAY + 3600e3);
  const w = windowFromRuns(task(['due:weekly']), { list: [] }, NOW);
  assert.equal(w.sinceIso, new Date(Date.parse(NOW) - 7 * DAY - 3600e3).toISOString());
  assert.equal(windowFromRuns(task(['due:weekly']), null, NOW).sinceIso, w.sinceIso, 'an unreadable history reads the default');
  assert.ok(Math.abs(windowDaysOf(task(['due:weekly']), {}) - 7.0417) < 0.001);
  assert.equal(windowDaysOf(task([]), { runs: { window: { days: 2.5 } } }), 2.5, 'read off the bundle where it was decided');
});

// --- the seam -------------------------------------------------------------------

test('collectFor reads the history first, sets the window from it, and can stop there', async () => {
  const items = [item(9)];
  const paths = [];
  const gh = async (path) => { paths.push(path); return { status: 200, json: [] }; };
  const collect = collectSignalsForTask({ gh, repo: 'o/r', root: process.cwd(), config: { packs: [] }, defaultBranch: 'main', items });
  const t = task(['due:daily', 'substantive-change']);

  const cheap = await collect(t, NOW, null, { only: ['runs'] });
  assert.deepEqual(Object.keys(cheap), ['runs']);
  assert.equal(cheap.runs.window.sinceIso, '2026-09-03T04:05:00.000Z');
  assert.deepEqual(paths, [], 'the cheap pass reads nothing beyond the queue it was handed');

  const full = await collect(t, NOW, null);
  assert.deepEqual(Object.keys(full).sort(), ['commits', 'runs']);
  const commitsRead = paths.find((p) => /\/commits\?sha=main/.test(p));
  assert.ok(commitsRead, 'the movement signal was collected');
  assert.match(decodeURIComponent(commitsRead), /since=2026-09-03T04:05:00.000Z/, 'over the window the history decided');
});

test('collectFor hands the item\'s facts to the collectors, the runs history excluding it', async () => {
  const items = [item(9), item(11, { state: 'open', labels: ['task:status:running-executor', 'task:origin:planned'], created_at: '2026-09-05T15:00:00Z', closed_at: null })];
  const collect = collectSignalsForTask({ gh: noGh, repo: 'o/r', root: process.cwd(), config: { packs: [] }, defaultBranch: 'main', items });
  const out = await collect(task(['due:daily']), NOW, items[1]);
  assert.deepEqual(out.runs.list.map((r) => r.number), [9]);
});
