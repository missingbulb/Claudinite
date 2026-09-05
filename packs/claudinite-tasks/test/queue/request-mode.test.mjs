// The ad-hoc request mode (tasks-dispatch DESIGN §16), against the real modules.
// The simulator plays S44–S51 over a model of the design; these assert the same
// properties of the code that ships — adoption's label mechanics in `planSchedulerRun`, the
// read in the `request` collector, the verdict in the built-in task's precondition,
// and the two write-backs in the executor.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSchedulerRun } from '../../queue/scheduler-run.mjs';
import { runExecutor } from '../../queue/executor.mjs';
import { collectSignals } from '../../signals/index.mjs';
import requestTaskJson from '../../queue/tasks/implement-request/task.json' with { type: 'json' };
import { eligibility } from '../../queue/tasks/implement-request/preconditions.mjs';
import { evaluatePrecondition, loadTaskTerms } from '../../shared-code/preconditions.mjs';
import { REQUEST_TASK_ID } from '../../built-in-tasks.mjs';
import { parseWorkItemBody, machineBlockOf, ORIGIN_AD_HOC } from '../../queue/work-item.mjs';
import { join } from 'node:path';
import { LEGACY_BUILT_IN_TASK_PATH } from '../legacy-protocol.mjs';
import { normalizeTaskDeclaration } from '../../task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const requestTask = normalizeTaskDeclaration(requestTaskJson);

const SCHEDULE = { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 };
const NOW = '2026-08-19T09:17:00Z';
const TASK_PATH = LEGACY_BUILT_IN_TASK_PATH;

// The LEGACY path is what the item's machine block carries and what the executor
// matches against; `taskDir` is where the task lives NOW, and it is a real directory
// because the executor probes it before running anything (a task can be deleted out
// from under an item this run already queued).
const REQUEST_TASK_DIR = join(process.cwd(), 'packs/claudinite-tasks/queue/tasks/implement-request');
// `terms` is part of a discovered task, not an extra: the security check IS a
// task-local term, so a fixture without it is a task whose own gate is missing.
const requestTerms = await loadTaskTerms(REQUEST_TASK_DIR);
const REQUEST_TASK = {
  pack: 'engine', id: 'implement-request', taskDir: REQUEST_TASK_DIR,
  taskPath: TASK_PATH, decl: requestTask, terms: requestTerms,
};

// A MARKED ISSUE — an ordinary issue wearing the origin and no status, which is the
// whole of the exactly-once guard (§16.3). `authorHasPush` is what the shell read
// from the permission API, and it gates the body's parameters (§16.7).
const marked = (number, labels = [ORIGIN_AD_HOC], body = '', over = {}) =>
  ({ number, title: 'A thing to do', body, state: 'open', labels, author: 'dev', authorHasPush: true, ...over });

// The adopted issue: same issue, plus the machine block and a status.
const adopted = (number, status, over = {}) => ({
  number, title: 'A thing to do', state: 'open',
  labels: [ORIGIN_AD_HOC, status],
  body: `Do the thing.\n\n<!-- claudinite-item -->\n${TASK_PATH}\n\nRequest: #${number}\nModel: opus\n<!-- /claudinite-item -->\n`,
  created_at: NOW, updated_at: NOW, closed_at: null, ...over,
});

let seq = 700;
const requestItem = (request, labels, over = {}) => ({
  number: (seq += 1),
  title: `[claudinite-work] engine/implement-request #${request}`,
  body: `${TASK_PATH}\n\nRequest: #${request}\nModel: opus\n`,
  state: 'open', labels, created_at: NOW, updated_at: NOW, closed_at: null, ...over,
});

const ops = async (over = {}) => (await planSchedulerRun({
  tasks: [REQUEST_TASK], items: [], requests: [], now: NOW, schedule: SCHEDULE, ...over,
})).ops;

// --- S44: a marked issue becomes exactly one run ------------------------------

test('S44 — the marked issue BECOMES the item, and any status holds the mark', async () => {
  const adopts = (await ops({ requests: [marked(500, [ORIGIN_AD_HOC], 'Do it.\n')] })).filter((o) => o.kind === 'adopt');
  assert.equal(adopts.length, 1);
  const [adopt] = adopts;
  assert.equal(adopt.request, 500, 'the issue adoption writes to is the issue itself — nothing is filed');
  assert.equal(adopt.task, REQUEST_TASK_ID);
  assert.equal(adopt.status, 'task:status:waiting-for-executor', 'born ready — a request has no anchor to wait for');
  // The block is the machine's half of a body the person authored and keeps editing.
  assert.match(adopt.body, /^Do it\.\n/);
  assert.ok(machineBlockOf(adopt.body), 'the machine block is appended, never the whole body');
  assert.deepEqual(parseWorkItemBody(adopt.body), {
    taskPath: TASK_PATH, notBefore: null, blockedBy: [], request: 500, model: null, merge: null, endsWhen: null,
    targetBranch: null, targetPr: null, supersedes: [],
  });

  // The item is structurally ad-hoc — a `manual` task, and a title that names no
  // task — so it sits outside every scheduled family (§3).
  assert.equal(requestTask.frequency, 'manual');

  // ONE LEVER (§16.3): every status blocks re-adoption, live, parked and terminal
  // alike, and clearing it is the only re-ask. Nothing is superseded, because there
  // is no second object to supersede.
  for (const status of ['task:status:waiting-for-executor', 'task:status:running-executor', 'task:status:running-agent',
    'task:status:needs-human-approval', 'task:status:rejected', 'task:status:done']) {
    const plan = await ops({ requests: [marked(500, [ORIGIN_AD_HOC, status])] });
    assert.deepEqual(plan.filter((o) => o.kind === 'adopt'), [], `a ${status} issue is not re-adopted`);
    assert.deepEqual(plan.filter((o) => o.kind === 'supersede'), [], 'and nothing is superseded');
  }
  // Clearing the status is the re-ask, and it re-enters as the same record.
  assert.equal((await ops({ requests: [marked(500)] })).filter((o) => o.kind === 'adopt').length, 1);
});

test('the retired `claude-task` mark still adopts, and gains the origin it will be read by', async () => {
  const [adopt] = (await ops({ requests: [marked(500, ['claude-task'])] })).filter((o) => o.kind === 'adopt');
  assert.equal(adopt.request, 500);
  assert.equal(adopt.origin, ORIGIN_AD_HOC, 'origins are for life, so the issue gains today\'s spelling');
});

test('a repo whose engine has no request task adopts nothing — the marks simply wait', async () => {
  const adopts = (await planSchedulerRun({ tasks: [], items: [], requests: [marked(500)], now: NOW, schedule: SCHEDULE }))
    .ops.filter((o) => o.kind === 'adopt');
  assert.deepEqual(adopts, []);
});

// --- S47: the body's `Model:` routes the run, and the author gate fences it -----

test('S47 — the body\'s Model reaches the item, an unknown family falls back, and an ungated one is ignored', async () => {
  const [sonnet] = (await ops({ requests: [marked(500, [ORIGIN_AD_HOC], 'Do it.\n\nModel: sonnet\n')] })).filter((o) => o.kind === 'adopt');
  assert.equal(parseWorkItemBody(sonnet.body).model, 'sonnet');

  // An unrecognised family runs at the task's own default rather than parking a
  // request nobody can start.
  const [unknown] = (await ops({ requests: [marked(500, [ORIGIN_AD_HOC], 'Do it.\n\nModel: gpt-9\n')] })).filter((o) => o.kind === 'adopt');
  assert.equal(parseWorkItemBody(unknown.body).model, null);

  // THE AUTHOR GATE (§16.7). A body is editable by whoever opened the issue where a
  // label was platform-write-gated, so a drive-by author gets the defaults — and is
  // told so rather than left wondering.
  const [ungated] = (await ops({
    requests: [marked(500, [ORIGIN_AD_HOC], 'Do it.\n\nModel: sonnet\nAutomerge: yes\n', { authorHasPush: false })],
  })).filter((o) => o.kind === 'adopt');
  assert.equal(parseWorkItemBody(ungated.body).model, null);
  assert.equal(parseWorkItemBody(ungated.body).merge, null);
  assert.equal(ungated.ungated, true);

  // A permission read that could not answer gates the same way: the safe end of a
  // field that chooses a task, a model, or the right to land a change unreviewed.
  const [unread] = (await ops({
    requests: [marked(500, [ORIGIN_AD_HOC], 'Do it.\n\nModel: sonnet\n', { authorHasPush: null })],
  })).filter((o) => o.kind === 'adopt');
  assert.equal(parseWorkItemBody(unread.body).model, null);

  // Two marked issues make two runs, neither aware of the other.
  const two = (await ops({ requests: [marked(500), marked(501)] })).filter((o) => o.kind === 'adopt');
  assert.deepEqual(two.map((o) => o.request), [500, 501]);
});

// --- the `Task:` targeting field ----------------------------------------------

test('a marked issue may name WHICH task it asks for, gated like every other parameter', async () => {
  const other = { pack: 'p', id: 'chore', taskPath: 'packs/p/tasks/chore/task.md', decl: { id: 'chore', frequency: 'manual' } };
  const plan = (over) => ops({ tasks: [REQUEST_TASK, other], ...over });

  const [targeted] = (await plan({ requests: [marked(500, [ORIGIN_AD_HOC], 'Run it.\n\nTask: p/chore\n')] })).filter((o) => o.kind === 'adopt');
  assert.equal(targeted.task, 'p/chore');
  assert.equal(parseWorkItemBody(targeted.body).taskPath, 'packs/p/tasks/chore/task.md');

  // Absent, the ask is the built-in request implementer — what an ordinary
  // "implement this issue" mark means.
  const [plain] = (await plan({ requests: [marked(500)] })).filter((o) => o.kind === 'adopt');
  assert.equal(plain.task, REQUEST_TASK_ID);

  // A task this repo does not carry is not adopted at all: the mark waits, exactly
  // as it waits on an engine too old to carry the mode.
  assert.deepEqual((await plan({ requests: [marked(500, [ORIGIN_AD_HOC], 'Task: p/nope\n')] })).filter((o) => o.kind === 'adopt'), []);

  // And an ungated author cannot choose what runs.
  const [defaulted] = (await plan({
    requests: [marked(500, [ORIGIN_AD_HOC], 'Task: p/chore\n', { authorHasPush: false })],
  })).filter((o) => o.kind === 'adopt');
  assert.equal(defaulted.task, REQUEST_TASK_ID);
});

// --- one issue, one item (F28, collapsed by the one-issue model) --------------
// S51 (a re-ask waits while a run is live) and S49 (a re-ask supersedes a parked
// run) are both the status test in S44 above now: there is one object, its status
// is the guard, and clearing it is the only re-ask. What remains to pin is that the
// guard is per-issue.

test('another issue\'s run never holds this mark back', async () => {
  const other = adopted(499, 'task:status:running-agent');
  assert.equal((await ops({ requests: [marked(500)], items: [other] })).filter((o) => o.kind === 'adopt').length, 1);
});

// --- the precondition: the security check (S45, S46, S48, S50) ----------------

const req = (over = {}) => ({
  number: 500, state: 'open', queued: true, labels: ['claude-queued'],
  author: 'stranger', authorPermission: 'none', approvals: [], ...over,
});
// Through the executor's own seam, with the task's own terms loaded the way
// discovery loads them: the security check is a task-local term now, and a test
// that called it directly would not prove the declaration reaches it.
const verdict = (signalRequest) =>
  evaluatePrecondition({ decl: requestTask, terms: requestTerms }, { request: signalRequest }, {}, { request: 500 });

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
  assert.deepEqual(v.context, []);
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
  assert.equal(verdict(got).run, true);
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

// --- the one-issue model, end to end on the executor ---------------------------
// The item and the issue are one object here, which is what these three pin: the
// run finds it, converges it where the person is looking, and never closes it.

test('a marked issue is picked up as the item it is, and handed to a session at its own Model', async () => {
  const issue = adopted(500, 'task:status:waiting-for-executor', {
    body: `Implement the thing.\n\n<!-- claudinite-item -->\n${TASK_PATH}\n\nRequest: #500\nModel: haiku\n\n### Context\n\n- Implement this issue, #500.\n<!-- /claudinite-item -->\n`,
  });
  const repo = fakeRepo([issue]);
  const invoked = [];
  const done = await drive(repo, req({ authorPermission: 'admin' }), {
    invokeAgent: async (args) => { invoked.push(args); return { ok: true, sessionId: 's-1' }; },
  });

  assert.deepEqual(done.map((d) => d.outcome), ['agent']);
  assert.equal(invoked.length, 1, 'one call per item, ever');
  assert.equal(parseWorkItemBody(invoked[0].item.body).model, 'haiku');
  assert.ok(repo.find(500).labels.includes('task:status:running-agent'));
  assert.equal(repo.find(500).title, 'A thing to do', 'the person\'s issue keeps its own title');
  // The hand-off rewrites the machine block and nothing else: the item's binding
  // scope stays inside it, in one copy, and the prose above it is untouched.
  const body = repo.find(500).body;
  assert.equal(body.split('### Context').length - 1, 1, 'one Context section, replaced rather than appended');
  assert.match(machineBlockOf(body), /### Context/);
  assert.equal(body.split('<!-- claudinite-item -->')[0].trim(), 'Implement the thing.');
});

test('a declined marked issue wears the terminal status and stays OPEN — the run\'s verdict is not the issue\'s', async () => {
  const repo = fakeRepo([adopted(500, 'task:status:waiting-for-executor')]);
  const done = await drive(repo, req());

  assert.deepEqual(done.map((d) => d.outcome), ['obsolete']);
  const issue = repo.find(500);
  assert.equal(issue.state, 'open', 'the issue belongs to the person who opened it');
  assert.ok(issue.labels.includes('task:status:rejected'), 'and carries the refusal as its status');
  assert.ok(issue.labels.includes(ORIGIN_AD_HOC), 'the mark never comes off — origins are for life');
  assert.match(issue.comments.at(-1).body, /neither opened nor approved/);
  // One write-back, not two: there is no second issue to tell.
  assert.equal(issue.comments.filter((c) => /Not implementing this/.test(c.body)).length, 0);
  // The exec record still names the task, which the human title cannot supply.
  assert.match(issue.comments.map((c) => c.body).join('\n'), /engine[/ ]implement-request|implement-request/);
});

test('an unreadable request parks the marked issue open, in the failure lane', async () => {
  const repo = fakeRepo([adopted(500, 'task:status:waiting-for-executor')]);
  const done = await drive(repo, { number: 500, unreadable: true, error: 'the issues API answered 502' });

  assert.deepEqual(done.map((d) => d.outcome), ['needs-human']);
  assert.equal(repo.find(500).state, 'open', 'open and visible, so the re-queue lever can retry it');
  assert.ok(repo.find(500).labels.includes('task:status:needs-human-failure'));
});

test('S45 — a declined request is disarmed on the issue in the same convergence', async () => {
  const item = requestItem(500, ['task:status:waiting-for-executor'], { number: 1 });
  const repo = fakeRepo([item, { number: 500, title: 'a thing', labels: ['claude-queued'], body: '' }]);
  const done = await drive(repo, req());

  assert.deepEqual(done.map((d) => d.outcome), ['obsolete']);
  assert.equal(repo.find(1).state, 'closed');
  assert.ok(repo.find(1).labels.includes('task:status:rejected'));
  // The disarm is the point: without it every scheduler run from here re-adopts and re-refuses.
  assert.deepEqual(repo.find(500).labels, []);
  assert.match(repo.find(500).comments.at(-1).body, /Not implementing this/);
});

test('S50 — an unreadable request parks the item open and touches the issue not at all', async () => {
  const item = requestItem(500, ['task:status:waiting-for-executor'], { number: 1 });
  const repo = fakeRepo([item, { number: 500, title: 'a thing', labels: ['claude-queued'], body: '' }]);
  const done = await drive(repo, { number: 500, unreadable: true, error: 'the issues API answered 502' });

  assert.deepEqual(done.map((d) => d.outcome), ['needs-human']);
  assert.equal(repo.find(1).state, 'open', 'open and visible, so the re-queue lever can retry it');
  assert.ok(repo.find(1).labels.includes('task:status:needs-human-failure'));
  assert.deepEqual(repo.find(500).labels, ['claude-queued'], 'the request stays armed');
  assert.deepEqual(repo.find(500).comments, [], 'and is told nothing, since nothing is known');
});

test('an eligible request is handed to a session, at the model its item names', async () => {
  const item = requestItem(500, ['task:status:waiting-for-executor'], { number: 1 });
  item.body = `${TASK_PATH}\n\nRequest: #500\nModel: haiku\n`;
  const repo = fakeRepo([item, { number: 500, title: 'a thing', labels: ['claude-queued'], body: '' }]);
  const invoked = [];
  const done = await drive(repo, req({ authorPermission: 'admin' }), {
    invokeAgent: async (args) => { invoked.push(args); return { ok: true, sessionId: 's-1' }; },
  });

  assert.deepEqual(done.map((d) => d.outcome), ['agent']);
  assert.equal(invoked.length, 1, 'one call per item, ever');
  assert.equal(parseWorkItemBody(invoked[0].item.body).model, 'haiku');
  assert.ok(repo.find(1).labels.includes('task:status:running-agent'));
  // The session owns the rest: the issue keeps `claude-queued` until it swaps it for
  // `claude-in-review` at the approval park (§16.5).
  assert.deepEqual(repo.find(500).labels, ['claude-queued']);
});

test('the precondition is handed THIS occurrence\'s own facts, not just the signals', async () => {
  // A term is handed THIS occurrence's own facts (§16.4), which is what lets a
  // verdict be about one target. Nothing else in this file would notice it going
  // missing: the request term reads its issue out of the signal the collector
  // filled from that same field.
  const seen = [];
  const item = requestItem(500, ['task:status:waiting-for-executor'], { number: 1 });
  item.body = `${TASK_PATH}\n\nRequest: #500\nModel: sonnet\n`;
  const repo = fakeRepo([item, { number: 500, title: 'a thing', labels: ['claude-queued'], body: '' }]);
  const spy = {
    ...REQUEST_TASK,
    decl: { ...requestTask, preconditions: ['spy'] },
    terms: new Map([['spy', {
      signals: ['request'],
      holds: (signals, { item: occurrence }) => { seen.push(occurrence); return { holds: false, reason: 'looked' }; },
    }]]),
  };
  await drive(repo, req({ authorPermission: 'admin' }), { tasks: [spy] });

  assert.deepEqual(seen, [{ taskPath: TASK_PATH, notBefore: null, blockedBy: [], request: 500, model: 'sonnet', merge: null, endsWhen: null, targetBranch: null, targetPr: null, supersedes: [] }]);
});

test('the request task is the one task allowed to read its item\'s model', () => {
  assert.equal(REQUEST_TASK_ID, 'engine/implement-request');
  // The declaration spells its id literally (the shape check parses this file
  // statically), so the two have to be held together from outside.
  assert.equal(`engine/${requestTask.id}`, REQUEST_TASK_ID);
  assert.equal(requestTask.model_from_request, true);
  // The ceiling PERMITS a merge (§16.11) — what decides whether one happens is the
  // item's `Merge:` field, asserted below, and the policy engine the worker runs.
  assert.equal(requestTask.expected_outcome, 'fresh_pr');
  assert.equal(requestTask.code_work, undefined, 'and has no code-work phase to carry a payload');
});

// --- §16.11: a deferred request — blocked, chained, and its merge authorization --

test('a marked issue that names open blockers is adopted BLOCKED, and released when they close', async () => {
  const request = marked(500, [ORIGIN_AD_HOC], 'Do the rename after the current work.\n\nBlocked-by: #480, #481\n');
  const [adopt] = (await ops({ requests: [request], stateOf: (n) => (n === 481 ? 'closed' : 'open') }))
    .filter((o) => o.kind === 'adopt');

  assert.equal(adopt.status, 'task:status:blocked', 'born blocked — the follow-up waits on the work in flight');
  // The closed blocker is dropped: an item is not born waiting on something that
  // already happened.
  assert.deepEqual(parseWorkItemBody(adopt.body).blockedBy, [480]);
  assert.deepEqual(adopt.blockedBy, [480]);

  // Job 2 releases it, on any origin, once the blocker closes — the same mechanic a
  // fan-in rides, which is what makes the chain of deferrals work at all.
  const item = adopted(500, 'task:status:blocked', {
    body: `Do it.\n\n<!-- claudinite-item -->\n${TASK_PATH}\n\nBlocked-by: #480\nRequest: #500\n<!-- /claudinite-item -->\n`,
  });
  assert.deepEqual(
    (await ops({ items: [item], stateOf: () => 'open' })).filter((o) => o.kind === 'ready'), [],
    'while the blocker is open the item stays blocked',
  );
  assert.deepEqual(
    (await ops({ items: [item], stateOf: () => 'closed' })).filter((o) => o.kind === 'ready'),
    [{ kind: 'ready', issue: item.number }],
  );
});

// `Not-before:` rides the same rule as `Blocked-by:` — the field a work item
// already uses, read off the person's own text — so a deferred request can wait on
// a moment as well as an issue. The re-arm loop depends on it: a run that finds its
// world not ready re-marks its issue with a bumped date, and without the carry the
// next pick comes within the hour, forever.
test('a marked issue with a future Not-before is adopted BLOCKED until that moment', async () => {
  const [adopt] = (await ops({ requests: [marked(500, [ORIGIN_AD_HOC], 'Verify once live.\n\nNot-before: 2099-01-01T00:00:00Z\n')] }))
    .filter((o) => o.kind === 'adopt');
  assert.equal(adopt.status, 'task:status:blocked');
  assert.equal(parseWorkItemBody(adopt.body).notBefore, '2099-01-01T00:00:00Z');
});

test('a Not-before already past holds nothing back', async () => {
  const [adopt] = (await ops({ requests: [marked(500, [ORIGIN_AD_HOC], 'Late.\n\nNot-before: 2020-01-01T00:00:00Z\n')] }))
    .filter((o) => o.kind === 'adopt');
  assert.equal(adopt.status, 'task:status:waiting-for-executor');
});

test('an unreadable blocker delays the request rather than releasing it', async () => {
  const item = adopted(500, 'task:status:blocked', {
    body: `Do it.\n\n<!-- claudinite-item -->\n${TASK_PATH}\n\nBlocked-by: #480\nRequest: #500\n<!-- /claudinite-item -->\n`,
  });
  assert.deepEqual((await ops({ items: [item], stateOf: () => null })).filter((o) => o.kind === 'ready'), []);
});

test('the body\'s `Automerge:` becomes the item\'s Merge field, and only for a gated author', async () => {
  const [authorized] = (await ops({ requests: [marked(500, [ORIGIN_AD_HOC], 'Do it.\n\nAutomerge: if-narrow\n')] }))
    .filter((o) => o.kind === 'adopt');
  assert.equal(parseWorkItemBody(authorized.body).merge, 'if-narrow');
  assert.equal(authorized.merge, 'if-narrow');

  // Re-read at every adoption, so an authorization can never linger into a later
  // ask: it is in the person's own text, and clearing the status re-reads it.
  const [withdrawn] = (await ops({ requests: [marked(500, [ORIGIN_AD_HOC], 'Do it.\n')] })).filter((o) => o.kind === 'adopt');
  assert.equal(parseWorkItemBody(withdrawn.body).merge, null);

  // …and the ordinary marked issue is untouched by any of this: no field, and the
  // worker's default is to open a pull request and park.
  assert.equal(withdrawn.merge, null);
});

test('the Merge field is fenced by policy shape', () => {
  const at = (value) => parseWorkItemBody(`${TASK_PATH}\n\nRequest: #500\nMerge: ${value}\n`).merge;
  // A value that does not read as a policy expression reads as absent.
  assert.equal(at('what?!'), null);
  assert.equal(at('nothing'), null, 'never-merge is the default already');
  assert.equal(at('reject:js-code-changes'), null, 'a rejects-only list allows nothing');
  // A policy expression rides through as itself; the legacy aliases canonicalize.
  assert.equal(at('anything'), 'anything');
  assert.equal(at('doc-changes;reject:js-code-changes'), 'doc-changes;reject:js-code-changes');
  assert.equal(at('if-narrow'), 'if-narrow');
  // A well-formed policy naming a rule nobody defines rides through too — it
  // fails closed at the verdict, loudly, instead of being silently ignored.
  assert.equal(at('no-such-rule'), 'no-such-rule');
});

test('the Merge fence canonicalizes an && term, so the body it writes is whitespace-free', () => {
  const at = (value) => parseWorkItemBody(`${TASK_PATH}\n\nRequest: #500\nMerge: ${value}\n`).merge;
  assert.equal(at('under:product-wiki&&doc-changes'), 'under:product-wiki&&doc-changes');
  assert.equal(at('reject:under:docs/private'), null, 'a rejects-only list still allows nothing');
});

// The drift guard for work-item's inline policy fence: that module is
// deliberately pure and cannot import the policy engine, so this runs the value
// matrix through both sides — everything the fence keeps must be a policy the
// engine evaluates ('anything' or a rule list), everything it drops must be one
// the engine refuses ('nothing' or invalid).
test('the Merge fence and normalizePolicy agree on what is a policy expression', async () => {
  const { normalizePolicy } = await import('../../merge-policy.mjs');
  const at = (value) => parseWorkItemBody(`${TASK_PATH}\n\nRequest: #500\nMerge: ${value}\n`).merge;
  const matrix = ['anything', 'nothing', 'if-narrow', 'yes', 'true', 'narrow-diff',
    'doc-changes;readme-changes', 'anything;reject:js-code-changes', 'reject:js-code-changes',
    'no-such-rule', 'Bad_Term', 'a;;b',
    'under:product-wiki', 'under:.claudinite/local/packs && doc-changes',
    'under:product-wiki&&doc-changes;reject:javascript-changes',
    'under:', 'under:../elsewhere', 'narrow-diff && doc-changes', 'doc-changes &&'];
  for (const value of matrix) {
    const kept = at(value);
    const kind = normalizePolicy(kept ?? value).kind;
    if (kept !== null) {
      assert.ok(kind === 'anything' || kind === 'rules', `fence kept "${value}" but the engine calls it ${kind}`);
    } else {
      assert.ok(kind === 'nothing' || kind === 'invalid', `fence dropped "${value}" but the engine calls it ${kind}`);
    }
  }
});
