import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORK_PREFIX, workItemTitle, parseWorkItemTitle, isWorkItemTitle,
  workItemBody, parseWorkItemBody, withNotBefore, withSection,
  QUEUE_LABELS, STATE_LABELS, labelNames, hasLabel,
} from '../../../engine/scheduler/queue/work-item.mjs';

// The title is the identity's readable half; the ISSUE NUMBER is the identity.
// Nothing ever encodes a date here — that was the slot grammar.
test('a work-item title round-trips, with and without a qualifier', () => {
  assert.equal(workItemTitle({ pack: 'core', task: 'update' }), '[claudinite-work] core/update');
  assert.deepEqual(parseWorkItemTitle('[claudinite-work] core/update'), { pack: 'core', task: 'update', qualifier: null });
  assert.equal(workItemTitle({ pack: 'sheepdog', task: 'fleet-baseline', qualifier: 'member-repo-x' }),
    '[claudinite-work] sheepdog/fleet-baseline member-repo-x');
  assert.deepEqual(parseWorkItemTitle('[claudinite-work] sheepdog/fleet-baseline member-repo-x'),
    { pack: 'sheepdog', task: 'fleet-baseline', qualifier: 'member-repo-x' });
});

test('the slot mechanism\'s titles are invisible here — the two families are disjoint (S29)', () => {
  assert.equal(parseWorkItemTitle('[claudinite-task] core/update d2026-08-14'), null);
  assert.equal(isWorkItemTitle('Some ordinary issue'), false);
  assert.equal(isWorkItemTitle(`${WORK_PREFIX} basics/task-janitor`), true);
});

test('the body carries the task path first and the two scheduling fields', () => {
  const body = workItemBody({
    taskPath: 'packs/core/tasks/update/task.md',
    notBefore: '2026-08-15T02:00:00.000Z',
    blockedBy: [812, 813],
    context: ['only the mount', 'nothing else'],
  });
  assert.match(body.split('\n')[0], /^packs\/core\/tasks\/update\/task\.md$/);
  assert.deepEqual(parseWorkItemBody(body), {
    taskPath: 'packs/core/tasks/update/task.md',
    notBefore: '2026-08-15T02:00:00.000Z',
    blockedBy: [812, 813],
  });
  assert.match(body, /### Context\n- only the mount\n- nothing else/);
});

test('absence is meaningful: no fields parse to null and an empty list', () => {
  const body = workItemBody({ taskPath: 'packs/x/tasks/y/task.md' });
  assert.deepEqual(parseWorkItemBody(body), { taskPath: 'packs/x/tasks/y/task.md', notBefore: null, blockedBy: [] });
});

// The roll's whole mechanic: stamp the next anchor onto an item that already
// carries a Context somebody else wrote.
test('withNotBefore stamps in place, inserts under the task path, and clears', () => {
  const fresh = workItemBody({ taskPath: 'p/t/task.md', context: ['scope'] });
  const stamped = withNotBefore(fresh, '2026-08-15T04:00:00.000Z');
  assert.equal(parseWorkItemBody(stamped).notBefore, '2026-08-15T04:00:00.000Z');
  assert.match(stamped, /### Context\n- scope/);            // the Context survives untouched

  const restamped = withNotBefore(stamped, '2026-08-16T04:00:00.000Z');
  assert.equal(parseWorkItemBody(restamped).notBefore, '2026-08-16T04:00:00.000Z');
  assert.equal((restamped.match(/^Not-before:/gm) ?? []).length, 1);

  assert.equal(parseWorkItemBody(withNotBefore(restamped, null)).notBefore, null);
});

test('withSection appends code_work\'s delivered artifacts without disturbing the body', () => {
  const body = workItemBody({ taskPath: 'p/t/task.md' });
  const out = withSection(body, 'Delivered by code_work', ['PR: #12 (open)']);
  assert.match(out, /### Delivered by code_work\n\n- PR: #12 \(open\)/);
  assert.equal(parseWorkItemBody(out).taskPath, 'p/t/task.md');
});

test('every label the mechanism applies is ensured, and the four states are named', () => {
  const names = QUEUE_LABELS.map((l) => l.name);
  for (const l of STATE_LABELS) assert.ok(names.includes(l), `${l} must be ensurable`);
  for (const l of ['origin:schedule', 'needs-human', 'outcome:done', 'outcome:delivered', 'outcome:obsolete', 'task:urgent']) {
    assert.ok(names.includes(l), `${l} must be ensurable`);
  }
  // Every label carries a colour and a description, so nothing is ever minted
  // grey-and-undocumented by being applied.
  for (const l of QUEUE_LABELS) assert.ok(l.color && l.description, `${l.name} needs a colour and a description`);
});

test('labels are read from either shape GitHub returns them in', () => {
  assert.deepEqual(labelNames({ labels: ['task:ready', { name: 'origin:schedule' }] }), ['task:ready', 'origin:schedule']);
  assert.equal(hasLabel({ labels: [{ name: 'task:ready' }] }, 'task:ready'), true);
  assert.equal(hasLabel({ labels: [] }, 'task:ready'), false);
});

test('a section is replaced in place, so a body round-tripped twice has one of each', () => {
  // #879, found on the queue's first live hand-off: every standing item is born with
  // a `### Context`, the hand-off writes Context again, and an append left TWO — with
  // the session told to read "the Context section", singular. The section it reads
  // first was the tick's birth note; the binding scope was in the other one.
  const born = workItemBody({
    taskPath: 'packs/p/tasks/t/task.md',
    context: ['born blocked until its first anchor'],
  });
  assert.equal(born.match(/^### Context$/gm).length, 1);

  const handed = withSection(born, 'Context', ['Issues to triage: #1, #2.']);
  assert.equal(handed.match(/^### Context$/gm).length, 1, 'one Context, not two');
  assert.match(handed, /Issues to triage/, 'and it is the new scope that survives');
  assert.doesNotMatch(handed, /born blocked/, 'the replaced scope is gone, not stacked above');

  // The growth half: a re-queued item runs the hand-off again.
  const twice = withSection(handed, 'Context', ['Issues to triage: #3.']);
  assert.equal(twice.match(/^### Context$/gm).length, 1, 'still one after a second round');
  assert.match(twice, /#3/);

  // A heading not yet present still appends — replacing must not cost the append.
  const delivered = withSection(twice, 'Delivered by code_work', ['a branch']);
  assert.equal(delivered.match(/^### Delivered by code_work$/gm).length, 1);
  assert.equal(delivered.match(/^### Context$/gm).length, 1, 'and the neighbour is untouched');

  // Position is held, not migrated to the bottom: a replaced section stays where the
  // reader learned it, and every later section survives intact.
  const again = withSection(delivered, 'Context', ['Issues to triage: #4.']);
  assert.ok(again.indexOf('### Context') < again.indexOf('### Delivered by code_work'),
    'the replaced section keeps its position');
  assert.match(again, /- a branch/, 'and the section after it is not swallowed');

  // The fields above the first heading are untouched by any of it.
  assert.match(again, /^packs\/p\/tasks\/t\/task\.md$/m);
});
