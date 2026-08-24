import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  buildRoster, declaredPackDirs, describeItem, isWorkItem, outcomeTally,
  parseDeclaration, taskDeclarationPaths, warningsFor, commentKind,
  EXECUTING_LEASH_MS, AGENT_LEASH_MS, STUCK_BLOCKED_MS, DUE_SLACK_MS,
  BLOCKED, READY, EXECUTING, AGENT, NEEDS_HUMAN,
} from '../model.mjs';
import {
  OUTCOME_DONE, OUTCOME_DELIVERED, TASK_DONE, NEEDS_HUMAN_APPROVAL,
} from '../../claudinite-tasks/shared-code/work-items.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const NOW = Date.parse('2026-08-16T12:00:00Z');
const SCHEDULE = { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 };

const item = (over = {}) => ({
  number: 1,
  title: '[claudinite-work] basics/ci-performance',
  body: 'packs/basics/tasks/ci-performance\n\nExecute the Claudinite task above.\n',
  state: 'open',
  labels: [],
  created_at: '2026-08-16T04:00:00Z',
  updated_at: '2026-08-16T04:00:00Z',
  closed_at: null,
  comments: 0,
  ...over,
});

// The tool's own sources must import those modules rather than carry a copy of the
// label strings — a restated label is exactly the drift this design exists to
// prevent, and it would look completely correct on the day it was written.
test('the page states no queue label of its own', async () => {
  for (const rel of ['packs/claudinite-dashboard/model.mjs', 'packs/claudinite-dashboard/app.mjs']) {
    const src = await readFile(resolve(ROOT, rel), 'utf8');
    const code = src.replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /'(task:(ready|blocked|executing|agent|urgent|done|obsolete)|outcome:\w+|needs-human)'/, `${rel} hardcodes a queue label`);
    assert.doesNotMatch(code, /'\[claudinite-work\]/, `${rel} hardcodes the title prefix`);
  }
});

// --- declarations --------------------------------------------------------------

test('declaredPackDirs maps shared and local packs to both roots', () => {
  const dirs = declaredPackDirs({ packs: ['basics', { id: 'claudinite-lifecycle' }, 'local/claudinite'] });
  assert.deepEqual(dirs.get('basics'), ['packs/basics', '.claudinite/shared/packs/basics']);
  assert.deepEqual(dirs.get('claudinite-lifecycle'), ['packs/claudinite-lifecycle', '.claudinite/shared/packs/claudinite-lifecycle']);
  assert.deepEqual(dirs.get('local/claudinite'), ['.claudinite/local/packs/claudinite']);
});

test('taskDeclarationPaths takes only declared packs, from either root', () => {
  const paths = [
    'packs/basics/tasks/ci-performance/task.mjs',
    'packs/basics/tasks/ci-performance/worker.mjs',       // not a declaration
    'packs/claudinite-fleet-sheepdog/tasks/fleet-roster/task.mjs',          // pack not declared
    '.claudinite/shared/packs/claudinite-lifecycle/tasks/update/task.mjs',
    '.claudinite/local/packs/claudinite/tasks/growth/task.mjs',
    'packs/basics/tasks/ci-performance/task.test.mjs',     // the test beside it, not the declaration
  ];
  const found = taskDeclarationPaths(paths, { packs: ['basics', 'claudinite-lifecycle', 'local/claudinite'] });
  assert.deepEqual(found.map((f) => `${f.pack}/${f.task}`), [
    'basics/ci-performance', 'claudinite-lifecycle/update', 'local/claudinite/growth',
  ]);
});

test('parseDeclaration lifts the scalar fields', () => {
  const d = parseDeclaration(`
    export default {
      id: 'ci-performance',
      frequency: 'weekly',
      precondition_signals: ['commits', 'prs'],
      agent_model: 'sonnet',
      expected_outcome: 'open-pr',
      code_work_timeout: 300,
      precondition(signals) { return { run: true }; },
    };
  `);
  assert.equal(d.id, 'ci-performance');
  assert.equal(d.frequency, 'weekly');
  assert.equal(d.agent_model, 'sonnet');
  assert.equal(d.expected_outcome, 'open-pr');
  assert.deepEqual(d.precondition_signals, ['commits', 'prs']);
  assert.equal(d.has_precondition, true);
});

test('parseDeclaration ignores a field named in a comment', () => {
  const d = parseDeclaration(`
    // WHY weekly: frequency: 'daily' would measure the same runs twice.
    export default { id: 'x', frequency: 'weekly' , };
  `);
  assert.equal(d.frequency, 'weekly');
});

// A field it cannot read must come back unknown. Defaulting it would put a
// confident wrong cadence — and so a wrong next-anchor — on the roster.
test('parseDeclaration reports an unreadable field as null, never a default', () => {
  const d = parseDeclaration('export default { id: computeId(), frequency: FREQ, };');
  assert.equal(d.frequency, null);
  assert.equal(d.agent_model, null);
});

test('parseDeclaration survives a missing file', () => {
  assert.equal(parseDeclaration(null).frequency, null);
});

// --- items ---------------------------------------------------------------------

test('isWorkItem keeps only the queue family', () => {
  assert.equal(isWorkItem({ title: '[claudinite-work] basics/x' }), true);
  assert.equal(isWorkItem({ title: '[claudinite-task] basics/x 2026-08-16' }), false);
  assert.equal(isWorkItem({ title: 'Claudinite tracker: Tidy Issues' }), false);
});

test('describeItem reads state, outcome and the body fields', () => {
  const d = describeItem(item({
    labels: [BLOCKED],
    body: 'packs/basics/tasks/ci-performance\n\nNot-before: 2026-08-17T04:00:00Z\nBlocked-by: #12, #13\n',
  }), NOW);
  assert.equal(d.pack, 'basics');
  assert.equal(d.task, 'ci-performance');
  assert.equal(d.state, BLOCKED);
  assert.equal(d.notBefore, '2026-08-17T04:00:00Z');
  assert.deepEqual(d.blockedBy, [12, 13]);
});

test('a closed item reports closed, and its outcome decodes to the canonical word', () => {
  const d = describeItem(item({ state: 'closed', labels: [AGENT, OUTCOME_DELIVERED], closed_at: '2026-08-16T06:00:00Z' }), NOW);
  assert.equal(d.state, 'closed');
  assert.equal(d.outcome, 'delivered');
  assert.equal(describeItem(item({ state: 'closed', labels: [TASK_DONE] }), NOW).outcome, 'done');
});

// The roll keeps its record on the item (executor `rollBody`); the page surfaces it
// so "why didn't it run" is answered without opening the issue.
test('describeItem surfaces the roll\'s last verdict', () => {
  const body = 'p/t\n\nNot-before: 2026-08-17T04:00:00Z\n\n### Last verdict\n\n'
    + '- 2026-08-16T05:00:00Z — the precondition declined: no signals in window\n'
    + '- Asked again at 2026-08-17T04:00:00Z.\n';
  const d = describeItem(item({ labels: [BLOCKED], body }), NOW);
  assert.equal(d.lastVerdict.reason, 'no signals in window');
  assert.equal(describeItem(item(), NOW).lastVerdict, null);
});

// The torn and unlabelled states are the janitor's repair cases, so they are real
// states here rather than being folded into a neighbour that looks healthy.
test('an open item with no state label reads as unlabelled, not blocked', () => {
  assert.equal(describeItem(item({ labels: [] }), NOW).state, 'unlabelled');
  assert.equal(describeItem(item({ labels: [READY, EXECUTING] }), NOW).state, 'torn');
});

// --- warnings mirror the engine's own recovery thresholds ----------------------

test('executing past the leash warns, and just under it does not', () => {
  const overdue = new Date(NOW - EXECUTING_LEASH_MS - 60e3).toISOString();
  const fresh = new Date(NOW - EXECUTING_LEASH_MS + 60e3).toISOString();
  assert.equal(warningsFor(item({ labels: [EXECUTING], updated_at: overdue }), NOW).length, 1);
  assert.equal(warningsFor(item({ labels: [EXECUTING], updated_at: fresh }), NOW).length, 0);
});

test('an agent claim past its own leash warns', () => {
  const overdue = new Date(NOW - AGENT_LEASH_MS - 60e3).toISOString();
  assert.match(warningsFor(item({ labels: [AGENT], updated_at: overdue }), NOW)[0].text, /agent claim/);
});

test('stale ready counts in the task\'s own periods', () => {
  const day = 86400e3;
  const updated = new Date(NOW - 3 * day).toISOString();
  const readyItem = item({ labels: [READY], updated_at: updated });
  // Weekly: 3 days is well inside two of its periods — no warning.
  assert.equal(warningsFor(readyItem, NOW, { periodFor: () => 7 * day }).length, 0);
  // Hourly: 3 days is far past two — warned.
  assert.equal(warningsFor(readyItem, NOW, { periodFor: () => 3600e3 }).length, 1);
});

// The standing-item model (tasks-dispatch DESIGN §5): a blocked item waiting out its
// `Not-before` is every quiet task's HEALTHY state — a weekly task's item sits so for
// a week — and flagging it taught the reader to ignore the queue's warnings.
test('an item waiting out a future Not-before is healthy, however long it has sat', () => {
  const rolled = item({
    labels: [BLOCKED],
    updated_at: new Date(NOW - 20 * 86400e3).toISOString(),
    body: 'p/t\n\nNot-before: 2026-08-23T04:00:00Z\n',
  });
  assert.equal(warningsFor(rolled, NOW).length, 0);
});

// Once the wake has passed, the next scheduler run readies the item within the hour; sitting
// long past it means the scheduler run is not running — the fault the old "blocked too long"
// warning could never distinguish from a quiet week.
test('an item due past the scheduler run slack is flagged as the scheduler run\'s fault', () => {
  const at = (msAgo) => item({ labels: [BLOCKED], body: `p/t\n\nNot-before: ${new Date(NOW - msAgo).toISOString()}\n` });
  const [w] = warningsFor(at(DUE_SLACK_MS + 60e3), NOW);
  assert.equal(w.level, 'serious');
  assert.match(w.text, /due but not readied/);
  assert.equal(warningsFor(at(DUE_SLACK_MS - 60e3), NOW).length, 0, 'inside the slack is the scheduler run\'s normal latency');
});

test('unresolved dependencies warn past the janitor threshold; unknown ones are never alarmed on', () => {
  const stuck = new Date(NOW - STUCK_BLOCKED_MS - 60e3).toISOString();
  const body = 'p/t\n\nBlocked-by: #12\n';
  const depsOpen = { isOpen: () => true };
  const [w] = warningsFor(item({ labels: [BLOCKED], body, updated_at: stuck }), NOW, depsOpen);
  assert.match(w.text, /janitor/);
  assert.equal(warningsFor(item({ labels: [BLOCKED], body }), NOW, depsOpen).length, 0, 'under the threshold is a normal wait');
  assert.equal(warningsFor(item({ labels: [BLOCKED], body, updated_at: stuck }), NOW).length, 0,
    'a blocker outside the fetched window is unknown — absence is a state, not an alarm');
});

test('a park\'s severity follows its triage lane', () => {
  assert.equal(warningsFor(item({ labels: [NEEDS_HUMAN] }), NOW)[0].level, 'critical');
  const [w] = warningsFor(item({ labels: [NEEDS_HUMAN, NEEDS_HUMAN_APPROVAL] }), NOW);
  assert.equal(w.level, 'warning');
  assert.match(w.text, /PR to approve/);
});

// --- the roster ----------------------------------------------------------------

const tasks = [
  { pack: 'basics', task: 'ci-performance', path: 'packs/basics/tasks/ci-performance/task.mjs', declaration: { frequency: 'weekly', agent_model: 'sonnet' } },
  { pack: 'claudinite-lifecycle', task: 'update', path: 'packs/claudinite-lifecycle/tasks/update/task.mjs', declaration: { frequency: 'daily' } },
];

test('every declared task gets a row, including one that has never run', () => {
  const rows = buildRoster({ tasks, items: [], now: NOW, schedule: SCHEDULE });
  assert.equal(rows.length, 2);
  assert.equal(rows.every((r) => r.current === null && r.history.length === 0), true);
  assert.ok(rows[0].nextAnchor instanceof Date);
});

test('a row picks up its open item and its closed history', () => {
  const items = [
    item({ number: 900, labels: [READY] }),
    item({ number: 880, state: 'closed', labels: [OUTCOME_DONE], created_at: '2026-08-09T04:00:00Z', closed_at: '2026-08-09T06:00:00Z' }),
    item({ number: 860, state: 'closed', labels: [OUTCOME_DELIVERED], created_at: '2026-08-02T04:00:00Z', closed_at: '2026-08-02T06:00:00Z' }),
    item({ number: 700, title: '[claudinite-work] claudinite-lifecycle/update', state: 'closed', labels: [OUTCOME_DONE] }),
  ];
  const rows = buildRoster({ tasks, items, now: NOW, schedule: SCHEDULE });
  const ci = rows.find((r) => r.task === 'ci-performance');
  assert.equal(ci.current.number, 900);
  assert.equal(ci.history.length, 2);
  assert.equal(ci.lastClosed.number, 880, 'the most recent closed item is the last outcome');
  assert.equal(rows.find((r) => r.task === 'update').history.length, 1, 'items route by title, not by order');
});

// `manual` has no anchor and an unreadable frequency has no anchor, and they are
// different facts — a roster that showed both as "—" would hide a parse failure.
test('manual and unknown cadences are distinguished, and neither invents an anchor', () => {
  const rows = buildRoster({
    tasks: [
      { pack: 'p', task: 'manual-one', declaration: { frequency: 'manual' } },
      { pack: 'p', task: 'unreadable', declaration: { frequency: null } },
    ],
    items: [], now: NOW, schedule: SCHEDULE,
  });
  assert.equal(rows[0].nextAnchor, null);
  assert.match(rows[0].anchorNote, /manual/);
  assert.equal(rows[1].nextAnchor, null);
  assert.match(rows[1].anchorNote, /unknown/);
});

test('with no schedule configured no anchor is guessed', () => {
  const rows = buildRoster({ tasks, items: [], now: NOW, schedule: null });
  assert.equal(rows[0].nextAnchor, null);
  assert.match(rows[0].anchorNote, /no schedule/);
});

test('the next anchor is in the future and lands on the configured hour', () => {
  const [ci] = buildRoster({ tasks, items: [], now: NOW, schedule: SCHEDULE });
  assert.ok(ci.nextAnchor.getTime() > NOW);
  assert.equal(ci.nextAnchor.getUTCHours(), SCHEDULE.dailyHour);
});

test('outcomeTally counts by the canonical words, and a closed item with no outcome', () => {
  const items = [
    item({ number: 1, state: 'closed', labels: [OUTCOME_DONE] }),
    item({ number: 2, state: 'closed', labels: [TASK_DONE] }),
    item({ number: 3, state: 'closed', labels: [] }),
  ];
  const tally = outcomeTally(buildRoster({ tasks, items, now: NOW, schedule: SCHEDULE }));
  assert.equal(tally.done, 2);
  assert.equal(tally.none, 1);
});

// --- the next ask ----------------------------------------------------------------

// What will actually happen next, derived from the standing item where one exists —
// the calendar answers only when no item does. The stamped Not-before is the ONE
// scheduling fact an item carries and it wins over the computed anchor (DESIGN §14,
// S28: a frequency change takes effect at the wake already stamped).
test('a rolled item\'s stamped wake outranks the computed anchor', () => {
  const rolled = item({ labels: [BLOCKED], body: 'p/t\n\nNot-before: 2026-08-20T09:30:00Z\n' });
  const [ci] = buildRoster({ tasks, items: [rolled], now: NOW, schedule: SCHEDULE });
  assert.equal(ci.nextAsk.kind, 'wake');
  assert.equal(ci.nextAsk.at.toISOString(), '2026-08-20T09:30:00.000Z');
});

// Only a failure park holds the task's lane (DESIGN §4) — the roster must say the
// schedule is STOPPED rather than show an anchor at which nothing will be filed.
test('a blocking park holds the schedule; a non-blocking one leaves the anchor standing', () => {
  const held = buildRoster({ tasks, items: [item({ labels: [NEEDS_HUMAN] })], now: NOW, schedule: SCHEDULE })[0];
  assert.equal(held.nextAsk.kind, 'held');

  const approval = buildRoster({
    tasks, items: [item({ labels: [NEEDS_HUMAN, NEEDS_HUMAN_APPROVAL] })], now: NOW, schedule: SCHEDULE,
  })[0];
  assert.equal(approval.nextAsk.kind, 'anchor');
  assert.equal(approval.nextAsk.at.getTime(), approval.nextAnchor.getTime());
});

test('ready and running items are their own answer', () => {
  assert.equal(buildRoster({ tasks, items: [item({ labels: [READY] })], now: NOW, schedule: SCHEDULE })[0].nextAsk.kind, 'ready');
  assert.equal(buildRoster({ tasks, items: [item({ labels: [AGENT] })], now: NOW, schedule: SCHEDULE })[0].nextAsk.kind, 'running');
});

test('with no open item the calendar answers, and a manual task has only its note', () => {
  const [ci] = buildRoster({ tasks, items: [], now: NOW, schedule: SCHEDULE });
  assert.equal(ci.nextAsk.kind, 'anchor');
  assert.equal(ci.nextAsk.at.getTime(), ci.nextAnchor.getTime());

  const [manual] = buildRoster({
    tasks: [{ pack: 'p', task: 'manual-one', declaration: { frequency: 'manual' } }],
    items: [], now: NOW, schedule: SCHEDULE,
  });
  assert.equal(manual.nextAsk.kind, 'note');
  assert.match(manual.nextAsk.note, /manual/);
});

test('commentKind names the protocol beat a comment carries', () => {
  assert.equal(commentKind('<!-- claudinite-claim -->\nclaimed'), 'claim');
  assert.equal(commentKind('<!-- claudinite-episode -->'), 'episode');
  assert.equal(commentKind('just a human talking'), null);
});
