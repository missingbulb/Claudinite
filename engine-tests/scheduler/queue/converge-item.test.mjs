// The terminal transition performed in code (#892) and the close-time release
// beside it (DESIGN §15.19). What these pin is the part a session used to do from
// prose: five ordered side effects, in order, exactly once — and the two ways it
// went wrong on live traffic (an item closed still wearing `task:agent`, an item
// closed with no execution record at all) failing loudly here instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OUTCOMES, convergeItem, parseArgs, refusal, recordLine, convergeComment,
} from '../../../engine/scheduler/queue/converge-item.mjs';
import { releasedBy, isReleasable } from '../../../engine/scheduler/queue/readiness.mjs';

const item = (over = {}) => ({
  number: 7, title: '[claudinite-work] p/a', state: 'open', labels: ['task:agent'],
  body: 'packs/p/tasks/a/task.md\n', ...over,
});

// A fake repo driven through the same REST paths the shell calls.
function fakeRepo(issues) {
  const state = { issues, comments: [], calls: [] };
  const find = (n) => state.issues.find((i) => i.number === n);
  const gh = async (path, { method = 'GET', body } = {}) => {
    state.calls.push(`${method} ${path}`);
    let m;
    if ((m = /^\/repos\/[^/]+\/[^/]+\/issues\?/.exec(path))) {
      const page = Number(/[?&]page=(\d+)/.exec(path)?.[1] ?? 1);
      return { status: 200, json: page === 1 ? state.issues.filter((i) => i.state === 'open') : [] };
    }
    if ((m = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments/.exec(path))) {
      state.comments.push({ issue: Number(m[1]), body: body.body });
      return { status: 201, json: {} };
    }
    if ((m = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/labels\/(.+)$/.exec(path))) {
      const i = find(Number(m[1]));
      i.labels = i.labels.filter((l) => l !== decodeURIComponent(m[2]));
      return { status: 200, json: {} };
    }
    if ((m = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/labels$/.exec(path))) {
      find(Number(m[1])).labels.push(...body.labels);
      return { status: 200, json: {} };
    }
    if ((m = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)$/.exec(path))) {
      const i = find(Number(m[1]));
      if (method === 'PATCH') Object.assign(i, body);
      return { status: 200, json: i };
    }
    return { status: 404, json: null };
  };
  return { state, gh, find };
}

const api = await import('../../../engine/scheduler/github.mjs');
const run = (repo, plan, over = {}) => convergeItem(api, repo.gh, 'o/r', plan, { log: () => {}, ...over });

// --- the argument surface ------------------------------------------------------

test('the command refuses a plan it cannot perform rather than guessing', () => {
  assert.match(parseArgs(['--outcome', 'done', '--summary', 'x']).error, /--issue/);
  assert.match(parseArgs(['--issue', '7', '--summary', 'x']).error, /--outcome/);
  assert.match(parseArgs(['--issue', '7', '--outcome', 'nope', '--summary', 'x']).error, /--outcome/);
  assert.match(parseArgs(['--issue', '7', '--outcome', 'done', '--summary', '   ']).error, /--summary/);
  // An approval park nobody can act on is not a park.
  assert.match(parseArgs(['--issue', '7', '--outcome', 'approval', '--summary', 'x']).error, /--pr/);
  assert.deepEqual(parseArgs(['--issue', '7', '--outcome', 'done', '--summary', 'did it']),
    { issue: 7, outcome: 'done', summary: 'did it', pr: null });
});

// --- who may converge ----------------------------------------------------------

test('an item this session does not hold is refused, not converged', () => {
  assert.match(refusal(null, 7), /could not be read/);
  // Membership is naming a task, not carrying the title: a marked issue keeps its
  // own human title and is its own item (DESIGN §16.1).
  assert.match(refusal(item({ title: 'just an issue', body: 'please do the thing\n' }), 7),
    /not a Claudinite work item/);
  assert.equal(refusal(item({
    title: 'Implement the thing',
    body: 'do it\n\n<!-- claudinite-item -->\nengine/scheduler/queue/tasks/implement-request/task.md\n\nRequest: #7\n<!-- /claudinite-item -->\n',
  }), 7), null);
  assert.match(refusal(item({ state: 'closed' }), 7), /already closed/);
  assert.match(refusal(item({ labels: ['task:executing'] }), 7), /task:agent/);
  assert.equal(refusal(item(), 7), null);
});

test('a refusal writes nothing at all', async () => {
  const repo = fakeRepo([item({ labels: ['task:executing'] })]);
  const res = await run(repo, { issue: 7, outcome: 'done', summary: 'did it' });
  assert.equal(res.ok, false);
  assert.deepEqual(repo.state.comments, []);
  assert.deepEqual(repo.find(7).labels, ['task:executing']);
  assert.equal(repo.find(7).state, 'open');
});

// --- the close: all five side effects, and the record ---------------------------

test('a done outcome closes the item with the label swapped and the record on it', async () => {
  const repo = fakeRepo([item()]);
  const res = await run(repo, { issue: 7, outcome: 'done', summary: 'ran the thing' });
  assert.equal(res.ok, true);
  const issue = repo.find(7);
  assert.equal(issue.state, 'closed');
  assert.equal(issue.state_reason, 'completed');
  assert.ok(issue.labels.includes('task:done'));
  // The failure that reached live traffic: a closed item still reading as live.
  assert.equal(issue.labels.includes('task:agent'), false, 'a closed item must not wear task:agent');
  // …and the other one: closed with no record at all.
  assert.match(repo.state.comments[0].body, /ran the thing/);
  assert.match(repo.state.comments[0].body, /claudinite-task-exec v1 p\/a \[#7\] success/);
});

test('the record is printed as well as commented — the census reads the transcript', async () => {
  const repo = fakeRepo([item()]);
  const printed = [];
  await run(repo, { issue: 7, outcome: 'done', summary: 'x' }, { log: (l) => printed.push(l) });
  assert.deepEqual(printed.filter((l) => l.startsWith('claudinite-task-exec')),
    ['claudinite-task-exec v1 p/a [#7] success']);
});

// An approval park is a run that SUCCEEDED and left a PR. The record vocabulary
// has no word for that, and absence is the honest answer — never a `failed` that
// would read as a broken run in the census.
test('a park that is not a failure carries no record', () => {
  assert.equal(recordLine(item(), OUTCOMES.approval.record), null);
  assert.equal(recordLine(item(), OUTCOMES.failure.record), 'claudinite-task-exec v1 p/a [#7] failed');
  assert.doesNotMatch(convergeComment(item(), { summary: 's', pr: 9, record: null }), /claudinite-task-exec/);
});

test('a park leaves the item open wearing both labels', async () => {
  const repo = fakeRepo([item()]);
  await run(repo, { issue: 7, outcome: 'failure', summary: 'it broke' });
  const issue = repo.find(7);
  assert.equal(issue.state, 'open');
  assert.deepEqual(issue.labels.sort(), ['needs-human', 'task:needs-human-failure']);
});

// --- the request write-back ----------------------------------------------------

test('an approval park hands its request issue to the reviewer', async () => {
  const repo = fakeRepo([
    item({ body: 'packs/p/tasks/a/task.md\n\nRequest: #42\n' }),
    { number: 42, title: 'do a thing', state: 'open', labels: ['claude-queued'] },
  ]);
  await run(repo, { issue: 7, outcome: 'approval', summary: 'opened it', pr: 9 });
  assert.deepEqual(repo.find(42).labels, ['claude-in-review']);
  assert.match(repo.state.comments.find((c) => c.issue === 42).body, /#9/);
});

// A failure writes NOTHING to the request and leaves `claude-queued` standing:
// re-arming work that writes code is a person's decision, and that standing label
// is what stops the next scheduler run queueing a second run of the same request.
test('a failure park leaves the request armed and says nothing to it', async () => {
  const repo = fakeRepo([
    item({ body: 'packs/p/tasks/a/task.md\n\nRequest: #42\n' }),
    { number: 42, title: 'do a thing', state: 'open', labels: ['claude-queued'] },
  ]);
  await run(repo, { issue: 7, outcome: 'failure', summary: 'it broke' });
  assert.deepEqual(repo.find(42).labels, ['claude-queued']);
  assert.equal(repo.state.comments.some((c) => c.issue === 42), false);
});

// --- the close-time release (DESIGN §15.19) ------------------------------------

const blocked = (number, blockedBy, over = {}) => ({
  number, title: `[claudinite-work] p/b${number}`, state: 'open', labels: ['task:blocked'],
  body: `packs/p/tasks/b/task.md\n\nBlocked-by: ${blockedBy.map((n) => `#${n}`).join(', ')}\n`, ...over,
});

test('closing an item readies what it was the last blocker of', async () => {
  const repo = fakeRepo([item(), blocked(8, [7])]);
  const res = await run(repo, { issue: 7, outcome: 'done', summary: 'x' });
  assert.deepEqual(res.freed, [8]);
  assert.deepEqual(repo.find(8).labels, ['task:ready']);
});

test('an item still waiting on a second blocker is left alone', async () => {
  const repo = fakeRepo([
    item(), blocked(8, [7, 9]),
    { number: 9, title: 'other', state: 'open', labels: [] },
  ]);
  const res = await run(repo, { issue: 7, outcome: 'done', summary: 'x' });
  assert.deepEqual(res.freed, []);
  assert.deepEqual(repo.find(8).labels, ['task:blocked']);
});

// A park releases nothing: the item is still open, so nothing waiting on it has
// stopped waiting.
test('a park releases nothing', async () => {
  const repo = fakeRepo([item(), blocked(8, [7])]);
  const res = await run(repo, { issue: 7, outcome: 'failure', summary: 'x' });
  assert.deepEqual(res.freed, []);
  assert.deepEqual(repo.find(8).labels, ['task:blocked']);
});

// --- the predicate, shared with the scheduler run ---------------------------------------

test('the readiness predicate holds an item its Not-before still covers', () => {
  const soon = blocked(8, [7], { body: 'packs/p/tasks/b/task.md\n\nNot-before: 2026-08-20T12:00:00Z\n' });
  const stateOf = () => 'closed';
  assert.equal(isReleasable(soon, { stateOf, nowMs: Date.parse('2026-08-20T11:00:00Z') }), false);
  assert.equal(isReleasable(soon, { stateOf, nowMs: Date.parse('2026-08-20T12:00:01Z') }), true);
});

test('an unreadable blocker delays rather than releases', () => {
  // stateOf answers null for a number nothing could resolve — convergence, not
  // prevention: the item waits for the scheduler run rather than running on a guess.
  assert.equal(isReleasable(blocked(8, [7]), { stateOf: () => null }), false);
});

test('an item in triage is nobody to release', () => {
  const parked = blocked(8, [7], { labels: ['task:blocked', 'needs-human'] });
  assert.equal(isReleasable(parked, { stateOf: () => 'closed' }), false);
  assert.deepEqual(releasedBy(7, [parked], { stateOf: () => 'closed' }), []);
});
