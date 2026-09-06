import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  panelKind, buildPanel, convergeCommand, pendingPrPanel, failedTaskPanel,
  stuckItemPanel, plainIssuePanel, scheduledTaskPanel, parkPanel, runRecord,
} from '../explore.mjs';
import {
  WORK_PREFIX, MACHINE_BLOCK_START, MACHINE_BLOCK_END, CLAIM_MARKER, HANDOFF_MARKER,
  OUTCOME_DONE, OUTCOME_OBSOLETE,
} from '../../claudinite-tasks/shared-code/work-items.mjs';

const NOW = Date.parse('2026-09-02T10:30:00Z');
const DAY = 86400e3;
const iso = (t) => new Date(t).toISOString();
const body = (lines = []) => `${MACHINE_BLOCK_START}\npacks/p/tasks/t/task.md\n${lines.join('\n')}\n${MACHINE_BLOCK_END}`;
const item = (over = {}) => ({
  number: 42, title: `${WORK_PREFIX} p/t`, state: 'open', labels: [], body: body(),
  created_at: iso(NOW - 3 * DAY), updated_at: iso(NOW - DAY), ...over,
});

test('a mark opens the panel its STATUS earns, because the next move differs', () => {
  assert.equal(panelKind({ kind: 'pr' }), 'pending-pr');
  assert.equal(panelKind({ kind: 'task' }), 'scheduled-task');
  assert.equal(panelKind({ kind: 'item', parkKind: 'failure' }), 'failed-task');
  // An approval park IS its pull request, so it opens the PR's panel.
  assert.equal(panelKind({ kind: 'item', parkKind: 'approval' }), 'pending-pr');
  assert.equal(panelKind({ kind: 'item', parkKind: 'action' }), 'park');
  assert.equal(panelKind({ kind: 'item' }), 'stuck-item');
});

test('the converge command is the one converge-item.mjs prints for that item', () => {
  const cmd = convergeCommand(item(), 'o/r', 'failure');
  assert.match(cmd, /converge-item\.mjs/);
  assert.match(cmd, /--issue 42/);
  assert.match(cmd, /--outcome failure/);
  assert.match(cmd, /--summary/);
  assert.match(cmd, /--repo o\/r/);
  assert.match(cmd, /--item-file/);
});

test('every panel ends in one imperative — a panel that only describes is a longer hover', () => {
  const context = { item: item(), repo: 'o/r', items: [item()], prs: [], siblings: [], now: NOW };
  for (const row of [
    { kind: 'pr', gutter: '#200', title: 't', waits: true, why: 'no policy' },
    { kind: 'item', parkKind: 'failure', gutter: '#42', title: 't' },
    { kind: 'item', gutter: '#42', title: 't', broken: true, blocker: 90 },
    { kind: 'issue', gutter: '#90', title: 't' },
    { kind: 'task', key: 'p/t', task: 't' },
    { kind: 'item', parkKind: 'action', gutter: '#42', title: 't' },
  ]) {
    const panel = buildPanel(row, context);
    assert.ok(panel.do && panel.do.length > 10, `${panel.kind} must end in an imperative`);
    assert.ok(panel.fields.length, `${panel.kind} must carry fields`);
  }
});

test('a field this page cannot read says NOT READ rather than being left out', () => {
  // A missing row and an unreadable one are different facts, and only the second is
  // worth the reader's attention.
  const panel = pendingPrPanel(
    { kind: 'pr', gutter: '#200', title: 'a change', waits: true, why: 'no policy', closesIssue: null },
    { item: null, declaration: null, repo: 'o/r', prs: [], items: [], comments: null },
  );
  const size = panel.fields.find((f) => f.label === 'size · CI');
  assert.equal(size.value, null);
  assert.match(size.note, /a request each/);
  const left = panel.fields.find((f) => f.label === 'left by');
  assert.match(left.note, /have not been fetched/);
});

// Only a declaration carrying `last-run-not-failed` holds its lane on a failure.
const HOLDING = { preconditions: ['due:daily', 'last-run-not-failed'] };

test('the failed-task panel says when the lane\'s HELD claim is disproved by the record', () => {
  const parked = item({ number: 42, created_at: iso(NOW - 5 * DAY) });
  const panel = failedTaskPanel({ kind: 'item', parkKind: 'failure', gutter: '#42', title: 't' }, {
    item: parked, repo: 'o/r', declaration: HOLDING,
    siblings: [
      { number: 50, state: 'closed', closed_at: iso(NOW - 2 * DAY), labels: [{ name: OUTCOME_DONE }] },
      { number: 51, state: 'closed', closed_at: iso(NOW - DAY), labels: [{ name: OUTCOME_OBSOLETE }] },
    ],
  });
  const lane = panel.fields.find((f) => f.label === 'lane');
  assert.match(lane.value, /roster says this lane is HELD/);
  assert.match(lane.value, /2 later occurrence/);
  assert.match(panel.do, /converge-item\.mjs/);
});

test('a held lane with no later occurrence says only that it is held', () => {
  const panel = failedTaskPanel({ kind: 'item', parkKind: 'failure', gutter: '#42', title: 't' },
    { item: item(), repo: 'o/r', siblings: [], declaration: HOLDING });
  assert.match(panel.fields.find((f) => f.label === 'lane').value, /^held/);
});

// A failure park on a task whose declaration does not name `last-run-not-failed`
// holds nothing: the lane is open and the panel says so, never HELD — and an unread
// declaration is stated as unread rather than guessed either way.
test('a failure park holds no lane the declaration does not hold, and an unread declaration says so', () => {
  const later = [{ number: 50, state: 'closed', closed_at: iso(NOW - DAY), labels: [{ name: OUTCOME_DONE }] }];
  const open = failedTaskPanel({ kind: 'item', parkKind: 'failure', gutter: '#42', title: 't' }, {
    item: item({ created_at: iso(NOW - 5 * DAY) }), repo: 'o/r', siblings: later, declaration: { preconditions: ['due:daily'] },
  });
  assert.match(open.fields.find((f) => f.label === 'lane').value, /^open/);
  assert.doesNotMatch(open.fields.find((f) => f.label === 'lane').value, /HELD/);

  const unread = failedTaskPanel({ kind: 'item', parkKind: 'failure', gutter: '#42', title: 't' },
    { item: item(), repo: 'o/r', siblings: later });
  const lane = unread.fields.find((f) => f.label === 'lane');
  assert.equal(lane.value, null);
  assert.match(lane.note, /has not been read/);
});

test('the stuck-item panel names WHO is scheduled to move each blocker', () => {
  const blocked = item({ number: 42, body: body(['Blocked-by: #90 #91']) });
  const panel = stuckItemPanel({ kind: 'item', gutter: '#42', title: 't', broken: true, blocker: 90, why: 'no one', at: null }, {
    item: blocked, repo: 'o/r',
    items: [blocked, { number: 90, state: 'open', title: 'plain', body: '' }, { number: 91, state: 'open', title: `${WORK_PREFIX} p/t`, body: body() }],
    prs: [{ number: 200, closesIssue: 91, merged_at: null }],
  });
  // One `Blocked-by` LINE carrying both numbers, which is how the queue writes it —
  // the parser reads the line, not a list of lines.
  const chain = panel.fields.find((f) => f.label === 'the chain').value;
  assert.match(chain, /#90 open — moved by nobody/);
  assert.match(chain, /#91 open — moved by PR #200/);
  assert.match(panel.do, /Close #90/);
});

test('a plain issue that blocks rows is a different imperative from one that blocks nothing', () => {
  const issue = { number: 90, title: 'plain', state: 'open', labels: [{ name: 'quick-win' }], created_at: iso(NOW - 40 * DAY), updated_at: iso(NOW - 20 * DAY), body: '' };
  const blocking = plainIssuePanel({ kind: 'issue', gutter: '#90', title: 'plain' }, {
    item: issue, items: [{ number: 42, body: body(['Blocked-by: #90']) }], prs: [], now: NOW,
  });
  assert.match(blocking.do, /1 row\(s\) are waiting behind it/);
  assert.match(blocking.fields.find((f) => f.label === 'rot').value, /past the 14 d bar/);

  const lonely = plainIssuePanel({ kind: 'issue', gutter: '#90', title: 'plain' },
    { item: issue, items: [], prs: [], now: NOW });
  assert.match(lonely.fields.find((f) => f.label === 'quick-win').value, /unblocks nothing/);
  assert.match(lonely.do, /Decide/);
});

test('the scheduled-task panel reads the declaration, and says so where it names nothing', () => {
  const panel = scheduledTaskPanel({ kind: 'task', key: 'p/t', task: 't', row: { nextAsk: { at: new Date(NOW + DAY) } } }, {
    siblings: [{ number: 1, state: 'closed', closed_at: iso(NOW - DAY), labels: [{ name: OUTCOME_DONE }] }],
    declaration: { agent_model: 'sonnet' },
  });
  assert.equal(panel.fields.find((f) => f.label === 'model').value, 'sonnet');
  assert.match(panel.fields.find((f) => f.label === 'automerge').note, /its PRs wait for a person/);
  assert.match(panel.fields.find((f) => f.label === 'last occurrences').value, /done/);
});

test('a park panel names the one condition that would close it without a person', () => {
  const panel = parkPanel({ kind: 'item', parkKind: 'decision', gutter: '#42', title: 't' },
    { item: item({ body: body(['Ends-when: #7 closed']) }), repo: 'o/r' });
  assert.match(panel.fields.find((f) => f.label === 'would close itself when').value, /#7 closes/);
  assert.match(panel.do, /--outcome decision/);
  const alone = parkPanel({ kind: 'item', parkKind: 'action', gutter: '#42', title: 't' }, { item: item(), repo: 'o/r' });
  assert.match(alone.fields.find((f) => f.label === 'would close itself when').note, /only a person clears this/);
});

test('the run record is the queue\'s own protocol markers, not prose', () => {
  const comments = [
    { body: `${CLAIM_MARKER}\nclaimed`, created_at: iso(NOW - 2 * DAY) },
    { body: `${HANDOFF_MARKER}\nhanded off`, created_at: iso(NOW - DAY) },
  ];
  assert.match(runRecord(comments), /claimed .* → handed off /);
  assert.equal(runRecord([{ body: 'just a person talking' }]), null);
  assert.equal(runRecord(null), null, 'unfetched comments are unknown, not an empty record');
});
