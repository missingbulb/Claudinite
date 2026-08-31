import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sweepQueue } from '../../tasks/task-janitor/queue-sweep.mjs';
import {
  NEEDS_HUMAN_ACTION, NEEDS_HUMAN_DECISION, NEEDS_HUMAN_FAILURE, HANDOFF_MARKER, TASK_DONE, TASK_OBSOLETE,
  parkKindOf,
} from '../../queue/work-item.mjs';
import { SUPERSEDABLE_PARKS } from '../../queue/janitor-rules.mjs';

// A fake GitHub that answers the two reads the sweep makes and records the writes.
// `labelsAdded` is what the assertions turn on: a park is TWO writes now — the
// state the machine reads, and what the human is being asked for.
// `now` answers the per-issue re-read the stateless repair makes, keyed by number,
// so a test can say "this item looks different by the time the sweep writes".
function janitorGh(issues, comments = {}, now = {}) {
  const added = [];
  const patched = [];
  const gh = async (path, { method = 'GET', body } = {}) => {
    if (method === 'PATCH' && /\/issues\/\d+$/.test(path)) {
      patched.push({ issue: Number(path.match(/issues\/(\d+)/)[1]), ...body });
    }
    if (method === 'GET' && path.startsWith(`/repos/o/r/issues?state=open`)) {
      return { status: 200, json: path.includes('page=1') ? issues : [] };
    }
    if (method === 'GET' && /\/issues\/\d+$/.test(path)) {
      const n = Number(path.match(/issues\/(\d+)/)[1]);
      return { status: 200, json: now[n] ?? issues.find((i) => i.number === n) ?? {} };
    }
    if (method === 'GET' && /\/issues\/\d+\/comments/.test(path)) {
      return { status: 200, json: comments[Number(path.match(/issues\/(\d+)/)[1])] ?? [] };
    }
    if (method === 'POST' && /\/issues\/\d+\/labels$/.test(path)) {
      added.push({ issue: Number(path.match(/issues\/(\d+)/)[1]), labels: body.labels });
    }
    return { status: method === 'POST' ? 201 : 200, json: {} };
  };
  return { gh, added, patched };
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

test('a stale-ready item parks at action — the lane is not being drained, and the fix is outside the item', async () => {
  const { gh, added } = janitorGh([workItem(11, ['task:status:waiting-for-executor'], { created: '2026-07-01T00:00:00Z' })]);
  const out = await quiet(() => sweepQueue(gh, 'o/r', at('2026-07-10T00:00:00Z')));
  assert.deepEqual(out.staleReady, [11]);
  assert.deepEqual(labelsOn(added, 11), [NEEDS_HUMAN_ACTION]);
});

// A dead session is the machine noticing a corpse, not a person deciding anything.
// The kind matters twice over: `failure` is the only park a later clean run can
// supersede (rule E), and the only one that holds the task's lane so the generator
// stops filing a fresh occurrence every anchor behind a run nobody has looked at.
test('a dead agent claim parks at failure — nothing here is a human\'s choice', async () => {
  const { gh, added } = janitorGh(
    [workItem(21, ['task:status:running-agent'], { created: '2026-07-01T00:00:00Z' })],
    { 21: [{ id: 1, body: `${HANDOFF_MARKER}\nHanded off by executor \`E1\`.`, created_at: '2026-07-01T00:00:00Z' }] },
  );
  const out = await quiet(() => sweepQueue(gh, 'o/r', at('2026-07-02T00:00:00Z')));
  assert.deepEqual(out.deadAgents, [21]);
  assert.deepEqual(labelsOn(added, 21), [NEEDS_HUMAN_FAILURE]);
});

// The reason the kind was wrong: rule E is what drains these once the thing that
// broke is fixed, and it only ever looks at SUPERSEDABLE_PARKS. A rule B park
// outside that set accumulates forever however many clean runs follow it.
test('the kind rule B parks at is one rule E can supersede', () => {
  assert.ok(SUPERSEDABLE_PARKS.includes(parkKindOf({ labels: [{ name: NEEDS_HUMAN_FAILURE }] })));
});

// Same reading as rule B: an item off the state machine is a label swap that TORE,
// which the machine noticed. Nobody decided it, so a later clean run may clear it.
test('a stateless item parks at failure — a torn swap is breakage, not a judgement', async () => {
  const { gh, added } = janitorGh([workItem(31, [])]);
  const out = await quiet(() => sweepQueue(gh, 'o/r', at('2026-07-02T00:00:00Z')));
  assert.deepEqual(out.stateless, [31]);
  assert.deepEqual(labelsOn(added, 31), [NEEDS_HUMAN_FAILURE]);
});

// The stuck-dependency rule is COMMENT ONLY on purpose — the item still proceeds
// the moment its blockers resolve — so it must not park anything.
test('a stuck dependency is surfaced without parking the item', async () => {
  const { gh, added } = janitorGh([
    workItem(41, ['task:status:blocked'], { created: '2026-07-01T00:00:00Z', body: 'packs/p/tasks/a/task.md\n\nBlocked-by: #99\n' }),
    workItem(99, ['task:status:blocked'], { created: '2026-07-01T00:00:00Z' }),
  ]);
  const out = await quiet(() => sweepQueue(gh, 'o/r', at('2026-07-10T00:00:00Z')));
  assert.deepEqual(out.stuck, [41]);
  assert.deepEqual(labelsOn(added, 41), []);
});

// #1104, exactly. A stateless item is what an item in MID-SWAP looks like, not only
// one whose swap tore — and the open set the sweep rules over is a snapshot taken
// seconds earlier. Escalating from it files `needs-human` against work an executor
// has already finished, which is a false triage signal a person then has to read.
test('an item that settled between the sweep\'s read and its write is left alone', async () => {
  const torn = workItem(41, []);
  const { gh, added } = janitorGh([torn], {}, {
    41: { ...torn, state: 'closed', labels: [{ name: 'task:status:done' }] },
  });
  const out = await quiet(() => sweepQueue(gh, 'o/r', at('2026-07-02T00:00:00Z')));
  assert.deepEqual(out.stateless, [], 'nothing was repaired, because nothing was broken');
  assert.deepEqual(labelsOn(added, 41), [], 'and no triage label reached finished work');
});

// The narrower half of the same race: still open, but a state label has landed.
test('an item that acquired its state label before the write is left alone', async () => {
  const torn = workItem(42, []);
  const { gh, added } = janitorGh([torn], {}, { 42: { ...torn, labels: [{ name: 'task:status:running-executor' }] } });
  const out = await quiet(() => sweepQueue(gh, 'o/r', at('2026-07-02T00:00:00Z')));
  assert.deepEqual(out.stateless, []);
  assert.deepEqual(labelsOn(added, 42), []);
});

// …and the genuine tear still parks, which is what stops the confirm read from
// simply disabling the rule.
test('an item still stateless on the second read is repaired', async () => {
  const { gh, added } = janitorGh([workItem(43, [])]);
  const out = await quiet(() => sweepQueue(gh, 'o/r', at('2026-07-02T00:00:00Z')));
  assert.deepEqual(out.stateless, [43]);
  assert.deepEqual(labelsOn(added, 43), [NEEDS_HUMAN_FAILURE]);
});

// The wiring the pure rules cannot cover: rule F now picks its comment from WHERE the
// task lives, so the sweep has to carry that through. A park naming a live task at a
// path it has moved off closes obsolete, and the comment says where it is now (#1461).
test('a park naming its task at a path it has moved off closes obsolete, naming the new path', async () => {
  const moved = {
    ...workItem(31, ['task:status:needs-human-failure']),
    body: 'packs/grow_with_claudinite/tasks/a/task.md\n',
    title: '[claudinite-work] grow_with_claudinite/a',
  };
  const { gh, added } = janitorGh([moved]);
  const posted = [];
  const spy = async (path, opts = {}) => {
    if (opts.method === 'POST' && /\/issues\/\d+\/comments$/.test(path)) posted.push(opts.body.body);
    return gh(path, opts);
  };
  const out = await quiet(() => sweepQueue(spy, 'o/r', at('2026-07-10T00:00:00Z'), {
    tasks: [{ pack: 'claudinite-growth', id: 'a', taskPath: 'packs/claudinite-growth/tasks/a/task.md' }],
  }));
  assert.deepEqual(out.orphaned, [31]);
  assert.ok(posted.some((b) => b.includes('packs/claudinite-growth/tasks/a/task.md')), posted.join('|'));
  assert.deepEqual(labelsOn(added, 31), ['task:status:rejected']);
});

// --- rule G, the ended park (#1468) -------------------------------------------

const parked = (number, target, kind = 'approval') => workItem(number, [`task:status:needs-human-${kind}`],
  { body: `packs/p/tasks/a/task.md\n\nEnds-when: #${target} closed\n` });

const pr = (number, { merged = false, state = 'closed' } = {}) => ({
  number, state, pull_request: merged ? { merged_at: '2026-07-05T00:00:00Z' } : {},
});

test('a park whose pull request MERGED closes done — the work landed', async () => {
  const { gh, added, patched } = janitorGh([parked(31, 133)], {}, { 133: pr(133, { merged: true }) });
  const out = await quiet(() => sweepQueue(gh, 'o/r', at('2026-07-10T00:00:00Z')));
  assert.deepEqual(out.ended, [31]);
  assert.deepEqual(labelsOn(added, 31), [TASK_DONE]);
  assert.deepEqual(patched.filter((p) => p.issue === 31), [{ issue: 31, state: 'closed', state_reason: 'completed' }]);
});

test('a park whose pull request was closed unmerged closes rejected — nothing landed', async () => {
  const { gh, added, patched } = janitorGh([parked(32, 134)], {}, { 134: pr(134) });
  const out = await quiet(() => sweepQueue(gh, 'o/r', at('2026-07-10T00:00:00Z')));
  assert.deepEqual(out.ended, [32]);
  assert.deepEqual(labelsOn(added, 32), [TASK_OBSOLETE]);
  assert.deepEqual(patched.filter((p) => p.issue === 32), [{ issue: 32, state: 'closed', state_reason: 'not_planned' }]);
});

test('a park whose pull request is still open is the machinery working', async () => {
  const { gh, added, patched } = janitorGh([parked(33, 135)], {}, { 135: pr(135, { state: 'open' }) });
  const out = await quiet(() => sweepQueue(gh, 'o/r', at('2026-07-10T00:00:00Z')));
  assert.deepEqual(out.ended, []);
  assert.deepEqual(labelsOn(added, 33), []);
  assert.deepEqual(patched, []);
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
  const { gh, added, patched } = janitorGh([markedPark(34, 136)], {}, { 136: pr(136, { merged: true }) });
  const out = await quiet(() => sweepQueue(gh, 'o/r', at('2026-07-10T00:00:00Z')));
  assert.deepEqual(out.ended, [34]);
  assert.deepEqual(labelsOn(added, 34), [TASK_DONE]);
  assert.deepEqual(patched, [{ issue: 34, state: 'closed', state_reason: 'completed' }]);
});

// The contrast: nothing landed, so the person's own issue keeps standing — the
// rejected terminal on a marked issue is still theirs to close.
test('an ended park on a marked issue whose PR was closed unmerged stays open', async () => {
  const { gh, added, patched } = janitorGh([markedPark(35, 137)], {}, { 137: pr(137) });
  const out = await quiet(() => sweepQueue(gh, 'o/r', at('2026-07-10T00:00:00Z')));
  assert.deepEqual(out.ended, [35]);
  assert.deepEqual(labelsOn(added, 35), [TASK_OBSOLETE]);
  assert.deepEqual(patched, [], 'nothing landed, so the issue is the author\'s to close');
});

// Rule H at the shell (#1526): the close, and nothing else — no label is written,
// because the terminal standing on the item was already the right one.
test('an unclosed terminal is closed at its own outcome, with no relabelling', async () => {
  const { gh, added, patched } = janitorGh([
    workItem(81, [TASK_DONE], { created: '2026-07-01T00:00:00Z' }),
    workItem(82, [TASK_OBSOLETE], { created: '2026-07-01T00:00:00Z' }),
  ]);
  const out = await quiet(() => sweepQueue(gh, 'o/r', at('2026-07-02T00:00:00Z')));
  assert.deepEqual(out.unclosed, [81, 82]);
  assert.deepEqual(labelsOn(added, 81), [], 'the status was already right — only the close was missing');
  assert.deepEqual(
    patched.filter((p) => [81, 82].includes(p.issue)).map((p) => [p.issue, p.state_reason]),
    [[81, 'completed'], [82, 'not_planned']],
    'a done terminal completed, a rejected one not_planned',
  );
});

// The same second read the stateless repair makes, for the same reason: the
// converge may have reached its own close in the seconds since the snapshot.
test('a terminal that closed itself between the read and the write is left alone', async () => {
  const item = workItem(83, [TASK_DONE], { created: '2026-07-01T00:00:00Z' });
  const { gh, patched } = janitorGh([item], {}, { 83: { ...item, state: 'closed' } });
  const out = await quiet(() => sweepQueue(gh, 'o/r', at('2026-07-02T00:00:00Z')));
  assert.deepEqual(out.unclosed, []);
  assert.deepEqual(patched.filter((p) => p.issue === 83), []);
});
