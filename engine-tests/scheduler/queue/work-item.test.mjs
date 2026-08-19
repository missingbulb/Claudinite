import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORK_PREFIX, workItemTitle, parseWorkItemTitle, isWorkItemTitle,
  workItemBody, parseWorkItemBody, withNotBefore, withSection,
  QUEUE_LABELS, STATE_LABELS, labelNames, hasLabel,
  DELIVERED_HEADING, LEGACY_DELIVERED_HEADINGS,
  TRIAGE_LABELS, NEEDS_HUMAN_ACTION, NEEDS_HUMAN_DECISION, NEEDS_HUMAN_APPROVAL,
  NEEDS_HUMAN_FAILURE, triageLabelFor, isBlockingPark,
  TASK_DONE, TASK_OBSOLETE, OUTCOME_DONE, OUTCOME_DELIVERED, OUTCOME_OBSOLETE, outcomeOf,
  LAST_VERDICT_HEADING, lastVerdictLines, parseLastVerdict,
} from '../../../engine/scheduler/queue/work-item.mjs';

// The title is the identity's readable half; the ISSUE NUMBER is the identity.
// Nothing ever encodes a date here — that was the slot grammar.
test('a work-item title round-trips, with and without a qualifier', () => {
  assert.equal(workItemTitle({ pack: 'claudinite-lifecycle', task: 'update' }), '[claudinite-work] claudinite-lifecycle/update');
  assert.deepEqual(parseWorkItemTitle('[claudinite-work] claudinite-lifecycle/update'), { pack: 'claudinite-lifecycle', task: 'update', qualifier: null });
  assert.equal(workItemTitle({ pack: 'sheepdog', task: 'fleet-baseline', qualifier: 'member-repo-x' }),
    '[claudinite-work] sheepdog/fleet-baseline member-repo-x');
  assert.deepEqual(parseWorkItemTitle('[claudinite-work] sheepdog/fleet-baseline member-repo-x'),
    { pack: 'sheepdog', task: 'fleet-baseline', qualifier: 'member-repo-x' });
});

test('the slot mechanism\'s titles are invisible here — the two families are disjoint (S29)', () => {
  assert.equal(parseWorkItemTitle('[claudinite-task] claudinite-lifecycle/update d2026-08-14'), null);
  assert.equal(isWorkItemTitle('Some ordinary issue'), false);
  assert.equal(isWorkItemTitle(`${WORK_PREFIX} basics/task-janitor`), true);
});

test('the body carries the task path first and the two scheduling fields', () => {
  const body = workItemBody({
    taskPath: 'packs/claudinite-lifecycle/tasks/update/task.md',
    notBefore: '2026-08-15T02:00:00.000Z',
    blockedBy: [812, 813],
    context: ['only the mount', 'nothing else'],
  });
  assert.match(body.split('\n')[0], /^packs\/claudinite-lifecycle\/tasks\/update\/task\.md$/);
  assert.deepEqual(parseWorkItemBody(body), {
    taskPath: 'packs/claudinite-lifecycle/tasks/update/task.md',
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
  const out = withSection(body, 'Delivered by code-work', ['PR: #12 (open)']);
  assert.match(out, /### Delivered by code-work\n\n- PR: #12 \(open\)/);
  assert.equal(parseWorkItemBody(out).taskPath, 'p/t/task.md');
});

test('every label the mechanism applies is ensured, and the four states are named', () => {
  const names = QUEUE_LABELS.map((l) => l.name);
  for (const l of STATE_LABELS) assert.ok(names.includes(l), `${l} must be ensurable`);
  for (const l of ['needs-human', 'task:done', 'task:obsolete', 'outcome:delivered', 'task:urgent']) {
    assert.ok(names.includes(l), `${l} must be ensurable`);
  }
  // The retired origin marker is NOT ensured: nothing applies it any more, and a
  // label the mechanism keeps minting is one a reader would keep expecting to mean
  // something (§15.26).
  assert.ok(!names.includes('origin:schedule'), 'the retired origin marker is not ensured');
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
  const delivered = withSection(twice, 'Delivered by code-work', ['a branch']);
  assert.equal(delivered.match(/^### Delivered by code-work$/gm).length, 1);
  assert.equal(delivered.match(/^### Context$/gm).length, 1, 'and the neighbour is untouched');

  // Position is held, not migrated to the bottom: a replaced section stays where the
  // reader learned it, and every later section survives intact.
  const again = withSection(delivered, 'Context', ['Issues to triage: #4.']);
  assert.ok(again.indexOf('### Context') < again.indexOf('### Delivered by code-work'),
    'the replaced section keeps its position');
  assert.match(again, /- a branch/, 'and the section after it is not swallowed');

  // The fields above the first heading are untouched by any of it.
  assert.match(again, /^packs\/p\/tasks\/t\/task\.md$/m);
});


// The delivered section's heading has been renamed twice with the phase. A live work
// item's body carries whichever word was current when its section was first written,
// and a re-entrant run updates that section rather than appending beside it — so the
// heading has to be located by its OLD spellings too, not just today's.
test('a delivered section written under an older heading is updated, not duplicated', () => {
  for (const legacy of LEGACY_DELIVERED_HEADINGS) {
    const body = `task/path\n\nExecute the Claudinite task above.\n\n### ${legacy}\n\n- PR: #12 (open)\n`;
    const out = withSection(body, DELIVERED_HEADING, ['PR: #12 (merged)'], LEGACY_DELIVERED_HEADINGS);
    assert.equal(out.match(/^### Delivered by /gm).length, 1, `${legacy} should leave exactly one delivered section`);
    assert.match(out, /### Delivered by code-work\n\n- PR: #12 \(merged\)/);
    assert.doesNotMatch(out, new RegExp(`### ${legacy}`));
  }
});

// And the ordinary re-entrant case still holds under the constant.
test('withSection is re-entrant under the canonical heading', () => {
  const once = withSection('task/path\n', DELIVERED_HEADING, ['a branch'], LEGACY_DELIVERED_HEADINGS);
  const twice = withSection(once, DELIVERED_HEADING, ['a branch'], LEGACY_DELIVERED_HEADINGS);
  assert.equal(twice.match(/^### Delivered by /gm).length, 1);
});

// --- the triage sub-labels ----------------------------------------------------

test('a kind word maps to its label, and anything unrecognised to failure', () => {
  assert.equal(triageLabelFor('action'), NEEDS_HUMAN_ACTION);
  assert.equal(triageLabelFor('approval'), NEEDS_HUMAN_APPROVAL);
  // A worker that misspells its class has a bug, which is what `failure` means —
  // and so does an engine reading a kind a newer one invented.
  assert.equal(triageLabelFor('urgent'), NEEDS_HUMAN_FAILURE);
  assert.equal(triageLabelFor(undefined), NEEDS_HUMAN_FAILURE);
});

test('only a fault park holds the task\'s lane', () => {
  const at = (...labels) => ({ labels });
  assert.equal(isBlockingPark(at('needs-human', NEEDS_HUMAN_FAILURE)), true);
  // The compatibility case that has to be safe on the way in: everything parked by
  // an engine older than these labels wears the bare state and must keep the lane.
  assert.equal(isBlockingPark(at('needs-human')), true);
  for (const l of [NEEDS_HUMAN_ACTION, NEEDS_HUMAN_DECISION, NEEDS_HUMAN_APPROVAL]) {
    assert.equal(isBlockingPark(at('needs-human', l)), false, l);
  }
  assert.equal(isBlockingPark(at('task:ready')), false);
});

test('every triage label is one the executor guarantees before applying', () => {
  const ensured = new Set(QUEUE_LABELS.map((l) => l.name));
  for (const l of TRIAGE_LABELS) assert.ok(ensured.has(l), l);
});

// --- outcome decoding ------------------------------------------------------------

// The stored-data rename rule, decode side: `task:done`/`task:obsolete` are today's
// spellings (DESIGN §4, §15.25) and every legacy spelling maps STRAIGHT to them —
// including `outcome:delivered`, which nothing writes any more but closed issues
// carry forever.
test('outcomeOf maps every spelling, legacy and current, to the canonical word', () => {
  const at = (...labels) => ({ labels });
  assert.equal(outcomeOf(at(TASK_DONE)), 'done');
  assert.equal(outcomeOf(at(OUTCOME_DONE)), 'done');
  assert.equal(outcomeOf(at(OUTCOME_DELIVERED)), 'delivered');
  assert.equal(outcomeOf(at(TASK_OBSOLETE)), 'obsolete');
  assert.equal(outcomeOf(at(OUTCOME_OBSOLETE)), 'obsolete');
  assert.equal(outcomeOf(at('task:ready', 'needs-human')), null);
  assert.equal(outcomeOf(at()), null);
  assert.equal(outcomeOf(undefined), null);
});

// --- the roll's Last verdict section -----------------------------------------------

// Written on every no-go roll and read back by anything that answers "why didn't it
// run" (the dashboard above all). Serializer and parser live together so the shape
// has one home.
test('parseLastVerdict reads back exactly what lastVerdictLines wrote', () => {
  const body = withSection('task/path\n', LAST_VERDICT_HEADING,
    lastVerdictLines({ at: '2026-08-16T05:00:00Z', reason: 'no PRs in window', until: '2026-08-17T04:00:00Z' }));
  const v = parseLastVerdict(body);
  assert.equal(v.at, '2026-08-16T05:00:00Z');
  assert.equal(v.reason, 'no PRs in window');
  assert.equal(v.until, '2026-08-17T04:00:00Z');
});

test('parseLastVerdict is null on a body that never rolled, and tolerates a missing wake', () => {
  assert.equal(parseLastVerdict('task/path\n\nExecute the Claudinite task above.\n'), null);
  const body = withSection('task/path\n', LAST_VERDICT_HEADING,
    lastVerdictLines({ at: '2026-08-16T05:00:00Z', reason: 'gone', until: null }));
  const v = parseLastVerdict(body);
  assert.equal(v.reason, 'gone');
  assert.equal(v.until, null);
});

// A reason containing an em-dash of its own must not truncate the parse.
test('parseLastVerdict keeps a reason that carries the separator', () => {
  const body = withSection('task/path\n', LAST_VERDICT_HEADING,
    lastVerdictLines({ at: '2026-08-16T05:00:00Z', reason: 'quiet — nothing moved', until: '2026-08-17T04:00:00Z' }));
  assert.equal(parseLastVerdict(body).reason, 'quiet — nothing moved');
});
