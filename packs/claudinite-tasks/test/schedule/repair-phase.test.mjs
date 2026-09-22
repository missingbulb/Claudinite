import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRepair } from '../../src/schedule/repair.mjs';
import { applyRepairOp } from '../../src/schedule/run.mjs';
import { doneRunLookup, SUPERSEDABLE_PARKS } from '../../src/schedule/repair-rules.mjs';
import { lastProgressAt } from '../../src/items/heartbeat.mjs';
import {
  STATUS_NEEDS_HUMAN_ACTION, STATUS_NEEDS_HUMAN_FAILURE, HANDOFF_MARKER, STATUS_DONE,
  STATUS_REJECTED,
} from '../../public/task-constants.mjs';
import { parkKindOf, isStatus } from '../../public/work-item-grammar.mjs';
import { comment, addLabel, removeLabel, closeIssue } from '../../src/world/github.mjs';

// A fake GitHub that answers the one read the repair phase makes at WRITE time —
// the fresh re-read the three transient rules confirm against — and records the
// writes. `labelsOn` is what the assertions turn on: a park is the state the machine
// reads and what the human is being asked for, in one label.
// `fresh` answers that per-issue re-read, keyed by number, so a test can say "this
// item looks different by the time the run writes".
function repairGh(issues, fresh = {}) {
  const added = [];
  const patched = [];
  const posted = [];
  const gh = async (path, { method = 'GET', body } = {}) => {
    if (method === 'PATCH' && /\/issues\/\d+$/.test(path)) {
      patched.push({ issue: Number(path.match(/issues\/(\d+)/)[1]), ...body });
    }
    if (method === 'GET' && /\/issues\/\d+$/.test(path)) {
      const n = Number(path.match(/issues\/(\d+)/)[1]);
      return { status: 200, json: fresh[n] ?? issues.find((i) => i.number === n) ?? {} };
    }
    if (method === 'POST' && /\/issues\/\d+\/comments$/.test(path)) posted.push(body.body);
    if (method === 'POST' && /\/issues\/\d+\/labels$/.test(path)) {
      added.push({ issue: Number(path.match(/issues\/(\d+)/)[1]), labels: body.labels });
    }
    return { status: method === 'POST' ? 201 : 200, json: {} };
  };
  return { gh, added, patched, posted };
}

const at = (iso) => iso;
const workItem = (number, labels, { created = '2026-07-01T00:00:00Z', updated = created, body = 'packs/p/tasks/a/task.md\n' } = {}) => ({
  number, title: '[claudinite-work] p/a', body, labels: labels.map((name) => ({ name })),
  state: 'open', created_at: created, updated_at: updated, pull_request: undefined,
});

const quiet = async (fn) => {
  const real = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = real; }
};

// ONE label per park since the write-side flip (#1119): the park IS the status.
const labelsOn = (added, issue) => added.filter((a) => a.issue === issue).flatMap((a) => a.labels);

// The phase as the scheduler run drives it: plan over the items, then apply every op
// through the real write paths. The seams are built here exactly as `run.mjs` builds
// them from its own reads, so a case exercises the wiring rather than a paraphrase
// of it.
async function repair(issues, { now, tasks = [], comments = {}, fresh = {}, targets = {}, closed = [], blockers = {} } = {}) {
  const { gh, added, patched, posted } = repairGh(issues, fresh);
  const items = [...issues, ...closed];
  const agentComments = new Map(Object.entries(comments).map(([n, c]) => [Number(n), c]));
  const plan = planRepair({
    items, tasks, now,
    progressAt: (item) => lastProgressAt(agentComments.get(item.number) ?? []),
    resolutionOf: (n) => targets[n] ?? null,
    doneAfter: doneRunLookup(closed.filter((i) => isStatus(i, STATUS_DONE))),
    stateOf: (n) => blockers[n] ?? 'open',
  });
  const written = [];
  for (const op of plan.ops) {
    const ok = await applyRepairOp({
      gh, repo: 'o/r', op, now, tasks, agentComments, log: () => {},
      api: { comment, addLabel, removeLabel, closeIssue },
    });
    if (ok) written.push(op);
  }
  const by = (rule) => written.filter((o) => o.rule === rule).map((o) => o.issue);
  return {
    added, patched, posted, ops: plan.ops, threadedClosed: plan.closed,
    staleReady: by('stale-ready'), deadAgents: by('dead-agent'), stateless: by('stateless'),
    superseded: by('superseded'), orphaned: by('orphaned'), ended: by('ended'),
    abandoned: by('abandoned'), unclosed: by('unclosed'), stuck: by('stuck-dependency'),
  };
}

test('a stale-ready item parks at action — the lane is not being drained, and the fix is outside the item', async () => {
  const out = await quiet(() => repair([workItem(11, ['task:status:waiting-for-executor'], { created: '2026-07-01T00:00:00Z' })],
    { now: at('2026-07-10T00:00:00Z') }));
  assert.deepEqual(out.staleReady, [11]);
  assert.deepEqual(labelsOn(out.added, 11), [STATUS_NEEDS_HUMAN_ACTION]);
});

// A dead session is the machine noticing a corpse, not a person deciding anything.
// The kind matters twice over: `failure` is the only park a later clean run can
// supersede (rule E), and the only one that holds the task's lane so the generator
// stops filing a fresh occurrence every anchor behind a run nobody has looked at.
test('a dead agent claim parks at failure — nothing here is a human\'s choice', async () => {
  const out = await quiet(() => repair([workItem(21, ['task:status:running-agent'], { created: '2026-07-01T00:00:00Z' })], {
    now: at('2026-07-02T00:00:00Z'),
    comments: { 21: [{ id: 1, body: `${HANDOFF_MARKER}\nHanded off to a session at nonce \`n-7f3\`.`, created_at: '2026-07-01T00:00:00Z' }] },
  }));
  assert.deepEqual(out.deadAgents, [21]);
  assert.deepEqual(labelsOn(out.added, 21), [STATUS_NEEDS_HUMAN_FAILURE]);
  assert.ok(out.posted.some((b) => b.includes('n-7f3')), 'the escalation names WHICH session died, off the hand-off comment');
});

// The reason the kind was wrong: rule E is what drains these once the thing that
// broke is fixed, and it only ever looks at SUPERSEDABLE_PARKS. A rule B park
// outside that set accumulates forever however many clean runs follow it.
test('the kind rule B parks at is one rule E can supersede', () => {
  assert.ok(SUPERSEDABLE_PARKS.includes(parkKindOf({ labels: [{ name: STATUS_NEEDS_HUMAN_FAILURE }] })));
});

// Same reading as rule B: an item off the state machine is a label swap that TORE,
// which the machine noticed. Nobody decided it, so a later clean run may clear it.
test('a stateless item parks at failure — a torn swap is breakage, not a judgement', async () => {
  const out = await quiet(() => repair([workItem(31, [])], { now: at('2026-07-02T00:00:00Z') }));
  assert.deepEqual(out.stateless, [31]);
  assert.deepEqual(labelsOn(out.added, 31), [STATUS_NEEDS_HUMAN_FAILURE]);
});

// A TORN ADOPTION IS NOT A TORN ITEM. Job 4 writes the machine block and then the
// status, so a block with no status is what a failed label call leaves — and job 4
// re-adopts it on the next run. Merged into one pass with repair running first, the
// stateless rule would otherwise always win that race and park work nobody started.
test('an issue the adopt job owns is never parked as stateless', async () => {
  const marked = { ...workItem(51, ['task:origin:ad-hoc']), title: 'Please do the thing' };
  const plan = planRepair({ items: [marked], tasks: [], now: at('2026-07-02T00:00:00Z'), isRequest: (n) => n === 51 });
  assert.deepEqual(plan.ops, []);
  // …and the same issue, once nothing owns it, is the torn item the rule is for.
  const orphan = planRepair({ items: [marked], tasks: [], now: at('2026-07-02T00:00:00Z') });
  assert.deepEqual(orphan.ops.map((o) => o.rule), ['stateless']);
});

// #1104, exactly. A stateless item is what an item in MID-SWAP looks like, not only
// one whose swap tore — and the item list the phase rules over is a snapshot taken
// seconds earlier. Escalating from it files `needs-human` against work an executor
// has already finished, which is a false triage signal a person then has to read.
test('an item that settled between the sweep\'s read and its write is left alone', async () => {
  const torn = workItem(41, []);
  const out = await quiet(() => repair([torn], {
    now: at('2026-07-02T00:00:00Z'),
    fresh: { 41: { ...torn, state: 'closed', labels: [{ name: 'task:status:done' }] } },
  }));
  assert.deepEqual(out.stateless, [], 'nothing was repaired, because nothing was broken');
  assert.deepEqual(labelsOn(out.added, 41), [], 'and no triage label reached finished work');
});

// The narrower half of the same race: still open, but a state label has landed.
test('an item that acquired its state label before the write is left alone', async () => {
  const torn = workItem(42, []);
  const out = await quiet(() => repair([torn], {
    now: at('2026-07-02T00:00:00Z'),
    fresh: { 42: { ...torn, labels: [{ name: 'task:status:running-executor' }] } },
  }));
  assert.deepEqual(out.stateless, []);
  assert.deepEqual(labelsOn(out.added, 42), []);
});

// …and the genuine tear still parks, which is what stops the confirm read from
// simply disabling the rule.
test('an item still stateless on the second read is repaired', async () => {
  const out = await quiet(() => repair([workItem(43, [])], { now: at('2026-07-02T00:00:00Z') }));
  assert.deepEqual(out.stateless, [43]);
  assert.deepEqual(labelsOn(out.added, 43), [STATUS_NEEDS_HUMAN_FAILURE]);
});

// The wiring the pure rules cannot cover: rule F picks its comment from WHERE the
// task lives, so the phase has to carry that through. A park naming a live task at a
// path it has moved off closes obsolete, and the comment says where it is now (#1461).
test('a park naming its task at a path it has moved off closes obsolete, naming the new path', async () => {
  const moved = {
    ...workItem(31, ['task:status:needs-human-failure']),
    body: 'packs/grow_with_claudinite/tasks/a/task.md\n',
    title: '[claudinite-work] grow_with_claudinite/a',
  };
  const out = await quiet(() => repair([moved], {
    now: at('2026-07-10T00:00:00Z'),
    tasks: [{ pack: 'claudinite-growth', id: 'a', taskPath: 'packs/claudinite-growth/tasks/a/task.md' }],
  }));
  assert.deepEqual(out.orphaned, [31]);
  assert.ok(out.posted.some((b) => b.includes('packs/claudinite-growth/tasks/a/task.md')), out.posted.join('|'));
  assert.deepEqual(labelsOn(out.added, 31), ['task:status:rejected']);
});

// --- rule G, the ended park (#1468) -------------------------------------------

const parked = (number, target, kind = 'approval') => workItem(number, [`task:status:needs-human-${kind}`],
  { body: `packs/p/tasks/a/task.md\n\nEnds-when: #${target} closed\n` });

test('a park whose pull request MERGED closes done — the work landed', async () => {
  const out = await quiet(() => repair([parked(31, 133)], { now: at('2026-07-10T00:00:00Z'), targets: { 133: 'merged' } }));
  assert.deepEqual(out.ended, [31]);
  assert.deepEqual(labelsOn(out.added, 31), [STATUS_DONE]);
  assert.deepEqual(out.patched.filter((p) => p.issue === 31), [{ issue: 31, state: 'closed', state_reason: 'completed' }]);
});

test('a park whose pull request was closed unmerged closes rejected — nothing landed', async () => {
  const out = await quiet(() => repair([parked(32, 134)], { now: at('2026-07-10T00:00:00Z'), targets: { 134: 'closed' } }));
  assert.deepEqual(out.ended, [32]);
  assert.deepEqual(labelsOn(out.added, 32), [STATUS_REJECTED]);
  assert.deepEqual(out.patched.filter((p) => p.issue === 32), [{ issue: 32, state: 'closed', state_reason: 'not_planned' }]);
});

test('a park whose pull request is still open is the machinery working', async () => {
  const out = await quiet(() => repair([parked(33, 135)], { now: at('2026-07-10T00:00:00Z'), targets: {} }));
  assert.deepEqual(out.ended, []);
  assert.deepEqual(labelsOn(out.added, 33), []);
  assert.deepEqual(out.patched, []);
});

// A DONE TERMINAL CLOSES THE ISSUE IT STANDS ON, marked or filed (#1489): a merged
// target means the work landed, and there is nothing left on the issue for the
// person who opened it to do.
const markedPark = (number, endsWhen, status = 'task:status:needs-human-approval') => ({
  ...workItem(number, ['task:origin:ad-hoc', status]),
  title: 'Please do the thing',
  body: `please do the thing\n\n<!-- claudinite-item -->\npacks/p/tasks/a/task.md\n\nEnds-when: #${endsWhen} closed\n<!-- /claudinite-item -->\n`,
});

test('an ended park on a marked issue whose PR merged closes it done', async () => {
  const out = await quiet(() => repair([markedPark(34, 136)], { now: at('2026-07-10T00:00:00Z'), targets: { 136: 'merged' } }));
  assert.deepEqual(out.ended, [34]);
  assert.deepEqual(labelsOn(out.added, 34), [STATUS_DONE]);
  assert.deepEqual(out.patched, [{ issue: 34, state: 'closed', state_reason: 'completed' }]);
});

// AND SO DOES A REJECTED ONE (owner, 2026-09-06, #1835). A pull request closed
// unmerged is the person's answer already given: the task was rejected, and the item
// says so and closes, rather than sitting open for somebody to read and close by hand.
test('an ended park on a marked issue whose PR was closed unmerged closes it rejected', async () => {
  const out = await quiet(() => repair([markedPark(35, 137)], { now: at('2026-07-10T00:00:00Z'), targets: { 137: 'closed' } }));
  assert.deepEqual(out.ended, [35]);
  assert.deepEqual(labelsOn(out.added, 35), [STATUS_REJECTED]);
  assert.deepEqual(out.patched, [{ issue: 35, state: 'closed', state_reason: 'not_planned' }]);
});

// Rule H at the shell (#1526): the close, and nothing else — no label is written,
// because the terminal standing on the item was already the right one.
test('an unclosed terminal is closed at its own outcome, with no relabelling', async () => {
  const out = await quiet(() => repair([
    workItem(81, [STATUS_DONE], { created: '2026-07-01T00:00:00Z' }),
    workItem(82, [STATUS_REJECTED], { created: '2026-07-01T00:00:00Z' }),
  ], { now: at('2026-07-02T00:00:00Z') }));
  assert.deepEqual(out.unclosed, [81, 82]);
  assert.deepEqual(labelsOn(out.added, 81), [], 'the status was already right — only the close was missing');
  assert.deepEqual(
    out.patched.filter((p) => [81, 82].includes(p.issue)).map((p) => [p.issue, p.state_reason]),
    [[81, 'completed'], [82, 'not_planned']],
    'a done terminal completed, a rejected one not_planned',
  );
});

// The same second read the stateless repair makes, for the same reason: the
// converge may have reached its own close in the seconds since the snapshot.
test('a terminal that closed itself between the read and the write is left alone', async () => {
  const item = workItem(83, [STATUS_DONE], { created: '2026-07-01T00:00:00Z' });
  const out = await quiet(() => repair([item], {
    now: at('2026-07-02T00:00:00Z'), fresh: { 83: { ...item, state: 'closed' } },
  }));
  assert.deepEqual(out.unclosed, []);
  assert.deepEqual(out.patched.filter((p) => p.issue === 83), []);
});

// --- rule I, the abandoned failure park (#1785) -------------------------------

const HEAD_TASKS = [{ pack: 'p', id: 'a', taskPath: 'packs/p/tasks/a/task.md', decl: { trigger: 'schedule', preconditions: ['due:daily'] } }];

// Not "releases the lane": since #1725 a park is not live, so the lane was never
// held unless the task declares `last-run-not-failed`. What the close buys is that
// the report stops standing unread, and for a task that does declare it, the next
// occurrence can run again.
test('a failure park nobody has answered past the bound closes obsolete', async () => {
  const out = await quiet(() => repair([
    workItem(41, ['needs-human', 'origin:schedule'], { created: '2026-07-01T00:00:00Z' }),
  ], { now: at('2026-08-01T00:00:00Z'), tasks: HEAD_TASKS }));
  assert.deepEqual(out.abandoned, [41]);
  assert.deepEqual(labelsOn(out.added, 41), [STATUS_REJECTED]);
  assert.deepEqual(out.patched.filter((p) => p.issue === 41).map((p) => p.state_reason), ['not_planned']);
});

// The park a person is still working through: their touch resets the bound, and the
// second read is what sees it.
test('a park touched between the sweep\'s read and its write is left standing', async () => {
  const item = workItem(42, [STATUS_NEEDS_HUMAN_FAILURE], { created: '2026-07-01T00:00:00Z' });
  const out = await quiet(() => repair([item], {
    now: at('2026-08-01T00:00:00Z'), tasks: HEAD_TASKS,
    fresh: { 42: { ...item, updated_at: '2026-07-31T00:00:00Z' } },
  }));
  assert.deepEqual(out.abandoned, []);
  assert.deepEqual(out.patched.filter((p) => p.issue === 42), []);
});

// Rule E names the run that answered the park, which says more than the clock does.
test('a superseded park is closed as superseded, not as abandoned', async () => {
  const done = { ...workItem(99, [STATUS_DONE]), state: 'closed', closed_at: '2026-07-20T00:00:00Z', updated_at: '2026-07-20T00:00:00Z' };
  const out = await quiet(() => repair([workItem(43, [STATUS_NEEDS_HUMAN_FAILURE], { created: '2026-07-01T00:00:00Z' })], {
    now: at('2026-08-01T00:00:00Z'), tasks: HEAD_TASKS, closed: [done],
  }));
  assert.deepEqual(out.superseded, [43]);
  assert.deepEqual(out.abandoned, []);
});

// --- what the one pass buys ---------------------------------------------------

// THREADING is what makes one pass one pass. A park this phase closes must read as
// closed to everything after it in the same run, or the cadence terms judge a world
// one write out of date and the occurrence that close just freed waits a whole tick.
test('an ended park is threaded closed, so the ask judges this run\'s world', () => {
  const items = [parked(62, 140)];
  const plan = planRepair({ items, tasks: HEAD_TASKS, now: at('2026-08-01T00:00:00Z'), resolutionOf: () => 'merged' });
  assert.equal(items[0].state, 'closed');
  assert.ok(items[0].labels.includes(STATUS_DONE));
  assert.ok(!items[0].labels.some((l) => String(l).startsWith('task:status:needs-human')), 'the park it left is gone');
  assert.deepEqual([...plan.threadedClosed ?? plan.closed], [62]);
});

// …and the opposite, which is the safety half: a verdict the shell may still decline
// on its fresh read is NOT threaded, because the plan would then hand the ask a world
// the run never wrote. One tick of lag on a bound already measured in days.
test('a confirm-gated verdict is not threaded, because the write may not happen', () => {
  const items = [workItem(61, [STATUS_NEEDS_HUMAN_FAILURE], { created: '2026-07-01T00:00:00Z' })];
  const plan = planRepair({ items, tasks: HEAD_TASKS, now: at('2026-08-01T00:00:00Z') });
  assert.deepEqual(plan.ops.map((o) => o.rule), ['abandoned']);
  assert.equal(items[0].state, 'open');
  assert.deepEqual([...plan.closed], []);
});

// The stuck-dependency rule is COMMENT ONLY on purpose — the item still proceeds
// the moment its blockers resolve — so it must not park anything, and it must not
// stop a rule above from acting on the same item.
test('a stuck dependency is surfaced without parking the item', async () => {
  const out = await quiet(() => repair([
    workItem(41, ['task:status:blocked'], { created: '2026-07-01T00:00:00Z', body: 'packs/p/tasks/a/task.md\n\nBlocked-by: #99\n' }),
  ], { now: at('2026-07-10T00:00:00Z'), blockers: { 99: 'open' } }));
  assert.deepEqual(out.stuck, [41]);
  assert.deepEqual(labelsOn(out.added, 41), []);
  assert.deepEqual(out.patched, []);
  assert.ok(out.posted.some((b) => b.includes('#99')), 'the note names what it is waiting on');
});
