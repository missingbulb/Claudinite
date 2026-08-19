// The ad-hoc request mode (tasks-dispatch DESIGN §16), against the real modules.
// The simulator plays S44–S51 over a model of the design; these assert the same
// properties of the code that ships — adoption's label mechanics in `planTick`, the
// read in the `request` collector, the verdict in the built-in task's precondition,
// and the two write-backs in the executor.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTick } from '../../../engine/scheduler/queue/tick.mjs';
import { runExecutor } from '../../../engine/scheduler/queue/executor.mjs';
import { collectSignals } from '../../../engine/scheduler/signals/index.mjs';
import requestTask, { eligibility } from '../../../engine/scheduler/queue/tasks/implement-request/task.mjs';
import { REQUEST_TASK_ID } from '../../../engine/scheduler/built-in-tasks.mjs';
import { parseWorkItemBody } from '../../../engine/scheduler/queue/work-item.mjs';

const SCHEDULE = { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 };
const NOW = '2026-08-19T09:17:00Z';
const TASK_PATH = 'engine/scheduler/queue/tasks/implement-request/task.md';

const REQUEST_TASK = {
  pack: 'engine', id: 'implement-request', taskDir: 'engine/scheduler/queue/tasks/implement-request',
  taskPath: TASK_PATH, decl: requestTask,
};

const marked = (number, labels = ['claude-task']) => ({ number, title: `A thing to do`, state: 'open', labels });

let seq = 700;
const requestItem = (request, labels, over = {}) => ({
  number: (seq += 1),
  title: `[claudinite-work] engine/implement-request #${request}`,
  body: `${TASK_PATH}\n\nRequest: #${request}\nModel: opus\n`,
  state: 'open', labels, created_at: NOW, updated_at: NOW, closed_at: null, ...over,
});

const ops = (over = {}) => planTick({
  tasks: [REQUEST_TASK], items: [], requests: [], now: NOW, schedule: SCHEDULE, ...over,
}).ops;

// --- S44: a marked issue becomes exactly one run ------------------------------

test('S44 — a marked issue becomes one item, and the consumed mark is the exactly-once guard', () => {
  const adopts = ops({ requests: [marked(500)] }).filter((o) => o.kind === 'adopt');
  assert.equal(adopts.length, 1);
  const [adopt] = adopts;
  assert.equal(adopt.request, 500);
  assert.equal(adopt.title, '[claudinite-work] engine/implement-request #500');
  assert.deepEqual(adopt.labels, ['task:ready'], 'born ready — a request has no anchor to wait for');
  assert.deepEqual(parseWorkItemBody(adopt.body), {
    taskPath: TASK_PATH, notBefore: null, blockedBy: [], request: 500, model: 'opus',
  });
  assert.deepEqual(adopt.consume, ['claude-task']);

  // The item is structurally ad-hoc — a `manual` task, and a qualified title — so it
  // sits outside every scheduled family (§3) rather than being anybody's occurrence.
  assert.equal(requestTask.frequency, 'manual');

  // The tick after the mark was consumed adopts nothing: the issue now carries only
  // the queued label, and no state anywhere says "this was already done".
  const later = ops({
    requests: [marked(500, ['claude-queued'])],
    items: [requestItem(500, ['task:agent'])],
  });
  assert.deepEqual(later.filter((o) => o.kind === 'adopt'), []);
});

test('a repo whose engine has no request task adopts nothing — the marks simply wait', () => {
  const adopts = planTick({ tasks: [], items: [], requests: [marked(500)], now: NOW, schedule: SCHEDULE })
    .ops.filter((o) => o.kind === 'adopt');
  assert.deepEqual(adopts, []);
});

// --- S47: the model label routes the run --------------------------------------

test('S47 — the model label reaches the item, an unknown family falls back, and both are consumed (F29)', () => {
  const [sonnet] = ops({ requests: [marked(500, ['claude-task', 'claude-model:sonnet'])] }).filter((o) => o.kind === 'adopt');
  assert.equal(parseWorkItemBody(sonnet.body).model, 'sonnet');
  assert.deepEqual(sonnet.consume.sort(), ['claude-model:sonnet', 'claude-task']);

  // An unrecognised family runs at the default rather than parking a request nobody
  // can start — and its label is consumed too, so the next ask starts clean.
  const [unknown] = ops({ requests: [marked(500, ['claude-task', 'claude-model:gpt-9'])] }).filter((o) => o.kind === 'adopt');
  assert.equal(parseWorkItemBody(unknown.body).model, 'opus');
  assert.deepEqual(unknown.consume.sort(), ['claude-model:gpt-9', 'claude-task']);

  // Two marked issues make two items, neither aware of the other.
  const two = ops({ requests: [marked(500), marked(501)] }).filter((o) => o.kind === 'adopt');
  assert.deepEqual(two.map((o) => o.request), [500, 501]);
});

// --- S51 / S49: one issue, one live item (F28) --------------------------------

test('S51 — a re-ask waits, unconsumed, while the previous run is still live', () => {
  for (const state of ['task:ready', 'task:executing', 'task:agent']) {
    const plan = ops({ requests: [marked(500)], items: [requestItem(500, [state])] });
    assert.deepEqual(plan.filter((o) => o.kind === 'adopt'), [], `a ${state} prior item holds the mark back`);
    assert.deepEqual(plan.filter((o) => o.kind === 'supersede'), [], 'and nothing is closed while it runs');
  }
});

test('S49 — a re-ask supersedes a PARKED prior run rather than queueing beside it', () => {
  const parked = requestItem(500, ['needs-human', 'task:needs-human-failure']);
  const plan = ops({ requests: [marked(500)], items: [parked] });
  const [supersede] = plan.filter((o) => o.kind === 'supersede');
  assert.equal(supersede.issue, parked.number);
  assert.match(supersede.reason, /#500 was marked again/);
  assert.equal(plan.filter((o) => o.kind === 'adopt').length, 1, 'and the re-ask is adopted in the same tick');
});

test('an item for a DIFFERENT request never holds this one back', () => {
  const other = requestItem(499, ['task:agent']);
  assert.equal(ops({ requests: [marked(500)], items: [other] }).filter((o) => o.kind === 'adopt').length, 1);
});

// --- the precondition: the security check (S45, S46, S48, S50) ----------------

const req = (over = {}) => ({
  number: 500, state: 'open', queued: true, labels: ['claude-queued'],
  author: 'stranger', authorPermission: 'none', approvals: [], ...over,
});
const verdict = (signalRequest) => requestTask.precondition({ request: signalRequest }, {}, { request: 500 });

test('S45 — an issue nobody with push asked for is refused, as a plain no-go', () => {
  const v = verdict(req());
  assert.equal(v.run, false);
  assert.match(v.reason, /neither opened nor approved/);
  assert.equal(v.error, undefined, 'a refusal is a verdict, not a failure');
});

test('the passing verdict adds no Context of its own — adoption already bound the item', () => {
  // Two writers of the same binding scope render as two near-identical bullets in
  // the one section the session reads (#1074/#1075, the first live request).
  const v = verdict(req({ authorPermission: 'admin' }));
  assert.equal(v.run, true);
  assert.equal(v.context, undefined);
});

test('S46 — the verdict is the PERMISSION, not the association (F30)', () => {
  assert.equal(verdict(req({ author: 'owner', authorPermission: 'admin' })).run, true);
  assert.equal(verdict(req({ authorPermission: 'write' })).run, true);
  assert.equal(verdict(req({ authorPermission: 'maintain' })).run, true);
  // A read-only collaborator rides every payload as COLLABORATOR and is refused on
  // their own issue exactly like a stranger; so is a triager.
  assert.equal(verdict(req({ authorPermission: 'read' })).run, false);
  assert.equal(verdict(req({ authorPermission: 'triage' })).run, false);

  // The blessing is a comment from somebody with push — and only then.
  assert.equal(verdict(req({ approvals: [{ login: 'dev', permission: 'write' }] })).run, true);
  assert.equal(verdict(req({ approvals: [{ login: 'fan', permission: 'read' }] })).run, false);
  assert.equal(eligibility(req({ approvals: [{ login: 'dev', permission: 'write' }] })).why, 'approved by @dev with `/claude go`');
});

test('S48 — a request withdrawn between adoption and pickup declines', () => {
  assert.match(verdict(req({ queued: false, authorPermission: 'admin' })).reason, /withdrawn/);
  assert.match(verdict(req({ state: 'closed', authorPermission: 'admin' })).reason, /closed before this ran/);
});

test('S50 — gone declines; unreadable FAILS the run rather than guessing (F27)', () => {
  const goneVerdict = verdict({ number: 500, gone: true });
  assert.equal(goneVerdict.run, false);
  assert.equal(goneVerdict.error, undefined);

  for (const unreadable of [{ number: 500, unreadable: true, error: 'the issues API answered 500' }, null]) {
    const v = verdict(unreadable);
    assert.ok(v.error, 'a read that could not answer is a failure, not a decline');
    assert.notEqual(v.run, false, 'and never a no-go, whose write-back could not land');
  }
});

// --- the request read ---------------------------------------------------------

const ghFor = (routes) => async (path) => {
  for (const [re, resp] of routes) if (re.test(path)) return typeof resp === 'function' ? resp(path) : resp;
  return { status: 404, json: null };
};
const readRequest = (routes, number = 500) =>
  collectSignals(ghFor(routes), { repo: 'o/r', item: { request: number } }, ['request'])
    .then((s) => s.request);

test('the request read gathers the author, the blessers and their permissions — and judges nothing', async () => {
  const got = await readRequest([
    [/\/issues\/500$/, { status: 200, json: { number: 500, state: 'open', labels: [{ name: 'claude-queued' }], user: { login: 'stranger' } } }],
    [/\/issues\/500\/comments/, { status: 200, json: [
      { user: { login: 'noise' }, body: 'this would be great' },
      { user: { login: 'dev' }, body: '/claude go' },
    ] }],
    [/\/collaborators\/stranger\/permission$/, { status: 404, json: null }],
    [/\/collaborators\/dev\/permission$/, { status: 200, json: { role_name: 'write', permission: 'write' } }],
  ]);
  assert.equal(got.queued, true);
  assert.equal(got.author, 'stranger');
  assert.equal(got.authorPermission, 'none', 'a login the collaborators API does not know has no permission');
  assert.deepEqual(got.approvals, [{ login: 'dev', permission: 'write' }]);
  assert.equal(requestTask.precondition({ request: got }, {}, { request: 500 }).run, true);
});

test('the read distinguishes gone from unreadable, on both APIs it touches', async () => {
  const issue = { status: 200, json: { number: 500, state: 'open', labels: [{ name: 'claude-queued' }], user: { login: 'a' } } };
  assert.deepEqual(await readRequest([[/\/issues\/500$/, { status: 404, json: null }]]), { number: 500, gone: true });

  const flaky = await readRequest([[/\/issues\/500$/, { status: 500, json: null }]]);
  assert.equal(flaky.unreadable, true);

  // A permission read that fails is unreadable too: guessing "no permission" there
  // would refuse a legitimate request over a rate limit, and disarm it for good.
  const denied = await readRequest([
    [/\/issues\/500$/, issue],
    [/\/issues\/500\/comments/, { status: 200, json: [] }],
    [/\/collaborators\/a\/permission$/, { status: 403, json: null }],
  ]);
  assert.equal(denied.unreadable, true);
  assert.match(denied.error, /permission API answered 403/);
});

test('an item that names no request collects nothing rather than reading something else', async () => {
  assert.equal(await readRequest([[/./, { status: 200, json: {} }]], null), null);
});

// --- the executor's two ends (S45's disarm, S50's park) -----------------------

function fakeRepo(issues) {
  const state = { issues: issues.map((i) => ({ comments: [], state: 'open', ...i })), commentSeq: 100 };
  const find = (n) => state.issues.find((i) => i.number === n);
  const gh = async (path, { method = 'GET', body } = {}) => {
    let m;
    if (method === 'GET' && /\/issues\?/.test(path)) {
      const page = Number(/[?&]page=(\d+)/.exec(path)?.[1] ?? 1);
      return { status: 200, json: page === 1 ? state.issues.filter((i) => i.state === 'open') : [] };
    }
    if ((m = /\/issues\/comments\/(\d+)$/.exec(path))) {
      for (const i of state.issues) {
        const c = i.comments.find((x) => x.id === Number(m[1]));
        if (c) { if (method === 'PATCH') c.body = body.body; return { status: 200, json: c }; }
      }
      return { status: 404, json: null };
    }
    if ((m = /\/issues\/(\d+)\/comments/.exec(path))) {
      const issue = find(Number(m[1]));
      if (method === 'POST') { issue.comments.push({ id: (state.commentSeq += 1), body: body.body }); return { status: 201, json: {} }; }
      return { status: 200, json: issue.comments };
    }
    if ((m = /\/issues\/(\d+)\/labels\/(.+)$/.exec(path))) {
      const issue = find(Number(m[1]));
      issue.labels = issue.labels.filter((l) => l !== decodeURIComponent(m[2]));
      return { status: 200, json: {} };
    }
    if ((m = /\/issues\/(\d+)\/labels$/.exec(path))) {
      find(Number(m[1])).labels.push(...body.labels);
      return { status: 200, json: {} };
    }
    if ((m = /\/issues\/(\d+)$/.exec(path))) {
      const issue = find(Number(m[1]));
      if (method === 'PATCH') Object.assign(issue, body);
      return { status: 200, json: issue };
    }
    return { status: 404, json: null };
  };
  return { state, gh, find };
}

const drive = (repo, signalRequest, over = {}) => runExecutor({
  gh: repo.gh, repo: 'o/r', root: '/tmp', config: { taskScheduler: SCHEDULE, packConfig: {} },
  tasks: [REQUEST_TASK], executorId: 'E1', maxItems: 1, now: () => new Date(NOW),
  collectSignalsFor: async () => ({ request: signalRequest }),
  runTaskCodeWork: async () => { throw new Error('the request task declares no code-work'); },
  invokeAgent: async () => ({ ok: true, sessionId: 's-1' }),
  log: () => {},
  ...over,
});

test('S45 — a declined request is disarmed on the issue in the same convergence', async () => {
  const item = requestItem(500, ['task:ready'], { number: 1 });
  const repo = fakeRepo([item, { number: 500, title: 'a thing', labels: ['claude-queued'], body: '' }]);
  const done = await drive(repo, req());

  assert.deepEqual(done.map((d) => d.outcome), ['obsolete']);
  assert.equal(repo.find(1).state, 'closed');
  assert.ok(repo.find(1).labels.includes('task:obsolete'));
  // The disarm is the point: without it every tick from here re-adopts and re-refuses.
  assert.deepEqual(repo.find(500).labels, []);
  assert.match(repo.find(500).comments.at(-1).body, /Not implementing this/);
});

test('S50 — an unreadable request parks the item open and touches the issue not at all', async () => {
  const item = requestItem(500, ['task:ready'], { number: 1 });
  const repo = fakeRepo([item, { number: 500, title: 'a thing', labels: ['claude-queued'], body: '' }]);
  const done = await drive(repo, { number: 500, unreadable: true, error: 'the issues API answered 502' });

  assert.deepEqual(done.map((d) => d.outcome), ['needs-human']);
  assert.equal(repo.find(1).state, 'open', 'open and visible, so the re-queue lever can retry it');
  assert.ok(repo.find(1).labels.includes('task:needs-human-failure'));
  assert.deepEqual(repo.find(500).labels, ['claude-queued'], 'the request stays armed');
  assert.deepEqual(repo.find(500).comments, [], 'and is told nothing, since nothing is known');
});

test('an eligible request is handed to a session, at the model its item names', async () => {
  const item = requestItem(500, ['task:ready'], { number: 1 });
  item.body = `${TASK_PATH}\n\nRequest: #500\nModel: haiku\n`;
  const repo = fakeRepo([item, { number: 500, title: 'a thing', labels: ['claude-queued'], body: '' }]);
  const invoked = [];
  const done = await drive(repo, req({ authorPermission: 'admin' }), {
    invokeAgent: async (args) => { invoked.push(args); return { ok: true, sessionId: 's-1' }; },
  });

  assert.deepEqual(done.map((d) => d.outcome), ['agent']);
  assert.equal(invoked.length, 1, 'one call per item, ever');
  assert.equal(parseWorkItemBody(invoked[0].item.body).model, 'haiku');
  assert.ok(repo.find(1).labels.includes('task:agent'));
  // The session owns the rest: the issue keeps `claude-queued` until it swaps it for
  // `claude-in-review` at the approval park (§16.5).
  assert.deepEqual(repo.find(500).labels, ['claude-queued']);
});

test('the precondition is handed THIS occurrence\'s own facts, not just the signals', async () => {
  // The third argument (§16.4) is what lets a verdict be about one target. Nothing
  // else in this file would notice it going missing: the request task reads its
  // issue out of the signal the collector filled from that same field.
  const seen = [];
  const item = requestItem(500, ['task:ready'], { number: 1 });
  item.body = `${TASK_PATH}\n\nRequest: #500\nModel: sonnet\n`;
  const repo = fakeRepo([item, { number: 500, title: 'a thing', labels: ['claude-queued'], body: '' }]);
  const spy = {
    ...REQUEST_TASK,
    decl: { ...requestTask, precondition: (signals, config, occurrence) => { seen.push(occurrence); return { run: false, reason: 'looked' }; } },
  };
  await drive(repo, req({ authorPermission: 'admin' }), { tasks: [spy] });

  assert.deepEqual(seen, [{ taskPath: TASK_PATH, notBefore: null, blockedBy: [], request: 500, model: 'sonnet' }]);
});

test('the request task is the one task allowed to read its item\'s model', () => {
  assert.equal(REQUEST_TASK_ID, 'engine/implement-request');
  // The declaration spells its id literally (the shape check parses this file
  // statically), so the two have to be held together from outside.
  assert.equal(`engine/${requestTask.id}`, REQUEST_TASK_ID);
  assert.equal(requestTask.model_from_request, true);
  assert.equal(requestTask.expected_outcome, 'open-pr', 'it opens a PR for review and can never merge one');
  assert.equal(requestTask.code_work, undefined, 'and has no code-work phase to carry a payload');
});
