// The executor loop end to end against a fake GitHub — pick, claim, evaluate,
// code-work, hand off, converge. The pure rules are tested beside this; what this
// pins is that the SHELL actually drives them to a terminal state, which is the
// thing a fixture over the rules alone can never say.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runExecutor } from '../../queue/executor.mjs';
import { parseWorkItemBody } from '../../queue/work-item.mjs';

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

// `random` is pinned ascending so a fixture with several pickable items picks the
// FIRST one it lists — production's draw is random (§15.20) and a test that let it
// vary would be a coin flip, not a test.
const ascendingDraw = () => { let n = 0; return () => (n += 1) / 1000; };

const drive = (repo, tasks, over = {}) => runExecutor({
  gh: repo.gh, repo: 'o/r', root: '/tmp', config: CONFIG, tasks,
  executorId: 'E1', now: () => new Date('2026-08-14T04:20:00Z'), random: ascendingDraw(),
  collectSignalsFor: async () => ({}),
  runTaskCodeWork: async () => ({ ok: true, agentRequested: false }),
  invokeAgent: async () => ({ ok: true, sessionId: 's-1' }),
  log: () => {},
  ...over,
});

test('a go verdict with agentless code_work closes the item task:done', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
  const done = await drive(repo, [task('a', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 })]);
  assert.deepEqual(done, [{ issue: 1, outcome: 'task:done' }]);
  const issue = repo.find(1);
  assert.equal(issue.state, 'closed');
  assert.ok(issue.labels.includes('task:done'));
  assert.equal(issue.labels.includes('task:executing'), false);
});

// A run that deliberately left an unmerged PR SUCCEEDED, but it is not finished:
// it is waiting on a reviewer, and closing it would hide that from every surface
// that counts open work. So it parks — the one park that is not a fault.
test('code_work that opened a PR parks the item for approval instead of closing', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
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
test('code_work that delivered no open PR still closes task:done', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
  await drive(repo, [task('a', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 })], {
    runTaskCodeWork: async () => ({ ok: true, agentRequested: false, delivered: ['Branch: `x`'], openPr: null }),
  });
  const issue = repo.find(1);
  assert.equal(issue.state, 'closed');
  assert.ok(issue.labels.includes('task:done'));
});

// The executor sees an exit code; only the worker knows whether that was a scope
// it lacked or a bug in its own code. Its marker is what routes the park.
test('a failed code_work parks at the class its worker declared', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
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
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
  await drive(repo, [task('a', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 })], {
    runTaskCodeWork: async () => ({ ok: false, why: 'code-work exited 1' }),
  });
  assert.ok(repo.find(1).labels.includes('task:needs-human-failure'));
});

// A declared secret nobody configured is the definitive `action`: no code changes,
// somebody sets a value.
test('an unconfigured declared secret parks at action', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
  await drive(repo, [task('a', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 })], {
    runTaskCodeWork: async () => ({ ok: true, agentRequested: false, missingSecrets: ['FLEET_GITHUB_TOKEN'] }),
  });
  assert.ok(repo.find(1).labels.includes('task:needs-human-action'));
});

// The roll is gone (#1115): a scheduled item's no-go CLOSES it with the reason
// on record — the next occurrence is the scheduler run's ask at the task's next
// anchor, and "asked, declined" lives on the schedule board, not on an open
// sleeping issue.
test('a no-go verdict closes a scheduled item with the reason — the roll is gone (#1115)', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
  const done = await drive(repo, [task('a', { precondition: () => ({ run: false, reason: 'no work' }) })]);
  assert.deepEqual(done, [{ issue: 1, outcome: 'obsolete' }]);
  const issue = repo.find(1);
  assert.equal(issue.state, 'closed');
  assert.ok(issue.labels.includes('task:obsolete'));
  assert.equal(parseWorkItemBody(issue.body).notBefore, null, 'no Not-before is ever stamped');
  // The close comment carries the reason and points at the board — and for a
  // decline the record says success: the executor asked, got a no, closed.
  const closeComment = issue.comments.find((c) => c.body.includes('declined'));
  assert.match(closeComment.body, /no work/);
  assert.match(closeComment.body, /schedule board/);
});

test('a no-go on an ad-hoc item closes it obsolete — there is no anchor to roll to (S17)', async () => {
  // Ad-hoc by structure: a `manual` task has no calendar to roll to (§15.26).
  const repo = fakeRepo([workItem(1, 'lever', ['task:ready'])]);
  await drive(repo, [task('lever', { frequency: 'manual', precondition: () => ({ run: false, reason: 'the world settled' }) })]);
  const issue = repo.find(1);
  assert.equal(issue.state, 'closed');
  assert.ok(issue.labels.includes('task:obsolete'));
});

test('a precondition that throws converges the item rather than sinking the run', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
  const done = await drive(repo, [task('a', { precondition: () => { throw new Error('boom'); } })]);
  // A throw at pick is a DECLINE (one task's bad verdict is that item's
  // problem, never the executor's); only the scheduler run's anchor-side ask
  // treats a throw as fail-open.
  assert.deepEqual(done.map((d) => d.outcome), ['obsolete']);
  const issue = repo.find(1);
  assert.equal(issue.state, 'closed');
  assert.ok(issue.comments.some((c) => /precondition threw: boom/.test(c.body)));
});

test('a hand-off swaps to task:agent and invokes exactly one session', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
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
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
  const done = await drive(repo, [task('a')], {
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
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
  let calls = 0;
  const done = await drive(repo, [task('a')], {
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
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
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
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
  await drive(repo, [task('a', { code_work: 'node w.mjs', code_work_timeout: 60, required_secrets: ['STORE_TOKEN'] })], {
    runTaskCodeWork: async () => ({ ok: true, missingSecrets: ['STORE_TOKEN'] }),
  });
  const issue = repo.find(1);
  assert.ok(issue.labels.includes('needs-human'));
  assert.ok(issue.comments.some((c) => c.body.includes('STORE_TOKEN')));
});

test('an item whose task the repo no longer carries closes obsolete, like exit-14 did', async () => {
  const repo = fakeRepo([workItem(1, 'gone', ['task:ready'])]);
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
// episode's earliest claimant touches that item's state not at all. Under the
// batched drain it does NOT end its run — the winner owns that ONE item, not the
// queue — so it moves to the next pickable item and leaves the loser's behind.
test('an executor that loses the lease leaves that item to its winner and drains the rest', async () => {
  const rival = { id: 1, body: '<!-- claudinite-claim -->\nClaimed by executor `E0` at earlier.' };
  const repo = fakeRepo([
    { ...workItem(1, 'a', ['task:ready']), comments: [rival] },
    workItem(2, 'b', ['task:ready']),
  ]);
  const done = await drive(repo, [task('a'), task('b', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 })]);
  assert.deepEqual(done, [{ issue: 2, outcome: 'task:done' }], 'the item it did win, it settled');
  assert.equal(repo.find(1).state, 'open', 'the lost item is the winner\'s to converge');
  assert.equal(repo.find(2).state, 'closed');
});

// --- one run drains the queue (DESIGN §10, §15.30, S34/S65) -------------------
//
// The reversal of §15.22, and the reason is the bill: Actions rounds each job's
// minutes up, so a run per item bought a whole invocation — checkout, setup,
// rounding — for each. A run now settles what is pickable, one item at a time.

test('a run drains every pickable item, one at a time', async () => {
  const repo = fakeRepo([
    workItem(1, 'a', ['task:ready']),
    workItem(2, 'b', ['task:ready']),
    workItem(3, 'c', ['task:ready']),
  ]);
  // Three DIFFERENT titles, so nothing here is serialized by the same-title
  // mutex: all three are pickable at once and ONE run settles all three.
  const agentless = (id) => task(id, { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 });
  const done = await drive(repo, ['a', 'b', 'c'].map(agentless));
  assert.deepEqual(done.map((d) => d.issue).sort(), [1, 2, 3]);
  for (const n of [1, 2, 3]) assert.equal(repo.find(n).state, 'closed', `#${n} converged in the same run`);
});

// Serial, not concurrent: the run boundary moved, the occupancy model did not
// (§15.30). Each item's work step completes before the next item is claimed —
// so a code-work that observed an overlap would be the regression.
test('a drained run never runs two items\' work at once', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready']), workItem(2, 'b', ['task:ready'])]);
  let inFlight = 0; let overlapped = false;
  const agentless = (id) => task(id, { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 });
  await drive(repo, ['a', 'b'].map(agentless), {
    runTaskCodeWork: async () => {
      inFlight += 1;
      if (inFlight > 1) overlapped = true;
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return { ok: true, agentRequested: false };
    },
  });
  assert.equal(overlapped, false);
});

// A handed-off item leaves the executor's occupancy at the hand-off (§10) — so
// the run goes straight on to the next item rather than waiting for a session
// it will never hear from.
test('a hand-off ends that item\'s occupancy and the run keeps draining', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready']), workItem(2, 'b', ['task:ready'])]);
  const done = await drive(repo, [
    task('a'),
    task('b', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 }),
  ]);
  assert.deepEqual(done, [{ issue: 1, outcome: 'agent' }, { issue: 2, outcome: 'task:done' }]);
});

// THE REVERT'S OWN HAZARD, which only the batched run has. A post-claim revert
// (F15) puts the item back to `task:ready` — and a run that re-reads the queue
// to pick its next item would find exactly what it just returned, claim it,
// revert it again, forever. The stand-down set is what makes a revert a
// hand-off to the winner rather than a loop.
test('an item this run reverted is never re-picked by it (F15 under the drain)', async () => {
  const repo = fakeRepo([
    workItem(1, 'a', ['task:ready']),
    workItem(2, 'b', ['task:ready']),
    { ...workItem(99, 'a', ['task:executing']),
      comments: [{ id: 1, body: '<!-- claudinite-claim -->\nClaimed by executor `E0` at earlier.' }] },
  ]);
  // The stale-read race, exactly: the pick sees a clean queue, and by the time
  // the post-claim re-verify reads again, a twin of #1 is running under an
  // EARLIER claim. Nothing but a second read can produce this — which is why
  // the rule-level fixture beside this cannot stand in for it.
  // Only the post-claim re-verify's read sees the twin: the pick before it
  // predates the twin's claim, and by the next pick the twin has settled and is
  // gone. So nothing but the stand-down set stops this run re-claiming #1 —
  // the pick filter, reading a queue with no twin in it, would hand it straight
  // back. A revert is this run losing an arbitration, not a retry.
  let lists = 0;
  const gh = async (path, opts = {}) => {
    const res = await repo.gh(path, opts);
    if ((opts.method ?? 'GET') === 'GET' && /\/issues\?/.test(path) && Array.isArray(res.json)) {
      lists += 1;
      if (lists !== 2) return { ...res, json: res.json.filter((i) => i.number !== 99) };
    }
    return res;
  };
  const agentless = (id) => task(id, { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 });
  const done = await drive(repo, ['a', 'b'].map(agentless), { gh });
  assert.ok(repo.find(1).labels.includes('task:ready'), '#1 went back to the queue');
  assert.equal(done.filter((d) => d.issue === 1).length, 0, '#1 was not run by the reverting executor');
  // and the run did not stop at the revert either — it went on and drained #2
  assert.deepEqual(done, [{ issue: 2, outcome: 'task:done' }]);
});

// --- the operator hold, between items (§15.30, S37) ---------------------------
//
// `vars.*` reaches the env at run START only, so a drain that outlives the hold's
// arrival can see it only by asking. It stops PICKING; the item it holds finishes.
test('a hold arriving mid-drain stops the next pick and leaves the queue untouched', async () => {
  const repo = fakeRepo([
    workItem(1, 'a', ['task:ready']),
    workItem(2, 'b', ['task:ready']),
    workItem(3, 'c', ['task:ready']),
  ]);
  const lines = [];
  const agentless = (id) => task(id, { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 });
  let asked = 0;
  const done = await drive(repo, ['a', 'b', 'c'].map(agentless), {
    heldNow: async () => (asked += 1) >= 2, // held from the second boundary on
    log: (l) => lines.push(l),
  });
  assert.deepEqual(done.map((d) => d.issue), [1, 2], 'the item in hand finished; nothing new was picked');
  assert.equal(repo.find(3).state, 'open');
  assert.deepEqual(repo.find(3).labels, ['task:ready'], 'frozen exactly as it was — no label touched');
  assert.ok(lines.some((l) => l.includes('CLAUDINITE_TASKS_SUSPEND_ALL')), lines.join('\n'));
});

// The read costs an API call, so a run with nothing left to do must not spend it:
// the hold is asked between items, never after the last one.
test('a run that drained the queue asks the hold once per settle, not once more', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
  let asked = 0;
  await drive(repo, [task('a', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 })], {
    heldNow: async () => { asked += 1; return false; },
  });
  assert.equal(asked, 1);
});

// --- F24: letting go of an open item kills your claim --------------------------
//
// A single-executor test cannot see this class: an executor beats its own stale
// claim by id equality, so the item runs and the leak stays invisible. What
// exposes it is a SECOND executor arriving after the first let the item go — the
// shape the whole burst missed and live traffic found.

// The ROLLED half of F24 retired with the roll itself (#1115): a decline now
// CLOSES its item, nothing re-claims a closed issue, and the silent-episode
// class narrows to the park — the test below.

test('a second executor wins immediately on a PARKED item a human re-queued (F24)', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
  const agentic = task('a');

  // E1 claims, hands off, the endpoint refuses → parked needs-human, claim struck.
  await drive(repo, [agentic], { invokeAgent: async () => ({ ok: false, answered: true, error: 'no endpoint' }) });
  assert.ok(repo.find(1).labels.includes('needs-human'));

  // The sanctioned re-queue, exactly as the park's own comment instructs (F7):
  // drop needs-human, add task:ready. Nothing else — no marker, no cleanup.
  repo.find(1).labels = ['task:ready'];
  const done = await drive(repo, [agentic], { executorId: 'E2' });

  assert.deepEqual(done, [{ issue: 1, outcome: 'agent' }],
    'the item must be claimable again — a park that leaves its claim standing livelocks forever');
});

test('a losing claimant strikes its own claim too — otherwise it owns the NEXT episode (F24)', async () => {
  // A rival already holds this episode; E1 claims, loses, and walks away.
  const rival = { id: 50, body: '<!-- claudinite-claim -->\nClaimed by executor `E9` at t.' };
  const repo = fakeRepo([{ ...workItem(1, 'a', ['task:ready']), comments: [rival] }]);
  const agentless = task('a', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 });

  await drive(repo, [agentless]);
  assert.equal(repo.find(1).state, 'open', 'E1 left the item to its holder');

  // E9's tenure ends — reclaimed by the leash — which opens a fresh episode.
  // E1's abandoned claim is younger than E9's, so unless it was struck it is now
  // the earliest of the new episode and nothing can ever take the item.
  const issue = repo.find(1);
  issue.comments.push({ id: 60, body: '<!-- claudinite-episode -->\nreclaimed: executor went silent' });
  issue.labels = ['task:ready'];

  const done = await drive(repo, [agentless], { executorId: 'E2' });
  assert.deepEqual(done, [{ issue: 1, outcome: 'task:done' }],
    'E2 must win the fresh episode — a loser\'s leftover claim must not outlive its own episode');
});

// --- the dispatch write itself -------------------------------------------------
//
// The chain's one non-issue write. A 204 is the ONLY success: `actions: write`
// missing returns a 403 with a body that reads like any other response, so a
// caller that judged the body would report a chain it never started.

test('dispatchWorkflow judges the POST by status, never by its body', async () => {
  const { dispatchWorkflow } = await import('../../github.mjs');
  const seen = [];
  const gh = async (path, opts) => {
    seen.push({ path, ...opts });
    return path.includes('denied')
      ? { status: 403, json: { message: 'Resource not accessible by integration' } }
      : { status: 204, json: null };
  };
  assert.deepEqual(await dispatchWorkflow(gh, 'o/r', 'claudinite-executor.yml', 'main'),
    { ok: true, status: 204 });
  assert.deepEqual(seen[0], {
    path: '/repos/o/r/actions/workflows/claudinite-executor.yml/dispatches',
    method: 'POST',
    body: { ref: 'main' },
  });
  assert.deepEqual(await dispatchWorkflow(gh, 'o/denied', 'claudinite-executor.yml', 'main'),
    { ok: false, status: 403 });
});

// --- the durable record, and the release a close performs (§15.18, §15.19) -----
//
// The executor converges the agentless majority itself, and for those runs the
// item is the only trace that outlives the Actions log.

test('an executor close writes the execution record onto the item', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
  await drive(repo, [task('a', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 })]);
  assert.match(repo.find(1).comments.at(-1).body, /claudinite-task-exec v1 p\/a \[#1\] success/);
});

test('a park in the failure lane records the run as failed', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
  await drive(repo, [task('a', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 })], {
    runTaskCodeWork: async () => ({ ok: false, why: 'boom' }),
  });
  assert.match(repo.find(1).comments.at(-1).body, /claudinite-task-exec v1 p\/a \[#1\] failed/);
});

// An approval park is a run that SUCCEEDED and left a PR — neither `success` (the
// item is open) nor `failed` (nothing broke). Absence is the honest answer.
test('an approval park writes no record at all', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
  await drive(repo, [task('a', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 })], {
    runTaskCodeWork: async () => ({ ok: true, agentRequested: false, delivered: ['PR: #7 (open)'], openPr: 7 }),
  });
  assert.doesNotMatch(repo.find(1).comments.at(-1).body, /claudinite-task-exec/);
});

// A close writes only to the item it holds (§15.19, reversed by §15.31 / #1373):
// releasing a dependent is the scheduler run's readiness job alone, never a
// close's.
test('an executor close leaves the dependent it was holding still blocked', async () => {
  const dependent = {
    ...workItem(2, 'b', ['task:blocked']),
    body: 'packs/p/tasks/b/task.md\n\nBlocked-by: #1\n',
  };
  const repo = fakeRepo([workItem(1, 'a', ['task:ready']), dependent]);
  const agentless = (id) => task(id, { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 });
  const done = await drive(repo, ['a', 'b'].map(agentless));
  assert.deepEqual(done.map((d) => d.issue), [1], 'the dependent was never picked up in this run');
  assert.equal(repo.find(1).state, 'closed');
  assert.deepEqual(repo.find(2).labels, ['task:blocked']);
  assert.equal(repo.find(2).state, 'open');
});

// The beat, driven through the shell: a work step long enough to need one gets
// one, on the item, from the executor holding it.
test('a long work step leaves heartbeats on its own item', async () => {
  const repo = fakeRepo([workItem(1, 'a', ['task:ready'])]);
  const beatsSoFar = () => repo.find(1).comments.filter((c) => c.body.includes('<!-- claudinite-heartbeat -->'));
  await drive(repo, [task('a', { agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 60 })], {
    heartbeatMs: 5,
    // The step holds itself open UNTIL the beat has landed twice, rather than
    // sleeping long enough that it probably has. A fixed window against a 5ms
    // interval is a race the loaded machine wins: under the full suite at eight
    // workers this read one beat and failed on ~3 runs in 4. The ceiling is what
    // keeps a heartbeat that never fires a failed assertion rather than a hang.
    runTaskCodeWork: async () => {
      const deadline = Date.now() + 5000;
      while (beatsSoFar().length < 2 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5));
      return { ok: true, agentRequested: false };
    },
  });
  const beats = beatsSoFar();
  assert.ok(beats.length >= 2, `the item stayed live through the work (got ${beats.length})`);
  assert.match(beats[0].body, /executor `E1`/);
});
