import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORK_PREFIX, workItemTitle, parseWorkItemTitle, isWorkItemTitle,
  workItemBody, parseWorkItemBody, withNotBefore, withEndsWhen, withTarget, withSection,
  QUEUE_LABELS, STATE_LABELS, labelNames, hasLabel,
  DELIVERED_HEADING, LEGACY_DELIVERED_HEADINGS,
  TRIAGE_LABELS, NEEDS_HUMAN_ACTION, NEEDS_HUMAN_DECISION, NEEDS_HUMAN_APPROVAL,
  NEEDS_HUMAN_FAILURE, triageLabelFor, isBlockingPark,
  TASK_DONE, TASK_OBSOLETE, OUTCOME_DONE, OUTCOME_DELIVERED, OUTCOME_OBSOLETE, outcomeOf,
  LAST_VERDICT_HEADING, lastVerdictLines, parseLastVerdict,
} from '../../queue/work-item.mjs';
import { planSchedulerRun } from '../../queue/scheduler-run.mjs';
import { convergeOps, OUTCOMES } from '../../queue/converge-item.mjs';

// The title is the identity's readable half; the ISSUE NUMBER is the identity.
// Nothing ever encodes a date here — that was the slot grammar.
test('a work-item title round-trips, with and without a qualifier', () => {
  assert.equal(workItemTitle({ pack: 'claudinite-lifecycle', task: 'update' }), '[claudinite-work] claudinite-lifecycle/update');
  assert.deepEqual(parseWorkItemTitle('[claudinite-work] claudinite-lifecycle/update'), { pack: 'claudinite-lifecycle', task: 'update', qualifier: null });
  assert.equal(workItemTitle({ pack: 'claudinite-fleet-sheepdog', task: 'fleet-baseline', qualifier: 'member-repo-x' }),
    '[claudinite-work] claudinite-fleet-sheepdog/fleet-baseline member-repo-x');
  assert.deepEqual(parseWorkItemTitle('[claudinite-work] claudinite-fleet-sheepdog/fleet-baseline member-repo-x'),
    { pack: 'claudinite-fleet-sheepdog', task: 'fleet-baseline', qualifier: 'member-repo-x' });
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
    request: null,
    model: null,
    merge: null,
    endsWhen: null,
    targetBranch: null,
    targetPr: null,
    supersedes: [],
  });
  assert.match(body, /### Context\n- only the mount\n- nothing else/);
});

test('absence is meaningful: no fields parse to null and an empty list', () => {
  const body = workItemBody({ taskPath: 'packs/x/tasks/y/task.md' });
  assert.deepEqual(parseWorkItemBody(body), {
    taskPath: 'packs/x/tasks/y/task.md', notBefore: null, blockedBy: [], request: null, model: null, merge: null,
    endsWhen: null, targetBranch: null, targetPr: null, supersedes: [],
  });
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

// A park's end condition is stamped onto an item that already ran, so everything
// its run wrote must survive the stamp (#1468).
test('withEndsWhen stamps a park\'s end condition once, under the task path', () => {
  const ran = withSection(workItemBody({ taskPath: 'p/t/task.md', context: ['scope'] }),
    DELIVERED_HEADING, ['PR: #133 (open)']);
  const stamped = withEndsWhen(ran, 133);
  assert.equal(parseWorkItemBody(stamped).endsWhen, 133);
  assert.match(stamped, /### Context\n- scope/);
  assert.match(stamped, /PR: #133 \(open\)/);
  assert.equal(stamped.split('\n')[0], 'p/t/task.md', 'the task path stays the first line');

  // A converge that runs twice must leave one end, not two.
  const again = withEndsWhen(stamped, 140);
  assert.equal(parseWorkItemBody(again).endsWhen, 140);
  assert.equal((again.match(/^Ends-when:/gm) ?? []).length, 1);
});

// THE TARGET (DESIGN §6.4b): the executor decides which branch and pull request a
// run works on and stamps it on the item at hand-off, so the agent reads it where
// it reads everything else and never chooses its own. Same text surgery as the
// other fields — the Context and the Delivered section belong to whoever wrote them.
test('withTarget stamps the branch, the pull request and the superseded set, replacing what was there', () => {
  const ran = withSection(workItemBody({ taskPath: 'p/t/task.md', context: ['scope'] }), DELIVERED_HEADING, ['Branch: `x`']);
  const amend = withTarget(ran, { mode: 'amend', branch: 'claudinite/p/t/2026-09-04-ab12', pr: 41, supersedes: [] });
  const fields = parseWorkItemBody(amend);
  assert.equal(fields.targetBranch, 'claudinite/p/t/2026-09-04-ab12');
  assert.equal(fields.targetPr, 41);
  assert.deepEqual(fields.supersedes, []);
  assert.match(amend, /### Context\n- scope/);
  assert.match(amend, /Branch: `x`/);
  assert.equal(amend.split('\n')[0], 'p/t/task.md');

  // A re-pick re-resolves: the second stamp replaces the first rather than adding lines.
  const fresh = withTarget(amend, { mode: 'fresh', branch: 'claudinite/p/t/2026-09-05-cd34', pr: null, supersedes: [41, 40] });
  const again = parseWorkItemBody(fresh);
  assert.equal(again.targetBranch, 'claudinite/p/t/2026-09-05-cd34');
  assert.equal(again.targetPr, null, 'a fresh target names no pull request');
  assert.deepEqual(again.supersedes, [41, 40]);
  assert.equal((fresh.match(/^Target-branch:/gm) ?? []).length, 1);
  assert.equal((fresh.match(/^Target-pr:/gm) ?? []).length, 0);

  // No target at all clears every line, and a body that never had one is untouched.
  const none = withTarget(fresh, { mode: 'none', branch: null, pr: null, supersedes: [] });
  assert.deepEqual([parseWorkItemBody(none).targetBranch, parseWorkItemBody(none).targetPr, parseWorkItemBody(none).supersedes], [null, null, []]);
  assert.equal(withTarget(ran, { mode: 'none', branch: null, pr: null, supersedes: [] }), ran);
});

test('the target fields land in a marked issue\'s machine block, never its prose', () => {
  const marked = 'Please do the thing.\n\n<!-- claudinite-item -->\npacks/p/tasks/a/task.md\n\nRequest: #7\n<!-- /claudinite-item -->\n';
  const stamped = withTarget(marked, { mode: 'fresh', branch: 'claudinite/p/a/2026-09-04-ef56', pr: null, supersedes: [2] });
  assert.equal(parseWorkItemBody(stamped).targetBranch, 'claudinite/p/a/2026-09-04-ef56');
  assert.deepEqual(parseWorkItemBody(stamped).supersedes, [2]);
  assert.ok(stamped.startsWith('Please do the thing.\n'), 'the person\'s prose is untouched');
  assert.equal(parseWorkItemBody(stamped).request, 7);
});

// The fencing every behaviour-defining field here gets: what the machinery cannot
// evaluate reads as absent, never as satisfied.
test('parseWorkItemBody fences the end condition to the one grammar it knows', () => {
  assert.equal(parseWorkItemBody('p/t.md\n\nEnds-when: #133 closed\n').endsWhen, 133);
  assert.equal(parseWorkItemBody('p/t.md\n\nEnds-when: #133 merged\n').endsWhen, null);
  assert.equal(parseWorkItemBody('p/t.md\n\nEnds-when: whenever Bob says so\n').endsWhen, null);
  assert.equal(parseWorkItemBody('p/t.md\n').endsWhen, null);
});

test('withSection appends code_work\'s delivered artifacts without disturbing the body', () => {
  const body = workItemBody({ taskPath: 'p/t/task.md' });
  const out = withSection(body, 'Delivered by code-work', ['PR: #12 (open)']);
  assert.match(out, /### Delivered by code-work\n\n- PR: #12 \(open\)/);
  assert.equal(parseWorkItemBody(out).taskPath, 'p/t/task.md');
});

// GitHub 422s the write that applies a label it does not know, so every label the
// mechanism writes has to be in the set it ensures first — read off the writers.
test('every label the scheduler run and a convergence apply is one the queue ensures', async () => {
  const ensured = new Set(QUEUE_LABELS.map((l) => l.name));
  const written = [];
  const { ops } = await planSchedulerRun({
    tasks: [{ pack: 'p', id: 'daily1', taskPath: 'packs/p/tasks/daily1/task.md', decl: { id: 'daily1', frequency: 'daily' } }],
    items: [], now: '2026-08-14T10:00:00Z', schedule: { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 },
  });
  for (const op of ops) if (op.kind === 'create') written.push(...op.labels);
  const held = { number: 7, title: '[claudinite-work] p/a', state: 'open', labels: ['task:status:running-agent'], body: 'packs/p/tasks/a/task.md\n' };
  for (const outcome of Object.keys(OUTCOMES)) {
    for (const op of convergeOps(held, { issue: 7, outcome, summary: 's', pr: 9 })) if (op.kind === 'addLabel') written.push(op.name);
  }
  assert.ok(written.length >= 6, 'the writers wrote something');
  for (const l of written) assert.ok(ensured.has(l), `${l} is applied but never ensured`);
  for (const l of STATE_LABELS) assert.ok(ensured.has(l), `${l} must be ensurable`);
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
  // first was the scheduler run's birth note; the binding scope was in the other one.
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
