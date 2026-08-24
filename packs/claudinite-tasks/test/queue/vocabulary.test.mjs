// THE LABEL VOCABULARY'S DECODE (tasks-dispatch DESIGN §4; the migration of #1119).
// Labels are stored data: an open item wears whatever the engine that filed it
// wrote, and a member converges on its own schedule. So every reader decodes, and
// what these tests pin is that ONE pass maps every spelling ever written straight
// to today's — plus the two places that would silently strand a member if they
// disagreed: the ensure-list (a label that does not exist 422s the write that
// applies it) and the executor workflow's literal event trigger.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BLOCKED, READY, EXECUTING, AGENT, NEEDS_HUMAN,
  TASK_DONE, TASK_OBSOLETE, OUTCOME_DONE, OUTCOME_OBSOLETE, OUTCOME_DELIVERED,
  NEEDS_HUMAN_ACTION, NEEDS_HUMAN_APPROVAL, NEEDS_HUMAN_DECISION, NEEDS_HUMAN_FAILURE,
  STATUS_BLOCKED, STATUS_READY, STATUS_RUNNING_EXECUTOR, STATUS_RUNNING_AGENT,
  STATUS_NEEDS_HUMAN_ACTION, STATUS_NEEDS_HUMAN_APPROVAL, STATUS_NEEDS_HUMAN_DECISION,
  STATUS_NEEDS_HUMAN_FAILURE, STATUS_DONE, STATUS_REJECTED,
  STATUS_LABELS, ORIGIN_LABELS, ORIGIN_PLANNED, ORIGIN_AD_HOC, ORIGIN_GITHUB, ORIGIN_SCHEDULE,
  QUEUE_LABELS, statusOf, statusesOn, isStatus, isParked, parkKindOf, originOf,
  spellingsOf, isBlockingPark, outcomeOf,
} from '../../queue/work-item.mjs';
import { swapStatus, clearStatus } from '../../queue/apply-status.mjs';
import { FAILURE_LABELS } from '../../queue/workflow-failure.mjs';

const item = (...labels) => ({ number: 1, title: '[claudinite-work] basics/task-janitor', state: 'open', labels });

// DESIGN §4's legacy table, in full — the left column is every spelling any fielded
// engine has written, the right is what a reader must see today.
test('every legacy spelling decodes straight to its canonical status', () => {
  for (const [legacy, canonical] of [
    [BLOCKED, STATUS_BLOCKED],
    [READY, STATUS_READY],
    [EXECUTING, STATUS_RUNNING_EXECUTOR],
    [AGENT, STATUS_RUNNING_AGENT],
    [TASK_DONE, STATUS_DONE], [OUTCOME_DONE, STATUS_DONE],
    [TASK_OBSOLETE, STATUS_REJECTED], [OUTCOME_OBSOLETE, STATUS_REJECTED],
  ]) {
    assert.equal(statusOf(item(legacy)), canonical, `${legacy} should read as ${canonical}`);
  }
});

test('a canonical status reads as itself', () => {
  for (const status of STATUS_LABELS) assert.equal(statusOf(item(status)), status);
});

// The legacy park is a PAIR, and the sub-label is what decides the kind.
test('the legacy park pair decodes to the kind its sub-label names', () => {
  for (const [sub, canonical] of [
    [NEEDS_HUMAN_ACTION, STATUS_NEEDS_HUMAN_ACTION],
    [NEEDS_HUMAN_DECISION, STATUS_NEEDS_HUMAN_DECISION],
    [NEEDS_HUMAN_APPROVAL, STATUS_NEEDS_HUMAN_APPROVAL],
    [NEEDS_HUMAN_FAILURE, STATUS_NEEDS_HUMAN_FAILURE],
  ]) {
    assert.equal(statusOf(item(NEEDS_HUMAN, sub)), canonical);
    assert.equal(parkKindOf(item(NEEDS_HUMAN, sub)), canonical.split('needs-human-')[1]);
  }
});

// The compatibility direction the design chooses deliberately, in both directions:
// an OLDER engine's bare park, and a NEWER engine's kind word this one never heard
// of, both hold the lane rather than letting a broken task keep filing work.
test('a park whose kind cannot be decoded reads as failure, and only failure holds the lane', () => {
  assert.equal(statusOf(item(NEEDS_HUMAN)), STATUS_NEEDS_HUMAN_FAILURE);
  assert.equal(statusOf(item('task:needs-human-quantum')), STATUS_NEEDS_HUMAN_FAILURE);
  assert.equal(statusOf(item('task:status:needs-human-quantum')), STATUS_NEEDS_HUMAN_FAILURE);

  assert.equal(isBlockingPark(item(NEEDS_HUMAN)), true);
  assert.equal(isBlockingPark(item(STATUS_NEEDS_HUMAN_FAILURE)), true);
  for (const soft of [STATUS_NEEDS_HUMAN_ACTION, STATUS_NEEDS_HUMAN_DECISION, STATUS_NEEDS_HUMAN_APPROVAL]) {
    assert.equal(isBlockingPark(item(soft)), false, `${soft} is somebody's inbox, not a fault`);
  }
  assert.equal(isBlockingPark(item(NEEDS_HUMAN, NEEDS_HUMAN_APPROVAL)), false);
  assert.equal(isBlockingPark(item(STATUS_READY)), false);
});

// A torn transition can leave a state label beside a park. The queue must read that
// as PARKED — reading it as ready would hand an executor an item a human owns.
test('a park outranks any state label standing beside it', () => {
  assert.equal(statusOf(item(READY, NEEDS_HUMAN, NEEDS_HUMAN_ACTION)), STATUS_NEEDS_HUMAN_ACTION);
  assert.equal(isStatus(item(READY, NEEDS_HUMAN), STATUS_READY), false);
  assert.equal(isParked(item(STATUS_RUNNING_AGENT, STATUS_NEEDS_HUMAN_DECISION)), true);
});

// MID-FLIP, the case the whole two-spelling period turns on: an item filed by the
// old engine and touched by the new one wears both spellings of ONE status. It is
// not torn, and a reader that counted labels rather than statuses would say it was.
test('an item wearing both spellings of one status reads as that one status', () => {
  assert.deepEqual(statusesOn(item(READY, STATUS_READY)), [STATUS_READY]);
  assert.equal(statusOf(item(READY, STATUS_READY)), STATUS_READY);
  assert.deepEqual(statusesOn(item(READY, EXECUTING)).sort(), [STATUS_RUNNING_EXECUTOR, STATUS_READY].sort());
});

test('an item wearing nothing the vocabulary knows has no status at all', () => {
  assert.equal(statusOf(item()), null);
  assert.equal(statusOf(item('area:docs', ORIGIN_SCHEDULE)), null);
  assert.equal(isParked(item()), false);
  assert.equal(parkKindOf(item(STATUS_READY)), null);
});

// The origin is read, never inferred. `origin:schedule` is inert stored data: an
// older engine wrote it, nothing writes it now, and reading it as an origin would
// put a marker nothing maintains back into play.
test('the origin is whichever `task:origin:` label stands, and the retired marker is not one', () => {
  assert.equal(originOf(item(STATUS_READY, ORIGIN_PLANNED)), ORIGIN_PLANNED);
  assert.equal(originOf(item(ORIGIN_AD_HOC)), ORIGIN_AD_HOC);
  assert.equal(originOf(item(ORIGIN_GITHUB)), ORIGIN_GITHUB);
  assert.equal(originOf(item(ORIGIN_SCHEDULE)), null);
  assert.equal(originOf(item(STATUS_READY)), null);
});

// A closed item's terminal write is its outcome whatever else stands on it, in
// every spelling — the fleet's history is what these numbers are counted from.
test('outcomes decode from every spelling, canonical and legacy alike', () => {
  for (const l of [TASK_DONE, OUTCOME_DONE, STATUS_DONE]) assert.equal(outcomeOf(item(l)), 'done');
  for (const l of [TASK_OBSOLETE, OUTCOME_OBSOLETE, STATUS_REJECTED]) assert.equal(outcomeOf(item(l)), 'obsolete');
  assert.equal(outcomeOf(item(OUTCOME_DELIVERED)), 'delivered');
  assert.equal(outcomeOf(item(AGENT, OUTCOME_DONE, NEEDS_HUMAN)), 'done');
  assert.equal(outcomeOf(item(STATUS_READY)), null);
});

// What a transition has to clear. The item may wear any engine's spelling, so a
// swap that named one would leave the other standing — two live statuses, which is
// the torn state the janitor exists to repair.
test('every spelling of a status is what leaving it clears', () => {
  assert.deepEqual(spellingsOf(STATUS_READY).sort(), [READY, STATUS_READY].sort());
  assert.deepEqual(spellingsOf(STATUS_DONE).sort(), [TASK_DONE, OUTCOME_DONE, STATUS_DONE].sort());
  // Leaving a park leaves it entirely: every kind, both shapes, and the bare label.
  const park = spellingsOf(STATUS_NEEDS_HUMAN_APPROVAL);
  for (const l of [NEEDS_HUMAN, NEEDS_HUMAN_ACTION, NEEDS_HUMAN_APPROVAL, NEEDS_HUMAN_DECISION,
    NEEDS_HUMAN_FAILURE, STATUS_NEEDS_HUMAN_FAILURE, STATUS_NEEDS_HUMAN_APPROVAL]) {
    assert.ok(park.includes(l), `a re-queue must clear ${l}`);
  }
});

test('a swap removes both spellings of the status it leaves and adds the one it writes', async () => {
  const removed = []; const added = [];
  const api = {
    removeLabel: async (_gh, _repo, _n, name) => removed.push(name),
    addLabel: async (_gh, _repo, _n, name) => added.push(name),
  };
  await swapStatus(api, null, 'o/r', item(READY), STATUS_READY, EXECUTING);
  assert.deepEqual(removed.sort(), [READY, STATUS_READY].sort());
  assert.deepEqual(added, [EXECUTING]);

  removed.length = 0;
  await clearStatus(api, null, 'o/r', item(STATUS_RUNNING_AGENT), STATUS_RUNNING_AGENT);
  assert.deepEqual(removed.sort(), [AGENT, STATUS_RUNNING_AGENT].sort());
});

// GitHub 422s an attempt to apply a label that does not exist and never creates one
// on demand, so the ensure pass has to know a spelling BEFORE anything writes it —
// and the ensure pass and the flip that starts writing them reach a member in
// separate converges.
test('the ensure-list carries every canonical status and origin, ahead of any writer', () => {
  const ensured = new Set(QUEUE_LABELS.map((l) => l.name));
  for (const name of [...STATUS_LABELS, ...ORIGIN_LABELS]) {
    assert.ok(ensured.has(name), `${name} must be ensured or the write that applies it 422s`);
  }
  // And the legacy spellings stay ensured: they are what this engine still writes.
  for (const name of [BLOCKED, READY, EXECUTING, AGENT, NEEDS_HUMAN, TASK_DONE, TASK_OBSOLETE]) {
    assert.ok(ensured.has(name), `${name} is still written, so it must still be ensured`);
  }
});

// A workflow's event trigger names label strings LITERALLY — nothing there decodes
// — so this is the one surface where both vocabularies must appear at once. Read
// from the real files, both copies: the stub every member is given, and the canon's
// own hand-maintained copy, which no converge writes.
test('the executor triggers on both ready spellings, in the stub and in the canon\'s own copy', () => {
  for (const path of ['packs/claudinite-tasks/stubs/claudinite-executor.yml', '.github/workflows/claudinite-executor.yml']) {
    const yml = readFileSync(path, 'utf8');
    for (const spelling of [STATUS_READY, READY, 'task:urgent']) {
      assert.ok(yml.includes(`github.event.label.name == '${spelling}'`), `${path} must trigger on ${spelling}`);
    }
  }
});

// A workflow reporting its own failure has an origin like anything else, and it is
// a break to diagnose — the one park lane that holds the task's lane.
test('a workflow-failure issue is filed with its origin and its park', () => {
  const names = FAILURE_LABELS.map((l) => l.name);
  for (const label of [ORIGIN_GITHUB, STATUS_NEEDS_HUMAN_FAILURE]) {
    assert.ok(names.includes(label), `a failure issue must be labelled ${label}`);
  }
  // Ensured, not merely applied: GitHub 422s the write that applies an unknown
  // label, and a first-run failure may precede any other label-ensure.
  for (const { name, color, description } of FAILURE_LABELS) {
    assert.ok(name && color && description, `${name} must be ensured to spec, not applied bare`);
  }
});

// --- what the decode is FOR: the machinery reacting to either spelling ---------
// The unit tests above pin the map. These pin the consequence — that an item filed
// in canonical spellings is picked up, reclaimed, escalated and repaired exactly as
// one filed in legacy spellings is, which is the whole promise of the migration
// running with fielded engines still writing the old words.

import { pickOrder } from '../../queue/executor.mjs';
import { planSchedulerRun } from '../../queue/scheduler-run.mjs';
import { staleReadyItems, deadAgentItems, statelessItems } from '../../queue/janitor-rules.mjs';
import { isReleasable } from '../../queue/readiness.mjs';

const workItem = (n, labels, extra = {}) => ({
  number: n, title: '[claudinite-work] p/daily1', state: 'open', body: 'packs/p/tasks/daily1/task.md\n',
  created_at: '2026-08-14T04:10:00Z', updated_at: '2026-08-14T04:15:00Z', labels, ...extra,
});

test('the executor picks up an item readied in either spelling, and yields to a running twin in either', () => {
  assert.deepEqual(pickOrder([workItem(1, [READY]), workItem(2, [STATUS_READY])]).map((i) => i.number).sort(), [1, 2]);
  // The same-title mutex: one task, one execution at a time, and the running twin
  // is recognised whichever engine wrote its label.
  assert.deepEqual(pickOrder([workItem(1, [STATUS_READY]), workItem(2, [EXECUTING])]), []);
  assert.deepEqual(pickOrder([workItem(1, [READY]), workItem(2, [STATUS_RUNNING_AGENT])]), []);
  // A DIFFERENT title is a different run, so it is pickable beside either.
  const other = { ...workItem(3, [STATUS_RUNNING_EXECUTOR]), title: '[claudinite-work] p/daily2' };
  assert.deepEqual(pickOrder([workItem(1, [READY]), other]).map((i) => i.number), [1]);
  // And a parked item is never picked, in either shape.
  assert.deepEqual(pickOrder([workItem(1, [STATUS_NEEDS_HUMAN_FAILURE]), workItem(2, [READY, NEEDS_HUMAN])]), []);
});

test('the scheduler run reclaims a dead claim written in either spelling', async () => {
  const tasks = [{ pack: 'p', id: 'daily1', taskPath: 'packs/p/tasks/daily1/task.md', decl: { id: 'daily1', frequency: 'daily' } }];
  for (const label of [EXECUTING, STATUS_RUNNING_EXECUTOR]) {
    const { ops } = await planSchedulerRun({
      tasks, items: [workItem(1, [label])], now: '2026-08-14T05:30:00Z',
      schedule: { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 },
    });
    assert.equal(ops.filter((o) => o.kind === 'reclaim').length, 1, `${label} should be reclaimable`);
  }
});

test('the janitor\'s rules read either spelling', () => {
  const late = '2026-08-20T00:00:00Z';
  for (const label of [READY, STATUS_READY]) {
    assert.equal(staleReadyItems([workItem(1, [label])], late).length, 1, `${label} should go stale`);
  }
  for (const label of [AGENT, STATUS_RUNNING_AGENT]) {
    assert.equal(deadAgentItems([workItem(1, [label])], late).length, 1, `${label} should hit the leash`);
  }
  // A park is nobody's to escalate again, whichever shape it wears.
  assert.equal(staleReadyItems([workItem(1, [READY, NEEDS_HUMAN])], late).length, 0);
  assert.equal(deadAgentItems([workItem(1, [STATUS_NEEDS_HUMAN_DECISION])], late).length, 0);
  // Rule D reads the absence of a status, so an item wearing only an origin — or
  // only the retired schedule marker — is the torn-swap leaving it is meant to find.
  assert.deepEqual(statelessItems([workItem(1, [ORIGIN_PLANNED]), workItem(2, [STATUS_BLOCKED])]).map((i) => i.number), [1]);
});

test('a blocked item is releasable in either spelling, and a parked one never is', () => {
  const body = 'packs/p/tasks/daily1/task.md\n\nBlocked-by: #7\n';
  for (const label of [BLOCKED, STATUS_BLOCKED]) {
    assert.equal(isReleasable(workItem(1, [label], { body }), { stateOf: () => 'closed' }), true, label);
  }
  assert.equal(isReleasable(workItem(1, [STATUS_BLOCKED, NEEDS_HUMAN], { body }), { stateOf: () => 'closed' }), false);
});

// --- a marked issue's identity -------------------------------------------------
// Its title is the person's own, so everything that used to read the task off the
// title reads it off the worker path the machine block names instead. What this
// pins is that the parse covers both homes a task can have, and that the janitor
// rule which would otherwise skip every request run does not.

import { taskIdFromPath, withMachineBlock } from '../../queue/work-item.mjs';
import { staleReadyComment } from '../../queue/janitor-rules.mjs';

test('a worker path names its task, in both homes and under either root', () => {
  assert.deepEqual(taskIdFromPath('packs/basics/tasks/task-janitor/task.md'), { pack: 'basics', task: 'task-janitor' });
  assert.deepEqual(taskIdFromPath('.claudinite/shared/packs/basics/tasks/task-janitor/task.md'), { pack: 'basics', task: 'task-janitor' });
  assert.deepEqual(taskIdFromPath('engine/scheduler/queue/tasks/implement-request/task.md'), { pack: 'engine', task: 'implement-request' });
  assert.deepEqual(taskIdFromPath('.claudinite/shared/engine/scheduler/queue/tasks/implement-request/task.md'), { pack: 'engine', task: 'implement-request' });
  assert.equal(taskIdFromPath('please do the thing'), null);
  assert.equal(taskIdFromPath(null), null);
});

// The built-in's home moved with the surface (#1317), and the path a NEW item carries
// is derived from where the module actually sits — so the pack's own `queue/tasks/`
// root has to decode as well as the engine's did. It is the same task under the same
// wire id: the fallback exists for a MARKED ISSUE, whose title is the person's own
// words and carries no id, so a path that fails to decode leaves every new request
// unattributable to the janitor, uncounted by usage-fold, and blank on the dashboard —
// with nothing going red anywhere.
test('the built-in task decodes from its new home as well as its legacy one', async () => {
  const { requestTaskPath } = await import('../../built-in-tasks.mjs');
  for (const path of [
    'packs/claudinite-tasks/queue/tasks/implement-request/task.md',
    '.claudinite/shared/packs/claudinite-tasks/queue/tasks/implement-request/task.md',
  ]) assert.deepEqual(taskIdFromPath(path), { pack: 'engine', task: 'implement-request' }, path);

  // …and the path the code actually mints is one of them, rather than a third shape
  // this test happens to spell correctly.
  const CANON = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
  assert.deepEqual(taskIdFromPath(requestTaskPath(CANON)), { pack: 'engine', task: 'implement-request' },
    `the minted path ${requestTaskPath(CANON)} must decode`);
});

test('a marked issue that nobody picks up still goes stale', () => {
  const marked = {
    number: 9, title: 'A thing to do', state: 'open', labels: [STATUS_READY, ORIGIN_AD_HOC],
    created_at: '2026-08-14T04:10:00Z', updated_at: '2026-08-14T04:10:00Z',
    body: withMachineBlock('Do it.\n', 'engine/scheduler/queue/tasks/implement-request/task.md\n\nRequest: #9'),
  };
  assert.deepEqual(staleReadyItems([marked], '2026-08-20T00:00:00Z').map((i) => i.number), [9]);
  assert.match(staleReadyComment(marked), /engine\/implement-request/);
});
