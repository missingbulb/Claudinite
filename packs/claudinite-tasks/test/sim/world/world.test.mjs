// The fake world, driven — the six modules composing into one runnable world.
//
// Every case here is about a behaviour the fake OWNS, never about a value it
// was handed: the orderings the clock guarantees, the GitHub limitations the
// mechanism is designed around, and the shape of a session's life. A scenario
// suite that trusts the harness needs those proven somewhere, and this is the
// only file whose subject they are.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENDPOINTS_KEY } from '../../../../../engine/checks/helpers/repo-context.mjs';
import { makeClock, MINUTE } from './clock.mjs';
import { makeGithub } from './github.mjs';
import { makeActions } from './actions.mjs';
import { makeSessions } from './sessions.mjs';
import { makeAgents } from './agents.mjs';
import { makeHumans } from './humans.mjs';

const REPO = 'o/r';
const START = '2026-08-12T00:00:00Z';

const world = (opts = {}) => {
  const clock = makeClock({ start: START });
  const github = makeGithub({ clock, repo: REPO, ...opts });
  const agents = makeAgents({ clock, github, repo: REPO });
  const sessions = makeSessions({ clock, agents, repo: REPO });
  const actions = makeActions({ clock, github, repo: REPO });
  const humans = makeHumans({ clock, github, repo: REPO });
  return { clock, github, agents, sessions, actions, humans };
};

// --- the clock ----------------------------------------------------------

test('events fire strictly by instant, and in booking order within one instant', async () => {
  const { clock } = world();
  const seen = [];
  clock.at('2026-08-12T02:00:00Z', () => seen.push('later'));
  clock.at('2026-08-12T01:00:00Z', () => seen.push('first-booked-at-01'));
  clock.at('2026-08-12T01:00:00Z', () => seen.push('second-booked-at-01'));
  await clock.runUntil('2026-08-12T03:00:00Z');
  assert.deepEqual(seen, ['first-booked-at-01', 'second-booked-at-01', 'later']);
});

// A scenario runs in phases to assert a mid-state. An event beyond the segment
// must SURVIVE it — a queue drained at each boundary would lose the second half
// of every scenario written that way.
test('an event beyond the segment survives for the next one', async () => {
  const { clock } = world();
  const seen = [];
  clock.at('2026-08-12T05:00:00Z', () => seen.push('late'));
  await clock.runUntil('2026-08-12T03:00:00Z');
  assert.deepEqual(seen, []);
  assert.equal(clock.iso(), '2026-08-12T03:00:00.000Z', 'the clock parks at the boundary');
  await clock.runUntil('2026-08-12T06:00:00Z');
  assert.deepEqual(seen, ['late']);
});

// The harness drives async code throughout, so a segment that returned before
// an event's promise settled would let the next instant run inside the last —
// virtual time going backwards exactly where an ordering is being asserted.
test('an async event is awaited before the next instant runs', async () => {
  const { clock } = world();
  const seen = [];
  clock.at('2026-08-12T01:00:00Z', async () => {
    await Promise.resolve();
    seen.push('slow');
  });
  clock.at('2026-08-12T02:00:00Z', () => seen.push('after'));
  await clock.runUntil('2026-08-12T03:00:00Z');
  assert.deepEqual(seen, ['slow', 'after']);
});

// --- the GitHub limitations the mechanism is built around ----------------

// The pair claim arbitration depends on: ids order totally, timestamps do not.
test('comment ids strictly increase while timestamps tie at one second', async () => {
  const { clock, github } = world({ issues: [{ number: 1, title: 't', labels: [] }] });
  await github.port.comment(null, REPO, 1, 'first');
  clock.at(clock.ms() + 400, () => {});
  await clock.runUntil(clock.ms() + 401);
  await github.port.comment(null, REPO, 1, 'second');
  const [a, b] = github.find(1).comments;
  assert.ok(b.id > a.id, `${b.id} must be above ${a.id}`);
  assert.equal(a.created_at, b.created_at, 'under a second apart, the two tie on time');
});

// A swap is remove-then-add and NOT atomic. What a torn one can leave is an item
// wearing neither label — never two owners, never a lost remove.
test('a torn label swap leaves the item wearing neither label', async () => {
  const { github } = world({ issues: [{ number: 1, title: 't', labels: ['task:status:waiting-for-executor'] }] });
  github.tearNextLabelSwap();
  const res = await github.port.swapLabel(null, REPO, 1, 'task:status:waiting-for-executor', 'task:status:running-executor');
  assert.notEqual(res.status, 200);
  assert.deepEqual(github.find(1).labels, []);
  // One tear, not a permanent one: the next swap is ordinary.
  await github.port.swapLabel(null, REPO, 1, 'nothing', 'task:status:running-executor');
  assert.deepEqual(github.find(1).labels, ['task:status:running-executor']);
});

test('a rate limit answers 403 for the calls it was given and then lets go', async () => {
  const { github } = world({ issues: [{ number: 1, title: 't', labels: [] }] });
  github.rateLimit(2);
  assert.equal((await github.port.getIssue(null, REPO, 1)).status, 403);
  assert.equal((await github.port.getIssue(null, REPO, 1)).status, 403);
  assert.equal((await github.port.getIssue(null, REPO, 1)).status, 200);
});

// The stale list: a write landed, and a listing taken a moment later cannot see
// it yet. Reading it by number still answers — which is the whole reason a
// duplicate can be created off one list read and found by the next.
test('an issue hidden from listings is still readable by number', async () => {
  const { github } = world({ issues: [{ number: 1, title: 't', labels: [] }] });
  github.hideFromLists(1);
  assert.deepEqual((await github.port.listOpenIssuesPage(null, REPO, 1)).json, []);
  assert.equal((await github.port.getIssue(null, REPO, 1)).status, 200);
  github.revealInLists(1);
  assert.equal((await github.port.listOpenIssuesPage(null, REPO, 1)).json.length, 1);
});

// Applying a name the repo does not define is a 422, which is why `ensureLabels`
// runs first. It is a fault rather than the default so that a fixture about
// something else does not have to declare a vocabulary to say anything.
test('with the fault on, an undefined label 422s until ensureLabels defines it', async () => {
  const { github } = world({ issues: [{ number: 1, title: 't', labels: [] }] });
  github.unknownLabels422();
  assert.equal((await github.port.addLabel(null, REPO, 1, 'task:urgent')).status, 422);
  await github.port.ensureLabels(null, REPO, [{ name: 'task:urgent', color: 'ededed', description: 'd' }]);
  assert.equal((await github.port.addLabel(null, REPO, 1, 'task:urgent')).status, 200);
  assert.deepEqual(github.find(1).labels, ['task:urgent']);
});

// The transport and the named operations are two surfaces over one store, so a
// write through either is visible through the other.
test('a write through the transport is visible through the port, and both are charged', async () => {
  const { github } = world({ issues: [{ number: 1, title: 't', labels: [] }] });
  const gh = github.port.makeGh();
  await gh(`/repos/${REPO}/issues/1/labels`, { method: 'POST', body: { labels: ['task:urgent'] } });
  assert.deepEqual((await github.port.readIssue(null, REPO, 1)).labels, ['task:urgent']);
  assert.equal(github.calls().length, 2, 'both surfaces record the call they spent');
});

// --- people -------------------------------------------------------------

test('a person marks an issue, and the mark is what the queue would adopt', async () => {
  const { github, humans } = world();
  const issue = humans.markIssue({ title: 'Do the thing', body: 'please' });
  assert.deepEqual(github.find(issue.number).labels, ['task:origin:ad-hoc']);
  assert.equal(github.find(issue.number).body, 'please');
});

// The sanctioned re-queue: the park comes off, ready goes on, and nothing else
// is touched — no comment, no marker, which is what makes it different from the
// wake lever.
test('a re-queue swaps the park for ready and writes nothing else', async () => {
  const { github, humans } = world({
    issues: [{ number: 1, title: 't', labels: ['task:status:needs-human-failure', 'task:origin:planned'] }],
  });
  await humans.requeue(1);
  assert.deepEqual(github.find(1).labels, ['task:origin:planned', 'task:status:waiting-for-executor']);
  assert.deepEqual(github.find(1).comments, []);
});

test('a person\'s action booked at an instant happens then, not now', async () => {
  const { clock, github, humans } = world({ issues: [{ number: 1, title: 't', labels: [] }] });
  humans.comment(1, 'thinking about it', { at: '2026-08-12T04:00:00Z' });
  await clock.runUntil('2026-08-12T03:00:00Z');
  assert.deepEqual(github.find(1).comments, []);
  await clock.runUntil('2026-08-12T05:00:00Z');
  assert.equal(github.find(1).comments.at(-1).body, 'thinking about it');
});

// A dropped `labeled` webhook is not a lost write: the label IS on the issue,
// and what never happened is the run the event would have started.
test('a dropped labeled event leaves the label on and the run unstarted', async () => {
  const { github, humans } = world({ issues: [{ number: 1, title: 't', labels: [] }] });
  github.dropNextLabeledEvent();
  await humans.addLabel(1, 'task:status:waiting-for-executor');
  assert.deepEqual(github.find(1).labels, ['task:status:waiting-for-executor']);
  assert.equal(humans.deliversLabeledEvent(), false, 'the run the edit would have started never fires');
  assert.equal(humans.deliversLabeledEvent(), true, 'and only that one is dropped');
});

// --- Actions ------------------------------------------------------------

test('the cron grid books one run an hour, and the ledger bills each one', async () => {
  const { clock, actions } = world();
  actions.cron('2026-08-12T00:00:00Z', '2026-08-12T04:00:00Z', () => {}, { durationMs: 30_000 });
  await clock.runUntil('2026-08-12T06:00:00Z');
  assert.equal(actions.runs().length, 4);
  // Half a minute of work still costs a minute: Actions rounds each job UP,
  // which is why a quiet repo's hourly cron is not free.
  assert.equal(actions.billedMinutes(), 4);
});

test('fires dropped in a window simply never happen', async () => {
  const { clock, actions } = world();
  actions.dropFires('2026-08-12T01:00:00Z', '2026-08-12T03:00:00Z');
  actions.cron('2026-08-12T00:00:00Z', '2026-08-12T04:00:00Z', () => {});
  await clock.runUntil('2026-08-12T06:00:00Z');
  assert.deepEqual(actions.runs().map((r) => r.trigger), ['schedule', 'schedule']);
});

// The scheduler's concurrency group, with `cancel-in-progress: false`: one run in
// progress and at most ONE queued behind it. The queued one WAITS and then runs —
// which is what serializes scheduler runs instead of dropping them — and only a
// third, arriving while one already waits, is superseded.
test('a second run of the concurrency group waits and then runs; a third is superseded', async () => {
  const { clock, actions } = world();
  const started = [];
  const body = ({ run }) => { started.push(run.startedAt); };
  actions.startRun({ workflow: 'w.yml', trigger: 'schedule', body, durationMs: 10 * MINUTE, concurrency: 'g' });
  actions.startRun({ workflow: 'w.yml', trigger: 'schedule', body, durationMs: 10 * MINUTE, concurrency: 'g' });
  actions.startRun({ workflow: 'w.yml', trigger: 'schedule', body, durationMs: 10 * MINUTE, concurrency: 'g' });
  await clock.runUntil('2026-08-12T01:00:00Z');
  assert.equal(started.length, 2, 'two of the three executed');
  assert.ok(started[1] > started[0], 'the second waited for the first to finish');
  assert.deepEqual(actions.runs().map((r) => r.conclusion).sort(), ['success', 'success', 'superseded']);
});

// A run whose body takes virtual time is the JOB: `measure` makes the ledger bill
// what it actually took, and every caller awaits `done`, so the clock can never
// advance through the middle of one.
test('a measured run ends when its body does, and the ledger bills that span', async () => {
  const { clock, actions } = world();
  const run = actions.startRun({
    workflow: 'w.yml', trigger: 'workflow_dispatch', measure: true,
    body: async () => { await clock.sleep(7 * MINUTE); },
  });
  await clock.runUntil('2026-08-12T01:00:00Z');
  assert.equal(run.endedAt - run.startedAt, 7 * MINUTE);
  assert.equal(run.conclusion, 'success');
  assert.equal(actions.billedMinutes(), 7);
});

// The pump's contract, and the reason it is a pump: an event that waits for a
// LATER event must not deadlock the queue.
test('an event that sleeps for virtual time resumes in the same total order', async () => {
  const { clock } = world();
  const seen = [];
  clock.at('2026-08-12T01:00:00Z', async () => {
    seen.push('start');
    await clock.sleep(2 * 60 * MINUTE);
    seen.push('resumed');
  });
  clock.at('2026-08-12T02:00:00Z', () => seen.push('between'));
  await clock.runUntil('2026-08-12T05:00:00Z');
  assert.deepEqual(seen, ['start', 'between', 'resumed']);
  assert.equal(clock.iso(), '2026-08-12T05:00:00.000Z');
});

// A run that throws is a job that FAILED — which is what the workflow's
// continuation job keys on — and the clock still settles rather than hanging on
// an abandoned promise.
test('a body that throws ends its run as a failure and does not wedge the clock', async () => {
  const { clock, actions } = world();
  const run = actions.startRun({
    workflow: 'w.yml', trigger: 'workflow_dispatch', measure: true,
    body: async () => { await clock.sleep(MINUTE); throw new Error('the runner died'); },
  });
  await clock.runUntil('2026-08-12T01:00:00Z');
  assert.equal(run.conclusion, 'failure');
  assert.match(run.error.message, /the runner died/);
});

// The accounting the whole cost question turns on: the ledger counts the
// engine's REAL dispatch calls, not a model's idea of when a chain fires.
test('a workflow_dispatch the engine fired becomes a billed run', async () => {
  const { clock, github, actions } = world();
  actions.runDispatches(() => {}, { durationMs: MINUTE });
  const res = await github.port.dispatchWorkflow(null, REPO, 'claudinite-executor.yml', 'main', { item: '7' });
  assert.deepEqual(res, { ok: true, status: 204 });
  await clock.runUntil('2026-08-12T01:00:00Z');
  assert.deepEqual(actions.runsOf('claudinite-executor.yml').map((r) => r.trigger), ['workflow_dispatch']);
  assert.equal(actions.billedMinutes(), 1);
});

test('a job that outlives its timeout is cancelled at the ceiling, not at its own end', async () => {
  const { clock, actions } = world();
  actions.startRun({ workflow: 'w.yml', trigger: 'schedule', durationMs: 60 * MINUTE, timeoutMs: 10 * MINUTE });
  await clock.runUntil('2026-08-12T02:00:00Z');
  const [run] = actions.runs();
  assert.equal(run.conclusion, 'cancelled');
  assert.equal(run.endedAt - run.startedAt, 10 * MINUTE);
});

// `setStepOutput` writes to the run it is inside and nowhere outside one —
// exactly as there is no `GITHUB_OUTPUT` outside Actions.
test('a step output lands on its own run, and outside a run there is nowhere to write', async () => {
  const { actions } = world();
  assert.equal(actions.port.setStepOutput('drain', 'yes'), false);
  const run = actions.startRun({ workflow: 'w.yml', trigger: 'schedule', body: () => actions.port.setStepOutput('drain', 'yes') });
  assert.deepEqual(run.outputs, { drain: 'yes' });
});

// --- the hand-off, and the session it starts ----------------------------

const CONFIG = {
  taskScheduler: {
    [ENDPOINTS_KEY]: { default: { url: 'https://example.invalid/fire', tokenSecret: 'TOK' } },
  },
};
const TASK = { pack: 'p', id: 'a', decl: {} };
const ITEM = { number: 1 };

test('a fired invocation starts a session that does its script at its own pace', async () => {
  const { clock, github, agents, sessions } = world({ issues: [{ number: 1, title: 't', labels: [] }] });
  agents.script('a', {
    minutes: 40,
    heartbeatMinutes: 15,
    run: async ({ print }) => {
      await github.port.comment(null, REPO, 1, 'PR: #7 (open)');
      print('claudinite-task-exec v1 p/a [#1] success');
    },
  });
  const invoke = sessions.port.agentInvoker({ repo: REPO, config: CONFIG });
  const res = await invoke({ task: TASK, item: ITEM, nonce: '1-abc' });
  assert.equal(res.ok, true);

  await clock.runUntil('2026-08-12T00:35:00Z');
  assert.equal(agents.sessions()[0].beats, 2, 'it beats while it works');
  assert.equal(agents.records().length, 0, 'and has not finished');

  await clock.runUntil('2026-08-12T01:00:00Z');
  assert.match(agents.records().at(-1).line, /claudinite-task-exec v1 p\/a \[#1\] success/);
  assert.ok(github.find(1).comments.some((c) => c.body.includes('#7')));
});

// A dead session is SILENCE — the body never runs and nothing is written. That
// absence is the only input the agent leash has, and a fake that reported the
// death would be handing the engine a signal production does not have.
test('a session that dies writes nothing at all', async () => {
  const { clock, github, agents, sessions } = world({ issues: [{ number: 1, title: 't', labels: [] }] });
  agents.script('a', { minutes: 20, dies: true, run: async () => github.port.comment(null, REPO, 1, 'never') });
  await sessions.port.agentInvoker({ repo: REPO, config: CONFIG })({ task: TASK, item: ITEM, nonce: '1-abc' });
  await clock.runUntil('2026-08-12T02:00:00Z');
  assert.equal(agents.sessions()[0].dead, true);
  assert.deepEqual(github.find(1).comments, []);
});

test('a refused invocation starts no session, and says so definitively', async () => {
  const { clock, agents, sessions } = world();
  sessions.refuseNext('endpoint "default" returned 401');
  const res = await sessions.port.agentInvoker({ repo: REPO, config: CONFIG })({ task: TASK, item: ITEM, nonce: '1-abc' });
  assert.deepEqual(res, { ok: false, answered: true, error: 'endpoint "default" returned 401' });
  await clock.runUntil('2026-08-12T02:00:00Z');
  assert.deepEqual(agents.sessions(), []);
});

// The case the whole design turns on: the answer never arrived, and the far side
// may have taken it anyway. The invoker's report is identical either way — which
// is precisely why the executor may not guess.
test('an unanswered invocation reports the same whether or not a session started', async () => {
  const reports = [];
  for (const started of [false, true]) {
    const { clock, agents, sessions } = world();
    sessions.leaveNextUnanswered({ started });
    reports.push(await sessions.port.agentInvoker({ repo: REPO, config: CONFIG })({ task: TASK, item: ITEM, nonce: '1-abc' }));
    await clock.runUntil('2026-08-12T02:00:00Z');
    assert.equal(agents.sessions().length, started ? 1 : 0, 'the fake knows; the caller does not');
  }
  assert.deepEqual(reports[0], reports[1]);
  assert.equal(reports[0].answered, false);
});
