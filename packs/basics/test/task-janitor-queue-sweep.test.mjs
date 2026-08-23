import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sweepQueue } from '../tasks/task-janitor/queue-sweep.mjs';
import {
  NEEDS_HUMAN, NEEDS_HUMAN_ACTION, NEEDS_HUMAN_DECISION, HANDOFF_MARKER,
} from '../../../engine/scheduler/queue/work-item.mjs';

// A fake GitHub that answers the two reads the sweep makes and records the writes.
// `labelsAdded` is what the assertions turn on: a park is TWO writes now — the
// state the machine reads, and what the human is being asked for.
// `now` answers the per-issue re-read the stateless repair makes, keyed by number,
// so a test can say "this item looks different by the time the sweep writes".
function janitorGh(issues, comments = {}, now = {}) {
  const added = [];
  const gh = async (path, { method = 'GET', body } = {}) => {
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
  return { gh, added };
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

const labelsOn = (added, issue) => added.filter((a) => a.issue === issue).flatMap((a) => a.labels);

test('a stale-ready item parks at action — the lane is not being drained, and the fix is outside the item', async () => {
  const { gh, added } = janitorGh([workItem(11, ['task:ready'], { created: '2026-07-01T00:00:00Z' })]);
  const out = await quiet(() => sweepQueue(gh, 'o/r', at('2026-07-10T00:00:00Z')));
  assert.deepEqual(out.staleReady, [11]);
  assert.deepEqual(labelsOn(added, 11), [NEEDS_HUMAN, NEEDS_HUMAN_ACTION]);
});

test('a dead agent claim parks at decision — what the dead session left behind decides whether it re-queues', async () => {
  const { gh, added } = janitorGh(
    [workItem(21, ['task:agent'], { created: '2026-07-01T00:00:00Z' })],
    { 21: [{ id: 1, body: `${HANDOFF_MARKER}\nHanded off by executor \`E1\`.`, created_at: '2026-07-01T00:00:00Z' }] },
  );
  const out = await quiet(() => sweepQueue(gh, 'o/r', at('2026-07-02T00:00:00Z')));
  assert.deepEqual(out.deadAgents, [21]);
  assert.deepEqual(labelsOn(added, 21), [NEEDS_HUMAN, NEEDS_HUMAN_DECISION]);
});

test('a stateless item parks at decision — which state it should have had is a judgement', async () => {
  const { gh, added } = janitorGh([workItem(31, [])]);
  const out = await quiet(() => sweepQueue(gh, 'o/r', at('2026-07-02T00:00:00Z')));
  assert.deepEqual(out.stateless, [31]);
  assert.deepEqual(labelsOn(added, 31), [NEEDS_HUMAN, NEEDS_HUMAN_DECISION]);
});

// The stuck-dependency rule is COMMENT ONLY on purpose — the item still proceeds
// the moment its blockers resolve — so it must not park anything.
test('a stuck dependency is surfaced without parking the item', async () => {
  const { gh, added } = janitorGh([
    workItem(41, ['task:blocked'], { created: '2026-07-01T00:00:00Z', body: 'packs/p/tasks/a/task.md\n\nBlocked-by: #99\n' }),
    workItem(99, ['task:blocked'], { created: '2026-07-01T00:00:00Z' }),
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
    41: { ...torn, state: 'closed', labels: [{ name: 'task:done' }] },
  });
  const out = await quiet(() => sweepQueue(gh, 'o/r', at('2026-07-02T00:00:00Z')));
  assert.deepEqual(out.stateless, [], 'nothing was repaired, because nothing was broken');
  assert.deepEqual(labelsOn(added, 41), [], 'and no triage label reached finished work');
});

// The narrower half of the same race: still open, but a state label has landed.
test('an item that acquired its state label before the write is left alone', async () => {
  const torn = workItem(42, []);
  const { gh, added } = janitorGh([torn], {}, { 42: { ...torn, labels: [{ name: 'task:executing' }] } });
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
  assert.deepEqual(labelsOn(added, 43), [NEEDS_HUMAN, NEEDS_HUMAN_DECISION]);
});
