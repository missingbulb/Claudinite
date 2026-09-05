// The terminal transition performed in code (#892). What this pins is the part a
// session used to do from prose: five ordered side effects, in order, exactly
// once, on the item held and nothing else (§15.19, reversed by §15.31 / #1373)
// — and the two ways it went wrong on live traffic (an item closed still wearing
// `task:agent`, an item closed with no execution record at all) failing loudly
// here instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OUTCOMES, convergeOps, parseArgs, refusal, recordLine, convergeComment, sessionScript,
} from '../../queue/converge-item.mjs';
import { parseWorkItemBody, humanTextOf } from '../../queue/work-item.mjs';
import { isReleasable } from '../../queue/readiness.mjs';
import { LEGACY_BUILT_IN_TASK_PATH } from '../legacy-protocol.mjs';

const item = (over = {}) => ({
  number: 7, title: '[claudinite-work] p/a', state: 'open', labels: ['task:agent'],
  body: 'packs/p/tasks/a/task.md\n', ...over,
});

// A fake repo driven through the same REST paths the shell calls.
function fakeRepo(issues) {
  const state = { issues, comments: [], calls: [], closedPulls: [] };
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

// APPLYING THE PLAN, THE WAY THE SESSION DOES. `convergeOps` is the only account of
// what a convergence is (the REST executor that used to live beside it went with
// #1491, since nothing but a session ever runs this file). These tests still assert
// the five side effects and their order, so the applier walks the same ops against
// the same fake repo — what changed is that the transition is now DECIDED here and
// PERFORMED by whoever holds the credentials, never by this module.
function run(repo, plan, over = {}) {
  const log = over.log ?? (() => {});
  const item = repo.find(plan.issue);
  const no = refusal(item, plan.issue);
  if (no) return { ok: false, error: no };
  let closed = false;
  for (const op of convergeOps(item, plan)) {
    const target = op.issue === undefined ? null : repo.find(op.issue);
    if (op.kind === 'comment') repo.state.comments.push({ issue: op.issue, body: op.body });
    else if (op.kind === 'record') log(op.line);
    else if (op.kind === 'removeLabel') target.labels = target.labels.filter((l) => l !== op.name);
    else if (op.kind === 'addLabel') target.labels.push(op.name);
    else if (op.kind === 'setBody') target.body = op.body;
    else if (op.kind === 'close') { target.state = 'closed'; target.state_reason = op.stateReason; closed = true; }
    else if (op.kind === 'closePull') repo.state.closedPulls.push({ number: op.number, successor: op.successor });
  }
  const { request } = parseWorkItemBody(item.body ?? '');
  return { ok: true, closed, request: request ?? null };
}

// --- the argument surface ------------------------------------------------------

test('the command refuses a plan it cannot perform rather than guessing', () => {
  assert.match(parseArgs(['--outcome', 'done', '--summary', 'x']).error, /--issue/);
  assert.match(parseArgs(['--issue', '7', '--summary', 'x']).error, /--outcome/);
  assert.match(parseArgs(['--issue', '7', '--outcome', 'nope', '--summary', 'x']).error, /--outcome/);
  assert.match(parseArgs(['--issue', '7', '--outcome', 'done', '--summary', '   ']).error, /--summary/);
  // An approval park nobody can act on is not a park.
  assert.match(parseArgs(['--issue', '7', '--outcome', 'approval', '--summary', 'x']).error, /--pr/);
  assert.deepEqual(parseArgs(['--issue', '7', '--outcome', 'done', '--summary', 'did it']),
    { issue: 7, outcome: 'done', summary: 'did it', pr: null, repo: null, itemFile: null });
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
    body: `do it\n\n<!-- claudinite-item -->\n${LEGACY_BUILT_IN_TASK_PATH}\n\nRequest: #7\n<!-- /claudinite-item -->\n`,
  }), 7), null);
  assert.match(refusal(item({ state: 'closed' }), 7), /already closed/);
  assert.match(refusal(item({ labels: ['task:executing'] }), 7), /task:status:running-agent/);
  assert.equal(refusal(item(), 7), null);
});

// AN ITEM ADOPTED BEFORE THE MACHINE BLOCK EXISTED has neither signal the structural
// test looks for: adoption gained the delimiters while items were already in flight,
// so its fields sit bare in a body whose title is the person's own. The origin label
// is the independent second signal — platform-write-gated exactly like the block, and
// carried for life — and either one is sufficient (missingbulb/Shepherd#360, where the
// refusal sent a session to converge by hand and the close was the step it dropped).
test('a marked issue whose body predates the machine block is converged, by its mark', () => {
  assert.equal(refusal(item({
    title: 'Report the run\'s environment variables on this issue',
    body: `${LEGACY_BUILT_IN_TASK_PATH}\n\nRequest: #7\n`,
    labels: ['task:origin:ad-hoc', 'task:agent'],
  }), 7), null);
});

test('a refusal writes nothing at all', async () => {
  const repo = fakeRepo([item({ labels: ['task:executing'] })]);
  const res = run(repo, { issue: 7, outcome: 'done', summary: 'did it' });
  assert.equal(res.ok, false);
  assert.deepEqual(repo.state.comments, []);
  assert.deepEqual(repo.find(7).labels, ['task:executing']);
  assert.equal(repo.find(7).state, 'open');
});

// --- the close: all five side effects, and the record ---------------------------

test('a done outcome closes the item with the label swapped and the record on it', async () => {
  const repo = fakeRepo([item()]);
  const res = run(repo, { issue: 7, outcome: 'done', summary: 'ran the thing' });
  assert.equal(res.ok, true);
  const issue = repo.find(7);
  assert.equal(issue.state, 'closed');
  assert.equal(issue.state_reason, 'completed');
  assert.ok(issue.labels.includes('task:status:done'));
  // The failure that reached live traffic: a closed item still reading as live.
  assert.equal(issue.labels.includes('task:status:running-agent'), false, 'a closed item must not wear a live status');
  // …and the other one: closed with no record at all.
  assert.match(repo.state.comments[0].body, /ran the thing/);
  assert.match(repo.state.comments[0].body, /claudinite-task-exec v1 p\/a \[#7\] success/);
});

test('the record is printed as well as commented — the census reads the transcript', async () => {
  const repo = fakeRepo([item()]);
  const printed = [];
  run(repo, { issue: 7, outcome: 'done', summary: 'x' }, { log: (l) => printed.push(l) });
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

test('a park leaves the item open wearing the one park label', async () => {
  const repo = fakeRepo([item()]);
  run(repo, { issue: 7, outcome: 'failure', summary: 'it broke' });
  const issue = repo.find(7);
  assert.equal(issue.state, 'open');
  // ONE label since the write-side flip: the park IS the status (#1119).
  assert.deepEqual(issue.labels.sort(), ['task:status:needs-human-failure']);
});

// --- superseding (DESIGN §6.4b) --------------------------------------------------

// A `supersede_existing_pr` task's earlier pull requests close once THIS run's own
// exists — never before, so a run that delivers nothing leaves a review member's
// pending pull request where it was. The executor decided the set at resolution
// and stamped it on the item; the session performs the closes it is handed.
const superseding = () => item({ body: 'packs/p/tasks/a/task.md\n\nTarget-branch: claudinite/p/a/2026-09-04-ab12\nSupersedes: #3, #4\n' });

test('a run that left its own pull request closes the ones the executor said it supersedes', async () => {
  for (const outcome of ['done', 'approval']) {
    const repo = fakeRepo([superseding()]);
    run(repo, { issue: 7, outcome, summary: 'delivered', pr: 9 });
    assert.deepEqual(repo.state.closedPulls, [{ number: 3, successor: 9 }, { number: 4, successor: 9 }], outcome);
  }
});

test('a run that delivered no pull request, or broke, supersedes nothing', async () => {
  const done = fakeRepo([superseding()]);
  run(done, { issue: 7, outcome: 'done', summary: 'nothing to change' });
  assert.deepEqual(done.state.closedPulls, []);
  const failed = fakeRepo([superseding()]);
  run(failed, { issue: 7, outcome: 'failure', summary: 'broke', pr: 9 });
  assert.deepEqual(failed.state.closedPulls, []);
});

test('the session script spells each supersede as a comment and a state write on that pull request', () => {
  const script = sessionScript(superseding(), { issue: 7, outcome: 'approval', summary: 'delivered', pr: 9 }, 'o/r');
  assert.match(script, /pullNumber `3`[\s\S]*state `closed`/);
  assert.match(script, /pullNumber `4`[\s\S]*state `closed`/);
  assert.match(script, /superseded by #9/i);
});

// --- the park's end condition (#1468) ------------------------------------------

// The converge comment already tells a person to merge or close the pull request.
// This is the same sentence where the janitor can read it, so the park ends when
// that happens instead of waiting for someone to notice it already did.
test('a park that names a pull request stamps its end condition on the item', async () => {
  const repo = fakeRepo([item()]);
  run(repo, { issue: 7, outcome: 'approval', summary: 'opened it', pr: 9 });
  assert.equal(parseWorkItemBody(repo.find(7).body).endsWhen, 9);
  assert.equal(repo.find(7).body.split('\n')[0], 'packs/p/tasks/a/task.md');
});

// Generic, not approval-only: an action park waiting on a setup issue ends the
// same way, and one rule reads the field whatever kind wrote it.
test('any park may name what would end it, and one that names nothing stamps nothing', async () => {
  const repo = fakeRepo([item()]);
  run(repo, { issue: 7, outcome: 'action', summary: 'need the token', pr: 55 });
  assert.equal(parseWorkItemBody(repo.find(7).body).endsWhen, 55);

  const bare = fakeRepo([item()]);
  run(bare, { issue: 7, outcome: 'failure', summary: 'it broke' });
  assert.equal(parseWorkItemBody(bare.find(7).body).endsWhen, null);
});

// A marked issue's prose is the person's; the field belongs in the machine block.
test('the end condition lands in a marked issue\'s machine block, not its prose', async () => {
  const marked = item({
    title: 'Please do the thing',
    body: 'please do the thing\n\n<!-- claudinite-item -->\npacks/p/tasks/a/task.md\n<!-- /claudinite-item -->\n',
  });
  const repo = fakeRepo([marked]);
  run(repo, { issue: 7, outcome: 'approval', summary: 'opened it', pr: 9 });
  const body = repo.find(7).body;
  assert.equal(parseWorkItemBody(body).endsWhen, 9);
  assert.equal(humanTextOf(body), 'please do the thing', 'the person\'s prose is untouched');
});

// The session executor has no granular write: its body edit must ride the one
// `issue_write` the park's labels already need, not a second call it never makes.
test('the session script carries the end condition in its own label write', () => {
  const script = sessionScript(item(), { issue: 7, outcome: 'approval', summary: 'opened it', pr: 9 }, 'o/r');
  assert.equal((script.match(/`issue_write`/g) ?? []).length, 1);
  assert.match(script, /Ends-when: #9 closed/);
  assert.match(script, /labels `\["task:status:needs-human-approval"\]`/);
});

// --- the request write-back ----------------------------------------------------

test('an approval park hands its request issue to the reviewer', async () => {
  const repo = fakeRepo([
    item({ body: 'packs/p/tasks/a/task.md\n\nRequest: #42\n' }),
    { number: 42, title: 'do a thing', state: 'open', labels: ['claude-queued'] },
  ]);
  run(repo, { issue: 7, outcome: 'approval', summary: 'opened it', pr: 9 });
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
  run(repo, { issue: 7, outcome: 'failure', summary: 'it broke' });
  assert.deepEqual(repo.find(42).labels, ['claude-queued']);
  assert.equal(repo.state.comments.some((c) => c.issue === 42), false);
});

// --- a converge writes only to the item it holds (§15.19, reversed by §15.31 / #1373) ---

const blocked = (number, blockedBy, over = {}) => ({
  number, title: `[claudinite-work] p/b${number}`, state: 'open', labels: ['task:blocked'],
  body: `packs/p/tasks/b/task.md\n\nBlocked-by: ${blockedBy.map((n) => `#${n}`).join(', ')}\n`, ...over,
});

test('closing an item it was the last blocker of leaves the dependent untouched', async () => {
  const repo = fakeRepo([item(), blocked(8, [7])]);
  const res = run(repo, { issue: 7, outcome: 'done', summary: 'x' });
  assert.equal('freed' in res, false, 'a converge has no notion of what it freed any more');
  assert.deepEqual(repo.find(8).labels, ['task:blocked'], 'release is the scheduler run\'s job alone');
});

// A park writes even less: the item stays open, so nothing waiting on it was
// ever a candidate for release.
test('a park also leaves a dependent untouched', async () => {
  const repo = fakeRepo([item(), blocked(8, [7])]);
  run(repo, { issue: 7, outcome: 'failure', summary: 'x' });
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
});
