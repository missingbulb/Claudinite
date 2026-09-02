import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  workRows, rowsFor, viewCounts, defaultView, troubles, classify, attentionOf, VIEWS,
} from '../work.mjs';
import { describeItem, buildRoster } from '../model.mjs';
import {
  WORK_PREFIX, STATUS_READY, STATUS_BLOCKED, STATUS_RUNNING_EXECUTOR, PARK_STATUSES, PARK_KINDS,
  NEEDS_HUMAN_APPROVAL, NEEDS_HUMAN_FAILURE,
} from '../../claudinite-tasks/shared-code/work-items.mjs';

// The park STATUS an item wears, picked out of the engine's own list by kind rather
// than spelled here: a park is two labels — the status the queue reads and the triage
// label that says what it is asking for — and both come from the same vocabulary.
const parkStatus = (kind) => PARK_STATUSES[PARK_KINDS.indexOf(kind)];

const NOW = Date.parse('2026-08-21T11:30:00Z');

// Items as the API answers them, wearing the queue's own labels — never a hand-typed
// state, because the whole point of the row model is that it reads what the engine
// wrote.
const issue = (number, task, labels, over = {}) => ({
  number,
  title: `${WORK_PREFIX} claudinite-growth/${task}`,
  body: '',
  state: 'open',
  labels: labels.map((name) => ({ name })),
  created_at: '2026-08-20T10:00:00Z',
  updated_at: '2026-08-21T11:00:00Z',
  comments: 0,
  ...over,
});

const described = (i) => describeItem(i, NOW, { periodFor: () => 86400e3, isOpen: () => null });

const taskRow = (task, over = {}) => ({
  key: `claudinite-growth/${task}`,
  pack: 'claudinite-growth',
  task,
  declaration: { frequency: 'daily', agent_model: 'none', expected_outcome: 'pr', automerge: 'anything' },
  frequency: 'daily',
  nextAsk: { kind: 'anchor', at: new Date('2026-08-22T04:00:00Z') },
  anchorNote: null,
  current: null,
  openCount: 0,
  lastClosed: null,
  history: [],
  ...over,
});

test('a healthy task is neither stuck nor pending — it is simply waiting for its anchor', () => {
  const row = taskRow('usage-fold');
  assert.deepEqual(troubles(row), []);
  assert.equal(classify(row), 'idle');
});

test('a parked item is stuck, at the severity its park kind earns', () => {
  const broken = taskRow('growth-extract', { current: described(issue(9, 'growth-extract', [NEEDS_HUMAN_FAILURE, parkStatus('failure')])) });
  assert.equal(classify(broken), 'stuck');
  assert.equal(troubles(broken)[0].level, 'critical', 'a failure park holds the task\'s lane');

  const approval = taskRow('usage-fold', { current: described(issue(10, 'usage-fold', [NEEDS_HUMAN_APPROVAL, parkStatus('approval')])) });
  assert.equal(classify(approval), 'stuck');
  assert.equal(troubles(approval)[0].level, 'warning', 'a PR waiting on a reviewer is not a broken lane');
});

test('a held lane is said once, as a fact about the TASK', () => {
  const row = taskRow('growth-extract', {
    current: described(issue(9, 'growth-extract', [NEEDS_HUMAN_FAILURE, parkStatus('failure')])),
    nextAsk: { kind: 'held' },
  });
  const said = troubles(row).map((t) => t.text);
  assert.equal(said.filter((t) => t.includes('lane is held')).length, 1);
});

test('an item that is moving is pending, and one off the state machine is stuck', () => {
  const ready = taskRow('usage-fold', { current: described(issue(11, 'usage-fold', [STATUS_READY])) });
  assert.equal(classify(ready), 'pending');

  // No state label at all is the torn-label-swap leaving the janitor repairs — not a
  // display quirk, and not something to fold into "blocked".
  const unlabelled = taskRow('usage-fold', { current: described(issue(12, 'usage-fold', [])) });
  assert.equal(classify(unlabelled), 'stuck');
});

test('an open item whose task this repo no longer declares gets a row of its own', () => {
  // The case a roster-only table cannot show and an item-only table cannot explain:
  // nothing will ever pick this up, and no recovery rule will say so.
  const orphan = described(issue(20, 'retired-task', [STATUS_READY]));
  const all = workRows([taskRow('usage-fold')], [orphan]);
  const row = all.find((r) => r.task === 'retired-task');
  assert.ok(row, 'the item is a row even though no task declares it');
  assert.equal(row.view, 'stuck');
  assert.equal(row.level, 'serious');
  assert.match(row.nextAsk.note, /nothing will pick this up/);
});

test('the views partition the rows, and `all` is every one of them', () => {
  const rows = [
    taskRow('parked', { current: described(issue(1, 'parked', [NEEDS_HUMAN_FAILURE, parkStatus('failure')])) }),
    taskRow('running', { current: described(issue(2, 'running', [STATUS_RUNNING_EXECUTOR], { updated_at: '2026-08-21T11:25:00Z' })) }),
    taskRow('waiting'),
  ];
  const all = workRows(rows, rows.map((r) => r.current).filter(Boolean));
  const counts = viewCounts(all);
  assert.deepEqual(counts, { stuck: 1, pending: 1, all: 3 });
  assert.equal(rowsFor(all, 'stuck').length + rowsFor(all, 'pending').length + 1, counts.all,
    'stuck and pending are exclusive, and the idle row shows only in `all`');
  assert.deepEqual(rowsFor(all, 'all').length, 3);
  assert.deepEqual([...VIEWS], ['stuck', 'pending', 'all']);
});

test('the worst thing true of the repo sorts to the top of every view', () => {
  const rows = [
    taskRow('approval', { current: described(issue(1, 'approval', [NEEDS_HUMAN_APPROVAL, parkStatus('approval')])) }),
    taskRow('broken', { current: described(issue(2, 'broken', [NEEDS_HUMAN_FAILURE, parkStatus('failure')])) }),
  ];
  const all = workRows(rows, rows.map((r) => r.current));
  assert.equal(all[0].task, 'broken');
});

test('the page opens on the worst view that has anything in it', () => {
  assert.equal(defaultView({ stuck: 2, pending: 1, all: 9 }), 'stuck');
  assert.equal(defaultView({ stuck: 0, pending: 1, all: 9 }), 'pending');
  // A healthy repo must not open on an empty table — that reads as a broken page.
  assert.equal(defaultView({ stuck: 0, pending: 0, all: 9 }), 'all');
});

test('the attention split is the same arithmetic the fleet row estimates from', () => {
  const open = [
    described(issue(1, 'a', [NEEDS_HUMAN_FAILURE, parkStatus('failure')])),
    described(issue(2, 'b', [NEEDS_HUMAN_APPROVAL, parkStatus('approval')])),
    described(issue(3, 'c', [STATUS_BLOCKED], { updated_at: '2026-08-01T00:00:00Z' })),
  ];
  const a = attentionOf(open);
  assert.equal(a.broken, 1);
  assert.equal(a.approvals, 1);
  assert.equal(a.decisions, 0);
  // The third item is blocked, nothing blocks it, and it has sat there for weeks — the
  // queue's own "due but not readied" rule, which is a trip rather than a park.
  assert.equal(a.tripping, 1);
});

test('workRows keeps a declared task that has never run', () => {
  // The row a list built from items alone would omit silently — and a task that never
  // fired looks identical to one with nothing to do until you can see it at all.
  const all = workRows(buildRoster({
    tasks: [{ pack: 'claudinite-growth', task: 'never-ran', path: 'packs/claudinite-growth/tasks/never-ran/task.mjs', declaration: { frequency: 'weekly' } }],
    items: [],
    now: NOW,
    schedule: null,
    isOpen: () => null,
  }), []);
  assert.equal(all.length, 1);
  assert.equal(all[0].view, 'idle');
  assert.deepEqual(rowsFor(all, 'all').map((r) => r.task), ['never-ran']);
});
