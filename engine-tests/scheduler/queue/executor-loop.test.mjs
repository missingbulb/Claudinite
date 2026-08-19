// The executor loop end to end against a fake GitHub — pick, claim, evaluate,
// code-work, hand off, converge. The pure rules are tested beside this; what this
// pins is that the SHELL actually drives them to a terminal state, which is the
// thing a fixture over the rules alone can never say.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runExecutor } from '../../../engine/scheduler/queue/executor.mjs';
import { parseWorkItemBody } from '../../../engine/scheduler/queue/work-item.mjs';

const SCHEDULE = { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 };
const CONFIG = { taskScheduler: SCHEDULE, packConfig: {} };

// A fake repo: issues with labels, bodies, comments and state, driven through the
// same REST paths the shell calls.
function fakeRepo(issues = []) {
  const state = { issues: issues.map((i) => ({ comments: [], state: 'open', ...i })), commentSeq: 100, calls: [] };
  const find = (n) => state.issues.find((i) => i.number === n);
  const gh = async (path, { method = 'GET', body } = {}) => {
    state.calls.push(`${method} ${path}`);
    let m;
    if (method === 'GET' && /^\/repos\/[^/]+\/[^/]+\/issues\?/.test(path)) {
      const page = Number(/[?&]page=(\d+)/.exec(path)?.[1] ?? 1); // NOT /page=/ — that matches per_page
      return { status: 200, json: page === 1 ? state.issues.filter((i) => i.state === 'open') : [] };
    }
    if ((m = /^\/repos\/[^/]+\/[^/]+\/issues\/comments\/(\d+)$/.exec(path))) {
      const id = Number(m[1]);
      for (const issue of state.issues) {
        const c = issue.comments.find((x) => x.id === id);
        if (c) { if (method === 'PATCH') c.body = body.body; return { status: 200, json: c }; }
      }
      return { status: 404, json: null };
    }
    if ((m = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments/.exec(path))) {
      const issue = find(Number(m[1]));
      if (method === 'POST') {
        issue.comments.push({ id: (state.commentSeq += 1), body: body.body });
        issue.updated_at = 'now';
        return { status: 201, json: {} };
      }
      return { status: 200, json: issue.comments };
    }
    if ((m = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/labels\/(.+)$/.exec(path))) {
      const issue = find(Number(m[1]));
      issue.labels = issue.labels.filter((l) => l !== decodeURIComponent(m[2]));
      return { status: 200, json: {} };
    }
    if ((m = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/labels$/.exec(path))) {
      const issue = find(Number(m[1]));
      issue.labels.push(...body.labels);
      return { status: 200, json: {} };
    }
    if ((m = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)$/.exec(path))) {
      const issue = find(Number(m[1]));
      if (method === 'PATCH') Object.assign(issue, body);
      return { status: 200, json: issue };
    }
    return { status: 404, json: null };
  };
  return { state, gh, find };
}

const workItem = (number, task, labels, body = null) => ({
  number, title: `[claudinite-work] p/${task}`, labels,
  body: body ?? `packs/p/tasks/${task}/task.md\n\nExecute the Claudinite task above.\n`,
  created_at: '2026-08-14T04:00:00Z', updated_at: '2026-08-14T04:00:00Z',
});

const task = (id, decl = {}) => ({
  pack: 'p', id, taskDir: `packs/p/tasks/${id}`, taskPath: `packs/p/tasks/${id}/task.md`,
  decl: { id, frequency: 'daily', agent_model: 'sonnet', precondition: () => ({ run: true }), ...decl },
});

const drive = (repo, tasks, over = {}) => runExecutor({
  gh: repo.gh, repo: 'o/r', root: '/tmp', config: CONFIG, tasks,
  executorId: 'E1', maxItems: 2, now: () => new Date('2026-08-14T04:20:00Z'),
  collectSignalsFor: async () => ({}),
  runTaskCodeWork: async () => ({ ok: true, agentRequested: false }),
  invokeAgent: async () => ({ ok: true, sessionId: 's-1' }),
  log: () => {},
  ...over,
});

test('a go verdict with agentless code_work closes the item outcome:done', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready', 'origin:schedule'])]);
  const done = await drive(repo, [task('a', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 })]);
  assert.deepEqual(done, [{ issue: 1, outcome: 'outcome:done' }]);
  const issue = repo.find(1);
  assert.equal(issue.state, 'closed');
  assert.ok(issue.labels.includes('outcome:done'));
  assert.equal(issue.labels.includes('task:executing'), false);
});

// A run that deliberately left an unmerged PR SUCCEEDED, but it is not finished:
// it is waiting on a reviewer, and closing it would hide that from every surface
// that counts open work. So it parks — the one park that is not a fault.
test('code_work that opened a PR parks the item for approval instead of closing', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready', 'origin:schedule'])]);
  await drive(repo, [task('a', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 })], {
    runTaskCodeWork: async () => ({ ok: true, agentRequested: false, delivered: ['PR: #7 (open)'], openPr: 7 }),
  });
  const issue = repo.find(1);
  assert.equal(issue.state, 'open');
  assert.ok(issue.labels.includes('needs-human'));
  assert.ok(issue.labels.includes('task:needs-human-approval'));
  assert.equal(issue.labels.includes('outcome:delivered'), false);
  assert.match(issue.comments.at(-1).body, /#7/);
});

// …and a delivered artifact that is NOT a PR awaiting a person — a branch, an
// already-merged PR — asks nobody for anything, so it still closes.
test('code_work that delivered no open PR still closes outcome:done', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready', 'origin:schedule'])]);
  await drive(repo, [task('a', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 })], {
    runTaskCodeWork: async () => ({ ok: true, agentRequested: false, delivered: ['Branch: `x`'], openPr: null }),
  });
  const issue = repo.find(1);
  assert.equal(issue.state, 'closed');
  assert.ok(issue.labels.includes('outcome:done'));
});

// The executor sees an exit code; only the worker knows whether that was a scope
// it lacked or a bug in its own code. Its marker is what routes the park.
test('a failed code_work parks at the class its worker declared', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready', 'origin:schedule'])]);
  await drive(repo, [task('a', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 })], {
    runTaskCodeWork: async () => ({ ok: false, why: 'code-work exited 1', triage: { kind: 'action', detail: 'PAT lacks Actions: write' } }),
  });
  const issue = repo.find(1);
  assert.ok(issue.labels.includes('needs-human'));
  assert.ok(issue.labels.includes('task:needs-human-action'));
  assert.match(issue.comments.at(-1).body, /PAT lacks Actions: write/);
});

// No marker is not "assume the cheap lane": an unexplained break is a break.
test('a failed code_work that said nothing parks at failure', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready', 'origin:schedule'])]);
  await drive(repo, [task('a', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 })], {
    runTaskCodeWork: async () => ({ ok: false, why: 'code-work exited 1' }),
  });
  assert.ok(repo.find(1).labels.includes('task:needs-human-failure'));
});

// A declared secret nobody configured is the definitive `action`: no code changes,
// somebody sets a value.
test('an unconfigured declared secret parks at action', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready', 'origin:schedule'])]);
  await drive(repo, [task('a', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 })], {
    runTaskCodeWork: async () => ({ ok: true, agentRequested: false, missingSecrets: ['FLEET_GITHUB_TOKEN'] }),
  });
  assert.ok(repo.find(1).labels.includes('task:needs-human-action'));
});

// The model's whole trick: a no-go does not close the item, it ROLLS it, so the
// item itself carries "asked, declined, wakes at T" and the tick needs no ledger.
test('a no-go verdict rolls a scheduled item to its next anchor, blocked', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready', 'origin:schedule'])]);
  const done = await drive(repo, [task('a', { precondition: () => ({ run: false, reason: 'no work' }) })]);
  assert.deepEqual(done, [{ issue: 1, outcome: 'rolled' }]);
  const issue = repo.find(1);
  assert.equal(issue.state, 'open');
  assert.deepEqual(issue.labels.filter((l) => l.startsWith('task:')), ['task:blocked']);
  assert.equal(parseWorkItemBody(issue.body).notBefore, '2026-08-15T04:00:00.000Z');
  assert.match(issue.body, /no work/);
  // The roll writes no comment — the Not-before bump IS the record — so an hourly
  // task that stays quiet does not fill its own timeline.
  assert.deepEqual(issue.comments.filter((c) => !c.body.includes('claudinite-claim')), []);
});

test('a no-go on an ad-hoc item closes it obsolete — there is no anchor to roll to (S17)', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
  await drive(repo, [task('a', { precondition: () => ({ run: false, reason: 'the world settled' }) })]);
  const issue = repo.find(1);
  assert.equal(issue.state, 'closed');
  assert.ok(issue.labels.includes('outcome:obsolete'));
});

test('a precondition that throws converges the item rather than sinking the run', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready', 'origin:schedule'])]);
  const done = await drive(repo, [task('a', { precondition: () => { throw new Error('boom'); } })]);
  assert.deepEqual(done.map((d) => d.outcome), ['rolled']);
  assert.match(repo.find(1).body, /precondition threw: boom/);
});

test('a hand-off swaps to task:agent and invokes exactly one session', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready', 'origin:schedule'])]);
  const invocations = [];
  const done = await drive(repo, [task('a')], {
    runTaskCodeWork: async () => ({ ok: true, agentRequested: true }),
    invokeAgent: async (args) => { invocations.push(args); return { ok: true, sessionId: 's-9' }; },
  });
  assert.deepEqual(done, [{ issue: 1, outcome: 'agent' }]);
  assert.equal(invocations.length, 1);
  assert.match(invocations[0].nonce, /^1-/);
  const issue = repo.find(1);
  assert.ok(issue.labels.includes('task:agent'));
  assert.equal(issue.state, 'open', 'the agent converges the item, not the executor');
  assert.ok(issue.comments.some((c) => c.body.includes(invocations[0].nonce)));
});

// ONE CALL PER ITEM. An endpoint that ANSWERED and refused started no session and
// never will — a token, a URL or a routine is wrong — so the item goes to a human
// rather than round the loop again.
test('a refused invocation converges to triage: no session exists and a retry cannot help', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready', 'origin:schedule'])]);
  const done = await drive(repo, [task('a')], {
    maxItems: 1,
    runTaskCodeWork: async () => ({ ok: true, agentRequested: true }),
    invokeAgent: async () => ({ ok: false, answered: true, error: 'endpoint "default" returned 401' }),
  });
  assert.deepEqual(done, [{ issue: 1, outcome: 'needs-human' }]);
  const issue = repo.find(1);
  assert.ok(issue.labels.includes('needs-human'));
  assert.equal(issue.labels.includes('task:agent'), false);
  assert.ok(issue.comments.some((c) => c.body.includes('401')));
});

// …and the case the whole design turns on. A call that got no answer may have
// started a session, so re-queueing would be how two sessions land on one item and
// converging to triage would kill a run that is very possibly alive. The item
// stays with the agent, and an existing rule — the janitor's agent leash — settles
// it either way.
test('an unanswered invocation leaves the item with the agent and says the outcome is unknown', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready', 'origin:schedule'])]);
  let calls = 0;
  const done = await drive(repo, [task('a')], {
    maxItems: 1,
    runTaskCodeWork: async () => ({ ok: true, agentRequested: true }),
    invokeAgent: async () => { calls += 1; return { ok: false, answered: false, error: 'no answer: socket timeout' }; },
  });
  assert.deepEqual(done, [{ issue: 1, outcome: 'unknown' }]);
  assert.equal(calls, 1, 'never called twice');
  const issue = repo.find(1);
  assert.deepEqual(issue.labels.filter((l) => l.startsWith('task:')), ['task:agent']);
  assert.equal(issue.labels.includes('needs-human'), false);
  assert.equal(issue.state, 'open');
  assert.ok(issue.comments.some((c) => c.body.includes('may or may not have started')));
});

test('failed code_work converges to triage and never hands off', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready', 'origin:schedule'])]);
  let invoked = 0;
  await drive(repo, [task('a', { code_work: 'node w.mjs', code_work_timeout: 60 })], {
    runTaskCodeWork: async () => ({ ok: false, why: 'code_work exited 1', detail: 'stack' }),
    invokeAgent: async () => { invoked += 1; return { ok: true }; },
  });
  assert.equal(invoked, 0);
  assert.ok(repo.find(1).labels.includes('needs-human'));
  assert.equal(repo.find(1).state, 'open');
});

// §14.7 — nothing fails silently; the task just doesn't work yet, and the item
// names exactly which secret to set.
test('a declared-but-unconfigured secret names itself on the item', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready', 'origin:schedule'])]);
  await drive(repo, [task('a', { code_work: 'node w.mjs', code_work_timeout: 60, required_secrets: ['STORE_TOKEN'] })], {
    runTaskCodeWork: async () => ({ ok: true, missingSecrets: ['STORE_TOKEN'] }),
  });
  const issue = repo.find(1);
  assert.ok(issue.labels.includes('needs-human'));
  assert.ok(issue.comments.some((c) => c.body.includes('STORE_TOKEN')));
});

test('an item whose task the repo no longer carries closes obsolete, like exit-14 did', async () => {
  const repo = fakeRepo([workItem(1, 'gone', ['task:ready', 'origin:schedule'])]);
  const done = await drive(repo, [task('a')]);
  assert.deepEqual(done, [{ issue: 1, outcome: 'obsolete' }]);
  assert.equal(repo.find(1).state, 'closed');
});

test('a malformed item goes to a human — a forged body is never executed', async () => {
  const repo = fakeRepo([{ ...workItem(1, 'a', ['task:ready']), body: '' }]);
  const done = await drive(repo, [task('a')]);
  assert.deepEqual(done, [{ issue: 1, outcome: 'needs-human' }]);
});

test('an item pointing somewhere other than where its task lives at HEAD is refused', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'], 'somewhere/else/task.md\n')]);
  const done = await drive(repo, [task('a')]);
  assert.deepEqual(done, [{ issue: 1, outcome: 'needs-human' }]);
  assert.ok(repo.find(1).comments.some((c) => c.body.includes('somewhere/else/task.md')));
});

// The lease's whole point, driven through the shell: an executor that is not this
// episode's earliest claimant touches nothing and moves on.
test('an executor that loses the lease abandons the item untouched and picks another', async () => {
  const rival = { id: 1, body: '<!-- claudinite-claim -->\nClaimed by executor `E0` at earlier.' };
  const repo = fakeRepo([
    { ...workItem(1, 'a', ['task:ready', 'origin:schedule']), comments: [rival] },
    workItem(2, 'b', ['task:ready', 'origin:schedule']),
  ]);
  const done = await drive(repo, [task('a'), task('b', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 })]);
  assert.deepEqual(done.map((d) => d.issue), [2], 'it moved on to a different item');
  assert.equal(repo.find(1).state, 'open');
});

test('the loop stops at maxItems even with more ready work', async () => {
  const repo = fakeRepo([
    workItem(1, 'a', ['task:ready', 'origin:schedule']),
    workItem(2, 'a', ['task:ready', 'origin:schedule']),
    workItem(3, 'a', ['task:ready', 'origin:schedule']),
  ]);
  // Three same-title items: the mutex means only one is pickable at a time, and
  // each converges before the next is picked.
  const done = await drive(repo, [task('a', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 })], { maxItems: 2 });
  assert.equal(done.length, 2);
});

// --- F24: letting go of an open item kills your claim --------------------------
//
// A single-executor test cannot see this class: an executor beats its own stale
// claim by id equality, so the item runs and the leak stays invisible. What
// exposes it is a SECOND executor arriving after the first let the item go — the
// shape the whole burst missed and live traffic found.

test('a second executor wins immediately on a ROLLED item — the first strike killed its claim (F24)', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready', 'origin:schedule'])]);
  const declines = task('a', { precondition: () => ({ run: false, reason: 'no work' }) });

  await drive(repo, [declines]);                                   // E1 claims, rolls, strikes
  assert.deepEqual(repo.find(1).labels.filter((l) => l.startsWith('task:')), ['task:blocked']);

  // The tick readies it at the next anchor; a DIFFERENT executor picks it up.
  repo.find(1).labels = ['task:ready', 'origin:schedule'];
  const done = await drive(repo, [declines], { executorId: 'E2' });

  assert.deepEqual(done, [{ issue: 1, outcome: 'rolled' }],
    'E2 must run the item, not lose the lease to E1\'s spent claim');
  // Still no roll comment: the strike is an edit to a comment that already exists.
  const issue = repo.find(1);
  assert.deepEqual(issue.comments.filter((c) => !c.body.includes('claudinite-claim')), [],
    'striking must not cost a timeline entry — that is why the roll can use it');
});

test('a second executor wins immediately on a PARKED item a human re-queued (F24)', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready', 'origin:schedule'])]);
  const agentic = task('a');

  // E1 claims, hands off, the endpoint refuses → parked needs-human, claim struck.
  await drive(repo, [agentic], { invokeAgent: async () => ({ ok: false, answered: true, error: 'no endpoint' }) });
  assert.ok(repo.find(1).labels.includes('needs-human'));

  // The sanctioned re-queue, exactly as the park's own comment instructs (F7):
  // drop needs-human, add task:ready. Nothing else — no marker, no cleanup.
  repo.find(1).labels = ['task:ready', 'origin:schedule'];
  const done = await drive(repo, [agentic], { executorId: 'E2' });

  assert.deepEqual(done, [{ issue: 1, outcome: 'agent' }],
    'the item must be claimable again — a park that leaves its claim standing livelocks forever');
});

test('a losing claimant strikes its own claim too — otherwise it owns the NEXT episode (F24)', async () => {
  // A rival already holds this episode; E1 claims, loses, and walks away.
  const rival = { id: 50, body: '<!-- claudinite-claim -->\nClaimed by executor `E9` at t.' };
  const repo = fakeRepo([{ ...workItem(1, 'a', ['task:ready', 'origin:schedule']), comments: [rival] }]);
  const agentless = task('a', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 });

  await drive(repo, [agentless]);
  assert.equal(repo.find(1).state, 'open', 'E1 left the item to its holder');

  // E9's tenure ends — reclaimed by the leash — which opens a fresh episode.
  // E1's abandoned claim is younger than E9's, so unless it was struck it is now
  // the earliest of the new episode and nothing can ever take the item.
  const issue = repo.find(1);
  issue.comments.push({ id: 60, body: '<!-- claudinite-episode -->\nreclaimed: executor went silent' });
  issue.labels = ['task:ready', 'origin:schedule'];

  const done = await drive(repo, [agentless], { executorId: 'E2' });
  assert.deepEqual(done, [{ issue: 1, outcome: 'outcome:done' }],
    'E2 must win the fresh episode — a loser\'s leftover claim must not outlive its own episode');
});
