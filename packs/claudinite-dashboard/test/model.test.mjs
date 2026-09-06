import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  buildRoster, declaredPackDirs, describeItem, describeCadence, isWorkItem, outcomeTally, wakeStrip, WAKE_STRIP_HOURS,
  parseDeclaration, taskDeclarationPaths, warningsFor, commentKind,
  EXECUTING_LEASH_MS, AGENT_LEASH_MS, STUCK_BLOCKED_MS, DUE_SLACK_MS,
  BLOCKED, READY, EXECUTING, AGENT,
} from '../model.mjs';
import {
  OUTCOME_DONE, OUTCOME_DELIVERED, TASK_DONE, NEEDS_HUMAN_APPROVAL, NEEDS_HUMAN,
} from '../../claudinite-tasks/shared-code/work-items.mjs';
import { normalizeTaskDeclaration } from '../../claudinite-tasks/shared-code/task-contract.mjs';

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
    'packs/basics/tasks/ci-performance/task.json',
    'packs/basics/tasks/ci-performance/worker.mjs',       // not a declaration
    'packs/claudinite-fleet-sheepdog/tasks/fleet-roster/task.json',          // pack not declared
    '.claudinite/shared/packs/claudinite-lifecycle/tasks/update/task.json',
    '.claudinite/local/packs/claudinite/tasks/growth/task.json',
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
      agent_model: 'sonnet',
      expected_outcome: 'fresh_pr',
      code_work_timeout: 300,
      preconditions: ['due:weekly', 'substantive-change'],
    };
  `);
  assert.equal(d.id, 'ci-performance');
  assert.deepEqual(d.preconditions, ['due:weekly', 'substantive-change']);
  assert.equal(d.agent_model, 'sonnet');
  assert.equal(d.expected_outcome, 'fresh_pr');
  assert.equal(d.has_precondition, true);
});

// The declarative form (task-preconditions): the roster reads the conditions
// themselves. A cadence term says WHEN, not whether, and `none` is the empty
// precondition — so a task carrying only those has no gate, which is what they mean.
test('parseDeclaration lifts the declarative preconditions; a cadence term and `none` are no gate', () => {
  const gated = parseDeclaration(`
    export default {
      id: 'improve-comments',
      preconditions: ['due:weekly', 'substantive-change', 'commits-outside:.claudinite/'],
      agent_model: 'sonnet',
    };
  `);
  assert.deepEqual(gated.preconditions, ['due:weekly', 'substantive-change', 'commits-outside:.claudinite/']);
  assert.equal(gated.precondition_signals, undefined, 'the retired field is not modelled at all — the union is derived');
  assert.equal(gated.has_precondition, true);

  const cadenceOnly = parseDeclaration("export default { id: 'update', preconditions: ['due:daily'] };");
  assert.deepEqual(cadenceOnly.preconditions, ['due:daily']);
  assert.equal(cadenceOnly.has_precondition, false);
  assert.equal(parseDeclaration("export default { id: 'x', preconditions: ['none'] };").has_precondition, false);
  assert.equal(parseDeclaration("export default { id: 'x', preconditions: [] };").has_precondition, false);
  assert.equal(parseDeclaration("export default { id: 'x' };").has_precondition, false, 'no conditions at all is no gate');
  assert.equal(parseDeclaration("export default { id: 'x', preconditions: ['last-run-over:7d', 'last-run-not-failed'] };").has_precondition, true,
    'a run-history gate is a gate; only the cadence term is exempt');
});

// The retired `frequency` field is still read — another repo's declaration, rendered
// over the API, may carry it — and it reads as exactly the cadence term the contract's
// door makes of it: first in the list, the `none` beside it dropped, the field gone.
test('a legacy `frequency` in the module form goes through the door', () => {
  const d = parseDeclaration(`
    export default { id: 'update', frequency: 'daily', preconditions: ['none'] };
  `);
  assert.deepEqual(d.preconditions, ['due:daily']);
  assert.equal(d.frequency, undefined, 'the field does not survive the door');
  assert.equal(d.has_precondition, false);
});

test('parseDeclaration ignores a field named in a comment', () => {
  const d = parseDeclaration(`
    // WHY weekly: frequency: 'daily' would measure the same runs twice, and
    // preconditions: ['substantive-change'] alone would never rest.
    export default { id: 'x', preconditions: ['due:weekly'] , };
  `);
  assert.deepEqual(d.preconditions, ['due:weekly']);
});

// A field it cannot read must come back unknown. Defaulting it would put a
// confident wrong cadence — and so a wrong next-anchor — on the roster.
test('parseDeclaration reports an unreadable field as null, never a default', () => {
  const d = parseDeclaration('export default { id: computeId(), preconditions: CONDITIONS, };');
  assert.equal(d.preconditions, null);
  assert.equal(d.agent_model, null);
});

// An ABSENT `preconditions` is another fact from an unreadable one: the declaration
// states the empty expression, which is what its author wrote — a task off the
// schedule. Only text that is no declaration at all has said nothing.
test('parseDeclaration reads an absent `preconditions` as the empty expression, and text that is no declaration as unknown', () => {
  assert.deepEqual(parseDeclaration("export default { id: 'lever' };").preconditions, []);
  assert.equal(parseDeclaration('<!doctype html><title>Not Found</title>').preconditions, null, 'not a declaration at all — nothing was read');
});

// The JSON form parses whole, and an omitted agentic field takes the contract's
// default — the loader's door, not a guess of this page's.
test('parseDeclaration reads a task.json, defaults filled', () => {
  const d = parseDeclaration('{ "$schema": "x", "id": "tidy-prs", "preconditions": ["due:weekly", "substantive-change"], "expected_outcome": "no_code_changes" }', 'packs/tidy-repo/tasks/tidy-prs/task.json');
  assert.equal(d.id, 'tidy-prs');
  assert.deepEqual(d.preconditions, ['due:weekly', 'substantive-change']);
  assert.equal(d.agent_model, 'none');
  assert.equal(d.agent_execution_timeout, null);
  assert.equal(d.has_precondition, true);
  const unsaid = parseDeclaration('{ "id": "x", "expected_outcome": "no_code_changes" }', 'p/tasks/x/task.json');
  assert.deepEqual(unsaid.preconditions, [], 'no `preconditions` key is the empty expression — off the schedule, not unknown');
  assert.equal(unsaid.has_precondition, false);
  const unreadable = parseDeclaration('{ "id": "x", "preconditions": "due:daily" }', 'p/tasks/x/task.json');
  assert.equal(unreadable.preconditions, null, 'a field that is present but not a list of strings was not read');
  const broken = parseDeclaration('{ "id": ', 'packs/tidy-repo/tasks/tidy-prs/task.json');
  assert.equal(broken.preconditions, null);
});

// The page cannot load the contract's door (it reaches into `node:` builtins), so
// it spells the one rule of it the roster needs. Both run over one vector set here —
// every shape the legacy field can arrive in — so the copy cannot drift from the
// contract without this going red.
test('the page\'s frequency and trigger doors agree with the contract\'s on every shape', () => {
  const vectors = [
    { id: 'a', frequency: 'daily' },
    { id: 'b', frequency: 'weekly', preconditions: ['none'] },
    { id: 'c', frequency: 'monthly', preconditions: [' none ', 'substantive-change'] },
    { id: 'd', frequency: 'manual', preconditions: ['substantive-change'] },
    { id: 'e', frequency: 'daily', preconditions: ['due:daily', 'commits-outside:.claudinite/'] },
    { id: 'f', frequency: 'hourly' },
    { id: 'g', preconditions: ['due:daily', 'none'] },
    { id: 'h', preconditions: ['last-run-over:3d'] },
    { id: 'i' },
    { id: 'j', frequency: 'manual' },
    // Stated, in both directions and against the shape the door would have read.
    { id: 'k', trigger: 'schedule', preconditions: ['due:daily'] },
    { id: 'l', trigger: 'request', preconditions: [] },
    { id: 'm', trigger: 'request', preconditions: ['due:weekly', 'substantive-change'] },
    { id: 'n', trigger: 'schedule', preconditions: [] },
  ];
  for (const decl of vectors) {
    const contract = normalizeTaskDeclaration({ ...decl, expected_outcome: 'no_code_changes' });
    const page = parseDeclaration(JSON.stringify({ ...decl, expected_outcome: 'no_code_changes' }), 'p/tasks/x/task.json');
    assert.deepEqual(page.preconditions, contract.preconditions, `vector ${decl.id}`);
    assert.equal(page.trigger, contract.trigger, `vector ${decl.id}: the two doors read one trigger`);
    assert.equal(page.frequency, contract.frequency, `vector ${decl.id}: neither side keeps the field`);
  }
});

// The roster's own read of the field, which the shape can no longer answer for it.
test('describeCadence follows a stated trigger against what the conditions look like', () => {
  const off = describeCadence(['due:weekly', 'substantive-change'], 'request');
  assert.equal(off.scheduled, false);
  assert.equal(off.frequency, 'unscheduled');
  assert.equal(off.cadence, null, 'a task nothing asks keeps no cadence to show');
  const on = describeCadence([], 'schedule');
  assert.equal(on.scheduled, true);
  assert.equal(on.frequency, 'on movement', 'asked at every tick, and nothing narrows it');
});

test('taskDeclarationPaths selects a task.json and a task.mjs alike', () => {
  const paths = ['packs/basics/tasks/a/task.json', 'packs/basics/tasks/b/task.mjs', 'packs/basics/tasks/c/task.md'];
  assert.deepEqual(taskDeclarationPaths(paths, { packs: ['basics'] }).map((t) => t.task), ['a', 'b']);
});

test('parseDeclaration survives a missing file', () => {
  assert.equal(parseDeclaration(null).preconditions, null);
});

// --- a task's cadence ---------------------------------------------------------------

// The four shapes a declaration's cadence takes, kept apart from each other and from an
// unreadable one: only a `due:` cadence is on the calendar, an elapsed one keeps a
// period but no anchor, no-cadence keeps neither, and NO CONDITIONS is off the
// schedule altogether.
test('describeCadence reads each cadence shape off the preconditions', () => {
  const DAY = 86400e3;
  const due = describeCadence(['due:weekly', 'substantive-change']);
  assert.equal(due.frequency, 'weekly');
  assert.deepEqual(due.cadence, { kind: 'due', cadence: 'weekly' });
  assert.equal(due.periodMs, 7 * DAY);
  assert.equal(due.scheduled, true);

  const elapsed = describeCadence(['last-run-over:3d']);
  assert.equal(elapsed.frequency, 'every 3d');
  assert.equal(elapsed.cadence.kind, 'elapsed');
  assert.equal(elapsed.periodMs, 3 * DAY);
  assert.equal(elapsed.scheduled, true);
  assert.match(elapsed.anchorNote, /newest run/);

  const unscheduled = describeCadence([]);
  assert.equal(unscheduled.frequency, 'unscheduled');
  assert.equal(unscheduled.cadence, null);
  assert.equal(unscheduled.periodMs, null);
  assert.equal(unscheduled.scheduled, false);
  assert.match(unscheduled.anchorNote, /somebody creates/);

  const movement = describeCadence(['substantive-change']);
  assert.equal(movement.frequency, 'on movement');
  assert.equal(movement.cadence, null);
  assert.equal(movement.periodMs, null);
  assert.equal(movement.scheduled, true);
  assert.match(movement.anchorNote, /every tick/);

  // A movement term as one ALTERNATIVE widens a cadence rather than replacing it.
  const widened = describeCadence(['due:daily || substantive-change']);
  assert.equal(widened.frequency, 'daily');
  assert.equal(widened.scheduled, true);

  // Whether a failure park holds the lane is the declaration's own word, read the
  // same way — and unknown where the declaration could not be read.
  assert.equal(due.holdsOnFailure, false);
  assert.equal(describeCadence(['due:daily', 'last-run-not-failed']).holdsOnFailure, true);
  assert.equal(describeCadence(null).holdsOnFailure, null);
});

test('describeCadence keeps an unreadable declaration apart from one with no cadence term and from one with no conditions', () => {
  const unread = describeCadence(null);
  assert.equal(unread.frequency, null);
  assert.equal(unread.scheduled, null, 'unknown, not "not scheduled"');
  assert.match(unread.anchorNote, /unknown/);
  assert.equal(describeCadence([]).scheduled, false, 'no conditions — not on the schedule');
  assert.equal(describeCadence(['substantive-change']).scheduled, true, 'a condition — asked at every tick');
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
  assert.equal(d.woken, null, 'the scheduler filed it — nobody woke it');
});

// An item somebody created or force-woke carries the moment; the page surfaces it so
// a run outside the cadence reads as asked for rather than as the scheduler misfiring.
test('describeItem surfaces the Woken stamp', () => {
  const d = describeItem(item({ body: 'packs/basics/tasks/ci-performance\n\nWoken: 2026-08-16T05:00:00Z\n' }), NOW);
  assert.equal(d.woken, '2026-08-16T05:00:00Z');
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
  { pack: 'basics', task: 'ci-performance', path: 'packs/basics/tasks/ci-performance/task.json', declaration: { preconditions: ['due:weekly'], agent_model: 'sonnet' } },
  { pack: 'claudinite-lifecycle', task: 'update', path: 'packs/claudinite-lifecycle/tasks/update/task.json', declaration: { preconditions: ['due:daily'] } },
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

// A task with no conditions has no anchor and an unreadable declaration has no anchor,
// and they are different facts — a roster that showed both as "—" would hide a parse
// failure. The key ABSENT from a declaration that was read is the first; a field that
// could not be read, or a declaration that could not be read at all, is the second.
test('unscheduled and unknown cadences are distinguished, and neither invents an anchor', () => {
  const rows = buildRoster({
    tasks: [
      { pack: 'p', task: 'lever', declaration: { id: 'lever' } },
      { pack: 'p', task: 'unreadable', declaration: { preconditions: null } },
      { pack: 'p', task: 'unread', declaration: null },
    ],
    items: [], now: NOW, schedule: SCHEDULE,
  });
  assert.equal(rows[0].nextAnchor, null);
  assert.equal(rows[0].frequency, 'unscheduled');
  assert.equal(rows[0].scheduled, false);
  assert.match(rows[0].anchorNote, /somebody creates/);
  for (const row of rows.slice(1)) {
    assert.equal(row.nextAnchor, null);
    assert.equal(row.frequency, null);
    assert.equal(row.scheduled, null);
    assert.match(row.anchorNote, /unknown/);
  }
});

// An older repo's declaration still says `manual`; it meant no schedule, and reads as
// exactly that through the door — the roster writes nothing in the old vocabulary.
test('a legacy `manual` declaration reads as an unscheduled task', () => {
  const declaration = parseDeclaration('{ "id": "lever", "frequency": "manual", "expected_outcome": "no_code_changes" }', 'p/tasks/lever/task.json');
  const [row] = buildRoster({ tasks: [{ pack: 'p', task: 'lever', declaration }], items: [], now: NOW, schedule: SCHEDULE });
  assert.equal(row.frequency, 'unscheduled');
  assert.equal(row.scheduled, false);
  assert.equal(row.nextAsk.kind, 'note');
  assert.doesNotMatch(JSON.stringify(row), /manual|woken/);
});

// An elapsed cadence keeps a period — the stale-ready rule counts in it — but no
// anchor: it counts from the task's newest run, which the calendar does not know.
test('an elapsed cadence has a period and a note, never an anchor', () => {
  const [row] = buildRoster({
    tasks: [{ pack: 'p', task: 'slow', declaration: { preconditions: ['last-run-over:3d', 'substantive-change'] } }],
    items: [], now: NOW, schedule: SCHEDULE,
  });
  assert.equal(row.frequency, 'every 3d');
  assert.equal(row.periodMs, 3 * 86400e3);
  assert.equal(row.nextAnchor, null);
  assert.equal(row.scheduled, true);
  assert.equal(row.nextAsk.kind, 'note');
  assert.match(row.nextAsk.note, /newest run/);
});

// No cadence term at all: the scheduler asks at every tick, so there is no next
// instant to promise and no period to count stale-ready in.
test('a task with no cadence term is scheduled, with no anchor and no period', () => {
  const [row] = buildRoster({
    tasks: [{ pack: 'p', task: 'move', declaration: { preconditions: ['substantive-change'] } }],
    items: [], now: NOW, schedule: SCHEDULE,
  });
  assert.equal(row.frequency, 'on movement');
  assert.equal(row.periodMs, null);
  assert.equal(row.nextAnchor, null);
  assert.equal(row.scheduled, true);
  assert.match(row.nextAsk.note, /every tick/);
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
// S28: a cadence change takes effect at the wake already stamped).
test('a rolled item\'s stamped wake outranks the computed anchor', () => {
  const rolled = item({ labels: [BLOCKED], body: 'p/t\n\nNot-before: 2026-08-20T09:30:00Z\n' });
  const [ci] = buildRoster({ tasks, items: [rolled], now: NOW, schedule: SCHEDULE });
  assert.equal(ci.nextAsk.kind, 'wake');
  assert.equal(ci.nextAsk.at.toISOString(), '2026-08-20T09:30:00.000Z');
});

// No park holds a task's lane by itself (DESIGN §5): a failure park stops the task
// only where its declaration says so with `last-run-not-failed`, and there the roster
// must say the schedule is STOPPED rather than show an anchor at which the task
// declines. Anywhere else the scheduler files the next run around the park, so the
// anchor stands.
test('a failure park holds the schedule only where the declaration says so', () => {
  const holding = [{ ...tasks[0], declaration: { preconditions: ['due:weekly', 'last-run-not-failed'] } }];
  const held = buildRoster({ tasks: holding, items: [item({ labels: [NEEDS_HUMAN] })], now: NOW, schedule: SCHEDULE })[0];
  assert.equal(held.holdsOnFailure, true);
  assert.equal(held.nextAsk.kind, 'held');

  const around = buildRoster({ tasks, items: [item({ labels: [NEEDS_HUMAN] })], now: NOW, schedule: SCHEDULE })[0];
  assert.equal(around.holdsOnFailure, false);
  assert.equal(around.nextAsk.kind, 'anchor');
  assert.equal(around.nextAsk.at.getTime(), around.nextAnchor.getTime());

  const approval = buildRoster({
    tasks: holding, items: [item({ labels: [NEEDS_HUMAN, NEEDS_HUMAN_APPROVAL] })], now: NOW, schedule: SCHEDULE,
  })[0];
  assert.equal(approval.nextAsk.kind, 'anchor');
  assert.equal(approval.nextAsk.at.getTime(), approval.nextAnchor.getTime());
});

test('ready and running items are their own answer', () => {
  assert.equal(buildRoster({ tasks, items: [item({ labels: [READY] })], now: NOW, schedule: SCHEDULE })[0].nextAsk.kind, 'ready');
  assert.equal(buildRoster({ tasks, items: [item({ labels: [AGENT] })], now: NOW, schedule: SCHEDULE })[0].nextAsk.kind, 'running');
});

test('with no open item the calendar answers, and an unscheduled task has only its note', () => {
  const [ci] = buildRoster({ tasks, items: [], now: NOW, schedule: SCHEDULE });
  assert.equal(ci.nextAsk.kind, 'anchor');
  assert.equal(ci.nextAsk.at.getTime(), ci.nextAnchor.getTime());

  const [unscheduled] = buildRoster({
    tasks: [{ pack: 'p', task: 'lever', declaration: { preconditions: [] } }],
    items: [], now: NOW, schedule: SCHEDULE,
  });
  assert.equal(unscheduled.nextAsk.kind, 'note');
  assert.match(unscheduled.nextAsk.note, /somebody creates/);
});

test('commentKind names the protocol beat a comment carries', () => {
  assert.equal(commentKind('<!-- claudinite-claim -->\nclaimed'), 'claim');
  assert.equal(commentKind('<!-- claudinite-episode -->'), 'episode');
  assert.equal(commentKind('just a human talking'), null);
});

// --- the wake strip ---------------------------------------------------------------

test('the strip buckets the next asks by UTC hour, from the hour we are in', () => {
  const now = Date.parse('2026-09-02T10:30:00Z');
  const strip = wakeStrip([
    { key: 'a/b', nextAsk: { kind: 'anchor', at: new Date('2026-09-02T12:15:00Z') } },
    { key: 'a/c', nextAsk: { kind: 'wake', at: '2026-09-02T12:45:00Z' } },
  ], now);
  assert.equal(strip.from, '2026-09-02T10', 'the hour containing now, not the minute');
  assert.equal(strip.hours.length, WAKE_STRIP_HOURS);
  assert.deepEqual(strip.hours.find((h) => h.hour === '2026-09-02T12').tasks.map((t) => t.key), ['a/b', 'a/c']);
  assert.equal(strip.peak, 2, 'what the busiest hour holds — whether the day is spread out or piled up');
});

test('a HELD task is placed at now rather than dropped', () => {
  // A blocking park stops the task being scheduled at all, so it has no future anchor.
  // Dropping it would draw the emptiest strip on the worst-off repo — the one case
  // where an empty hour must not read as a quiet one.
  const now = Date.parse('2026-09-02T10:30:00Z');
  const strip = wakeStrip([{ key: 'a/held', nextAsk: { kind: 'held' } }], now);
  const first = strip.hours[0];
  assert.deepEqual(first.tasks.map((t) => t.key), ['a/held']);
  assert.equal(first.held, 1);
});

test('an ask that names no moment, or one past the strip, lands in no hour', () => {
  const now = Date.parse('2026-09-02T10:30:00Z');
  const strip = wakeStrip([
    { key: 'a/ready', nextAsk: { kind: 'ready' } },
    { key: 'a/running', nextAsk: { kind: 'running', phase: 'agent' } },
    { key: 'a/deps', nextAsk: { kind: 'deps', on: [3] } },
    { key: 'a/note', nextAsk: { kind: 'note', note: 'no conditions — runs only from an item somebody creates' } },
    { key: 'a/weekly', nextAsk: { kind: 'anchor', at: new Date('2026-09-09T12:00:00Z') } },
  ], now);
  assert.equal(strip.peak, 0, 'these are happening, or waiting on something other than the clock');
});

test('the strip carries the repo a row came from, so one fleet-wide strip is possible', () => {
  const now = Date.parse('2026-09-02T10:00:00Z');
  const strip = wakeStrip([
    { key: 'a/b', repo: 'o/one', nextAsk: { kind: 'anchor', at: new Date('2026-09-02T11:00:00Z') } },
    { key: 'a/b', repo: 'o/two', nextAsk: { kind: 'anchor', at: new Date('2026-09-02T11:30:00Z') } },
  ], now);
  assert.deepEqual(strip.hours.find((h) => h.hour === '2026-09-02T11').tasks.map((t) => t.repo), ['o/one', 'o/two']);
});
