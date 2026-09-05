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
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BLOCKED, READY, EXECUTING, AGENT, NEEDS_HUMAN,
  LEGACY_BLOCKED, LEGACY_READY, LEGACY_EXECUTING, LEGACY_AGENT,
  LEGACY_TASK_DONE, LEGACY_TASK_OBSOLETE,
  TASK_DONE, TASK_OBSOLETE, OUTCOME_DONE, OUTCOME_OBSOLETE, OUTCOME_DELIVERED,
  NEEDS_HUMAN_ACTION, NEEDS_HUMAN_APPROVAL, NEEDS_HUMAN_DECISION, NEEDS_HUMAN_FAILURE,
  STATUS_BLOCKED, STATUS_READY, STATUS_RUNNING_EXECUTOR, STATUS_RUNNING_AGENT,
  STATUS_NEEDS_HUMAN_ACTION, STATUS_NEEDS_HUMAN_APPROVAL, STATUS_NEEDS_HUMAN_DECISION,
  STATUS_NEEDS_HUMAN_FAILURE, STATUS_DONE, STATUS_REJECTED,
  STATUS_LABELS, ORIGIN_LABELS, ORIGIN_PLANNED, ORIGIN_AD_HOC, ORIGIN_GITHUB, ORIGIN_SCHEDULE,
  QUEUE_LABELS, statusOf, statusesOn, isStatus, isParked, parkKindOf, originOf,
  spellingsOf, isBlockingPark, outcomeOf, triageLabelFor, TRIAGE_LABELS, requeueHint,
} from '../../queue/work-item.mjs';
import { swapStatus, clearStatus } from '../../queue/apply-status.mjs';
import { convergeOps, OUTCOMES } from '../../queue/converge-item.mjs';
import { reportWorkflowFailure } from '../../queue/workflow-failure.mjs';

const item = (...labels) => ({ number: 1, title: '[claudinite-work] basics/task-janitor', state: 'open', labels });

// DESIGN §4's legacy table, in full — the left column is every spelling any fielded
// engine has written, the right is what a reader must see today.
test('every legacy spelling decodes straight to its canonical status', () => {
  for (const [legacy, canonical] of [
    [LEGACY_BLOCKED, STATUS_BLOCKED],
    [LEGACY_READY, STATUS_READY],
    [LEGACY_EXECUTING, STATUS_RUNNING_EXECUTOR],
    [LEGACY_AGENT, STATUS_RUNNING_AGENT],
    [LEGACY_TASK_DONE, STATUS_DONE], [OUTCOME_DONE, STATUS_DONE],
    [LEGACY_TASK_OBSOLETE, STATUS_REJECTED], [OUTCOME_OBSOLETE, STATUS_REJECTED],
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
  assert.deepEqual(spellingsOf(STATUS_READY).sort(), [LEGACY_READY, STATUS_READY].sort());
  assert.deepEqual(spellingsOf(STATUS_DONE).sort(), [LEGACY_TASK_DONE, OUTCOME_DONE, STATUS_DONE].sort());
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
  await swapStatus(api, null, 'o/r', item(LEGACY_READY), STATUS_READY, EXECUTING);
  assert.deepEqual(removed.sort(), [LEGACY_READY, STATUS_READY].sort());
  assert.deepEqual(added, [EXECUTING]);

  removed.length = 0;
  await clearStatus(api, null, 'o/r', item(STATUS_RUNNING_AGENT), STATUS_RUNNING_AGENT);
  assert.deepEqual(removed.sort(), [LEGACY_AGENT, STATUS_RUNNING_AGENT].sort());
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
  // And the legacy spellings stay ensured: nothing writes them, but open items wear
  // them and deleting a label strips it from every issue that carries it.
  for (const name of [LEGACY_BLOCKED, LEGACY_READY, LEGACY_EXECUTING, LEGACY_AGENT,
    NEEDS_HUMAN, LEGACY_TASK_DONE, LEGACY_TASK_OBSOLETE, OUTCOME_DELIVERED]) {
    assert.ok(ensured.has(name), `${name} is worn by open items, so it must stay ensured`);
  }
});

// A workflow's event trigger names label strings LITERALLY — nothing there decodes.
// It carried both vocabularies while some fielded engine still wrote the legacy one;
// every member now stamps a claudinite-tasks past the write-side flip, so the legacy
// trigger is gone and its absence is what this pins. Read from the real files, both
// copies: the stub every member is given, and the canon's own hand-maintained copy,
// which no converge writes.
test('the executor triggers on the ready spelling the engine writes, and on no other', () => {
  for (const path of ['packs/claudinite-tasks/stubs/claudinite-executor.yml', '.github/workflows/claudinite-executor.yml']) {
    const yml = readFileSync(path, 'utf8');
    for (const spelling of [STATUS_READY, 'task:urgent']) {
      assert.ok(yml.includes(`github.event.label.name == '${spelling}'`), `${path} must trigger on ${spelling}`);
    }
    assert.ok(!yml.includes(`'${LEGACY_READY}'`), `${path} must not still trigger on ${LEGACY_READY}, which nothing writes`);
  }
});

// A workflow reporting its own failure has an origin like anything else, and it is
// a break to diagnose — the one park lane that holds the task's lane. Driven through
// the reporter and read back through the queue's own decoders.
test('a workflow-failure issue is filed wearing the platform origin and a lane-holding park', async () => {
  let filed = null;
  const gh = async (path, opts = {}) => {
    if (path.startsWith('/search/issues')) return { status: 200, json: { items: [] } };
    if (/\/issues$/.test(path) && opts.method === 'POST') { filed = opts.body; return { status: 201, json: { number: 9 } }; }
    return { status: 201, json: {} };
  };
  await reportWorkflowFailure(gh, 'o/r', { title: 'It broke', body: 'why' });
  const issue = { labels: filed.labels };
  assert.equal(originOf(issue), ORIGIN_GITHUB);
  assert.equal(statusOf(issue), STATUS_NEEDS_HUMAN_FAILURE);
  assert.equal(isBlockingPark(issue), true, 'a break to diagnose holds the lane');
});

// --- what the decode is FOR: the machinery reacting to either spelling ---------
// The unit tests above pin the map. These pin the consequence — that an item filed
// in canonical spellings is picked up, reclaimed, escalated and repaired exactly as
// one filed in legacy spellings is, which is the whole promise of the migration
// running with fielded engines still writing the old words.

import { pickOrder } from '../../queue/executor.mjs';
import { planSchedulerRun } from '../../queue/scheduler-run.mjs';
import { staleReadyItems, deadAgentItems, statelessItems, statelessComment } from '../../queue/janitor-rules.mjs';
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
import { LEGACY_BUILT_IN_TASK_PATH, LEGACY_BUILT_IN_TASK_PATH_MOUNTED } from '../legacy-protocol.mjs';

test('a worker path names its task, in both homes and under either root', () => {
  assert.deepEqual(taskIdFromPath('packs/basics/tasks/task-janitor/task.md'), { pack: 'basics', task: 'task-janitor' });
  assert.deepEqual(taskIdFromPath('.claudinite/shared/packs/basics/tasks/task-janitor/task.md'), { pack: 'basics', task: 'task-janitor' });
  assert.deepEqual(taskIdFromPath(LEGACY_BUILT_IN_TASK_PATH), { pack: 'engine', task: 'implement-request' });
  assert.deepEqual(taskIdFromPath(LEGACY_BUILT_IN_TASK_PATH_MOUNTED), { pack: 'engine', task: 'implement-request' });
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
    body: withMachineBlock('Do it.\n', `${LEGACY_BUILT_IN_TASK_PATH}\n\nRequest: #9`),
  };
  assert.deepEqual(staleReadyItems([marked], '2026-08-20T00:00:00Z').map((i) => i.number), [9]);
  assert.match(staleReadyComment(marked), /engine\/implement-request/);
});

// --- the write side, after the flip --------------------------------------------
// The read side above says every spelling is understood. This says which one is
// WRITTEN — the half a member sees on its issues, and the half that has to move
// exactly once for the fleet to converge on one vocabulary (#1119).

test('the engine writes canonical spellings, and only canonical spellings', async () => {
  // Read off the WRITES, not off the constants: every label the scheduler run files
  // and every label a convergence adds is a canonical status or origin.
  const written = [];
  const { ops } = await planSchedulerRun({
    tasks: [{ pack: 'p', id: 'daily1', taskPath: 'packs/p/tasks/daily1/task.md', decl: { id: 'daily1', frequency: 'daily' } },
      { pack: 'p', id: 'weekly1', taskPath: 'packs/p/tasks/weekly1/task.md', decl: { id: 'weekly1', frequency: 'weekly' } }],
    items: [], now: '2026-08-14T10:00:00Z', schedule: { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 },
  });
  for (const op of ops) if (op.kind === 'create') written.push(...op.labels);
  const held = { number: 7, title: '[claudinite-work] p/a', state: 'open', labels: [STATUS_RUNNING_AGENT], body: 'packs/p/tasks/a/task.md\n' };
  for (const outcome of Object.keys(OUTCOMES)) {
    for (const op of convergeOps(held, { issue: 7, outcome, summary: 's', pr: 9 })) if (op.kind === 'addLabel') written.push(op.name);
  }
  assert.ok(written.length >= 6, 'the writers wrote something');
  for (const name of written) assert.ok([...STATUS_LABELS, ...ORIGIN_LABELS].includes(name), `${name} is not a canonical spelling`);
  // A pack on the old engine writes a legacy label, which every decoder here still reads.
  assert.equal(statusOf(item(LEGACY_BLOCKED)), STATUS_BLOCKED);
});

test('a park is one label, and a kind word resolves to it', () => {
  for (const kind of ['action', 'decision', 'approval', 'failure']) {
    assert.equal(triageLabelFor(kind), `task:status:needs-human-${kind}`);
  }
  // A worker that misspells its class has a bug, which is exactly what that lane means.
  assert.equal(triageLabelFor('quantum'), STATUS_NEEDS_HUMAN_FAILURE);
  // And nothing writes the bare legacy park any more, though everything reads it.
  assert.equal(TRIAGE_LABELS.every((l) => l.startsWith('task:status:needs-human-')), true);
});

test('the re-queue lever reaches the comment a parked person reads', () => {
  assert.ok(statelessComment().includes(requeueHint), 'the park says how to come back');
  assert.match(requeueHint, new RegExp(STATUS_READY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'and the lever names the label to apply');
});

// THE WRITER-FACING PROSE. A brief is read by an agent at run time and is the only
// thing telling it what to write, so a brief still naming the retired pair asks for
// a torn state the janitor then repairs. Scanned from the tracked tree rather than a
// list, so a new brief is covered the moment it is added.
//
// Three exclusions, each because the legacy spelling is the point there:
//   - `executor.md`, the RETIRED slot mechanism's instructions, frozen for routines
//     nobody has repointed — its vocabulary is that scheme's, not this one's;
//   - every `VERSIONS.md`, a historical record of what each version did;
//   - the sim's scenario-coverage README, whose rows name DESIGN's legacy table.
const PROSE_EXCLUDED = /(^|\/)(VERSIONS\.md$|executor\.md$|test\/sim\/README\.md$)/;
const trackedProse = (pattern) => execFileSync('git', ['ls-files', pattern], { encoding: 'utf8' })
  .split('\n').filter((p) => p && !PROSE_EXCLUDED.test(p));

test('no pack brief tells a writer to spell a status the way nothing writes it', () => {
  // The bare park as a code span — `on_interrupt: 'needs-human'` is a declaration
  // value rather than a label, and does not match.
  const retired = [`\`${NEEDS_HUMAN}\``, ...[LEGACY_BLOCKED, LEGACY_READY, LEGACY_EXECUTING,
    LEGACY_AGENT, LEGACY_TASK_DONE, LEGACY_TASK_OBSOLETE, ORIGIN_SCHEDULE].flatMap((l) => [`\`${l}\``, `${l} `]),
  `\`task:needs-human-`];
  const offences = [];
  for (const path of trackedProse('packs/**/*.md')) {
    const text = readFileSync(path, 'utf8');
    for (const spelling of retired) if (text.includes(spelling)) offences.push(`${path}: ${spelling.trim()}`);
  }
  assert.deepEqual(offences, [], `these briefs name a spelling nothing writes:\n${offences.join('\n')}`);
});

// A check's `fix` line is the sentence the agent acts on, so it states today's
// vocabulary for the same reason a brief does.
test('no check catalog remedy names a status nothing writes', () => {
  // The agent-facing fields, wherever they sit in a catalog's nesting.
  const remedies = (node, out = []) => {
    if (Array.isArray(node)) node.forEach((n) => remedies(n, out));
    else if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (typeof value === 'string' && ['fix', 'failureMessage', 'what'].includes(key)) out.push([key, value]);
        else remedies(value, out);
      }
    }
    return out;
  };
  const offences = [];
  for (const path of trackedProse('packs/*/declared-checks.json')) {
    for (const [field, text] of remedies(JSON.parse(readFileSync(path, 'utf8')))) {
      for (const legacy of [LEGACY_BLOCKED, LEGACY_READY, LEGACY_EXECUTING, LEGACY_AGENT,
        LEGACY_TASK_DONE, LEGACY_TASK_OBSOLETE, ORIGIN_SCHEDULE, NEEDS_HUMAN]) {
        if (new RegExp(`(^|[^:\\w-])${legacy}([^-\\w]|$)`).test(text)) offences.push(`${path} ${field}: ${legacy}`);
      }
    }
  }
  assert.deepEqual(offences, [], `these remedies name a spelling nothing writes:\n${offences.join('\n')}`);
});
