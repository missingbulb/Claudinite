import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSchedulerRun, planWake } from '../../queue/scheduler-run.mjs';
import { mostRecentAnchor, nextAnchor, periodMs } from '../../queue/anchors.mjs';
import { parseWorkItemBody } from '../../queue/work-item.mjs';
import { normalizeTaskDeclaration } from '../../task-contract.mjs';

const SCHEDULE = { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 };

// A task's "when" is its own expression (DESIGN §5): `['due:daily']` is a task on
// the schedule, `[]` one that runs only when somebody asks.
// Through the door, the way a declaration reaches the scheduler in production: the
// loader normalizes at discovery, and `trigger` is derived there for a fixture that
// states none — so a fixture assembling a raw declaration would be testing a shape
// the scheduler is never handed.
const task = (id, preconditions, extra = {}, terms = new Map()) => ({
  pack: 'p', id, taskPath: `packs/p/tasks/${id}/task.md`,
  decl: normalizeTaskDeclaration({ id, preconditions, ...extra }, terms),
  terms,
});
// The ask, as a fixture answers it. `planSchedulerRun` never decides for a task:
// what the task says is the seam's, and a run with a task to ask needs one.
const yes = async () => ({ run: true, reason: 'work exists' });
const no = async () => ({ run: false, reason: 'quiet' });
const askedIds = () => { const seen = []; return { seen, evaluate: async (t) => { seen.push(t.id); return { run: true, reason: 'work exists' }; } }; };

let seq = 900;
const item = ({ task: t, labels, state = 'open', created_at, closed_at = null, updated_at = created_at, body = 'packs/p/tasks/x/task.md\n', qualifier = null }) => ({
  number: seq += 1,
  title: `[claudinite-work] p/${t}${qualifier ? ` ${qualifier}` : ''}`,
  body, state, labels, created_at, closed_at, updated_at,
});

const kinds = (ops, kind) => ops.filter((o) => o.kind === kind);

// --- anchors ------------------------------------------------------------------

test('anchors are the slot schedule\'s instants with none of its identity', () => {
  assert.equal(mostRecentAnchor('daily', SCHEDULE, '2026-08-14T10:00:00Z').toISOString(), '2026-08-14T04:00:00.000Z');
  assert.equal(nextAnchor('daily', SCHEDULE, '2026-08-14T10:00:00Z').toISOString(), '2026-08-15T04:00:00.000Z');
  // The retired spellings no longer resolve (#1234): `LEGACY_FREQUENCIES` is emptied, so the door
  // passes them through and the calendar throws rather than inventing an anchor for a token it
  // does not know. Nothing can reach here carrying one — `validateTaskDeclaration` rejects it at
  // the door, and the fleet's last such declaration moved to `daily` before this landed.
  assert.throws(() => nextAnchor('hourly', SCHEDULE, '2026-08-14T10:37:00Z'), /unknown frequency "hourly"/);
  assert.equal(nextAnchor('weekly', SCHEDULE, '2026-08-14T10:00:00Z').toISOString(), '2026-08-16T04:00:00.000Z');
  // Monthly anchors are not a fixed distance apart — the walk must not overshoot.
  assert.equal(nextAnchor('monthly', SCHEDULE, '2026-08-14T10:00:00Z').toISOString(), '2026-09-01T04:00:00.000Z');
  assert.equal(nextAnchor('monthly', SCHEDULE, '2026-01-31T10:00:00Z').toISOString(), '2026-02-01T04:00:00.000Z');
  assert.equal(mostRecentAnchor('manual', SCHEDULE, '2026-08-14T10:00:00Z'), null);
  assert.equal(periodMs('weekly'), 7 * 86400e3);
});

// --- job 1: ask every task, every run ---------------------------------------------
// The scheduler keeps no state and no calendar: it asks each task on the schedule
// through its own preconditions at every run, files an item on a yes, records a
// no nowhere but the run's own log, and fails OPEN on an ask it cannot decide. The
// cadence — "did I already run this period" — is the task's own term over its run
// history (run-history-terms.test.mjs), never a guard here.

test('a yes files a ready planned item; a no files nothing and is only asked again next run', async () => {
  const yesRun = await planSchedulerRun({ tasks: [task('daily1', ['due:daily'])], items: [], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, evaluate: yes });
  const [create] = kinds(yesRun.ops, 'create');
  assert.deepEqual(create.labels, ['task:origin:planned', 'task:status:waiting-for-executor']);
  assert.equal(parseWorkItemBody(create.body).notBefore, null, 'born ready — there is no window to wait for');
  assert.equal(parseWorkItemBody(create.body).woken, null, 'the schedule asked; nobody woke it');
  assert.deepEqual(yesRun.asked, [{ task: 'p/daily1', verdict: 'go', reason: 'work exists' }]);

  const seen = [];
  const declining = async (t) => { seen.push(t.id); return no(); };
  const first = await planSchedulerRun({ tasks: [task('daily1', ['due:daily'])], items: [], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, evaluate: declining });
  assert.deepEqual(kinds(first.ops, 'create'), [], 'no work, no item');
  assert.deepEqual(first.asked, [{ task: 'p/daily1', verdict: 'no', reason: 'quiet' }]);
  // Nothing remembers the decline: the very next run asks again.
  const second = await planSchedulerRun({ tasks: [task('daily1', ['due:daily'])], items: [], now: '2026-08-14T16:00:00Z', schedule: SCHEDULE, evaluate: declining });
  assert.deepEqual(seen, ['daily1', 'daily1']);
  assert.deepEqual(kinds(second.ops, 'create'), []);
});

test('an ask the scheduler cannot decide fails OPEN: the item is filed and the executor decides', async () => {
  const { ops, asked } = await planSchedulerRun({
    tasks: [task('daily1', ['due:daily'])], items: [], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
    evaluate: async () => ({ error: 'FLEET_GITHUB_TOKEN is not available here' }),
  });
  const [create] = kinds(ops, 'create');
  assert.ok(create, 'never fewer runs because a read failed');
  assert.deepEqual(create.labels, ['task:origin:planned', 'task:status:waiting-for-executor']);
  assert.match(create.body, /could not decide this occurrence \(FLEET_GITHUB_TOKEN/);
  assert.deepEqual(asked, [{ task: 'p/daily1', verdict: 'fail-open', reason: 'FLEET_GITHUB_TOKEN is not available here' }]);
});

test('every task on the schedule is asked, in declaration order; one stating no condition, or one reading the item, never is', async () => {
  const { seen, evaluate } = askedIds();
  const aboutItem = task('request', ['about-the-item'], {}, new Map([['about-the-item', { signals: [], needsItem: true, holds: () => ({ holds: true }) }]]));
  const { ops } = await planSchedulerRun({
    tasks: [task('daily1', ['due:daily']), task('lever', []), task('mover', ['substantive-change']), aboutItem, task('weekly1', ['due:weekly', 'repo-active'])],
    items: [], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, evaluate,
  });
  assert.deepEqual(seen, ['daily1', 'mover', 'weekly1'], 'an unscheduled task runs only from an item somebody created');
  assert.deepEqual(kinds(ops, 'create').map((o) => o.task), ['daily1', 'mover', 'weekly1']);
});

test('a brand-new task is asked at the first run like any other — there is no first-window booking', async () => {
  const { ops } = await planSchedulerRun({ tasks: [task('weeklyish', ['due:weekly'])], items: [], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, evaluate: yes });
  assert.deepEqual(kinds(ops, 'create')[0].labels, ['task:origin:planned', 'task:status:waiting-for-executor']);
});

test('a run with a task to ask and no seam is a fixture that has not said what the task answers', async () => {
  await assert.rejects(planSchedulerRun({ tasks: [task('daily1', ['due:daily'])], items: [], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE }), /no evaluate seam/);
  // …while a run with nothing to ask needs none.
  const { ops } = await planSchedulerRun({ tasks: [task('lever', [])], items: [], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE });
  assert.deepEqual(ops, []);
});

// ONE LIVE ITEM PER TASK — the engine's one invariant of its own.
test('a live standing item suppresses the ask however long it has stood, in every live status', async () => {
  for (const status of ['task:status:blocked', 'task:status:waiting-for-executor', 'task:status:running-executor', 'task:status:running-agent']) {
    const standing = item({ task: 'daily1', labels: ['task:origin:planned', status], created_at: '2026-06-01T04:10:00Z' });
    const { seen, evaluate } = askedIds();
    const { ops } = await planSchedulerRun({ tasks: [task('daily1', ['due:daily'])], items: [standing], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, evaluate });
    assert.deepEqual(seen, [], status);
    assert.equal(kinds(ops, 'create').length, 0, status);
  }
});

test('a parked item is not live: the task is asked beside it, whatever the park\'s kind', async () => {
  // Whether a failed run stops the next one is the task's to say —
  // `last-run-not-failed` in its own expression — and not even a default. The
  // engine files the next occurrence beside the park, and must not then mistake
  // the pair for duplicates.
  for (const park of ['task:status:needs-human-failure', 'task:status:needs-human-approval', 'task:status:needs-human-action', 'task:status:needs-human-decision', 'needs-human']) {
    const parked = item({ task: 'daily1', labels: ['task:origin:planned', park], created_at: '2026-08-13T04:00:00Z' });
    const { seen, evaluate } = askedIds();
    const { ops } = await planSchedulerRun({ tasks: [task('daily1', ['due:daily'])], items: [parked], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, evaluate });
    assert.deepEqual(seen, ['daily1'], park);
    assert.equal(kinds(ops, 'create').length, 1, park);
    assert.deepEqual(kinds(ops, 'dedupe'), [], `${park}: the parked item is not a duplicate of the new one`);
  }
});

test('a closed run is history, not a lane: the task is asked, and the term over that history decides', async () => {
  const ranToday = item({ task: 'daily1', labels: ['task:origin:planned', 'task:status:done'], state: 'closed', created_at: '2026-08-14T04:10:00Z', closed_at: '2026-08-14T04:30:00Z' });
  const { seen, evaluate } = askedIds();
  await planSchedulerRun({ tasks: [task('daily1', ['due:daily'])], items: [ranToday], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, evaluate });
  assert.deepEqual(seen, ['daily1'], 'the scheduler holds no occurrence guard of its own');
});

// F16 — nothing documents that a REST list from another node sees a creation
// seconds old, so the scheduler run assumes a duplicate WILL happen and self-heals first.
test('a duplicate live standing item is closed obsolete, oldest kept (F16)', async () => {
  const a = item({ task: 'daily1', labels: ['task:origin:planned', 'task:status:waiting-for-executor'], created_at: '2026-08-14T04:10:00Z' });
  const b = item({ task: 'daily1', labels: ['task:origin:planned', 'task:status:waiting-for-executor'], created_at: '2026-08-14T04:11:00Z' });
  const { ops } = await planSchedulerRun({ tasks: [task('daily1', ['due:daily'])], items: [a, b], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, evaluate: yes });
  assert.deepEqual(kinds(ops, 'dedupe').map((o) => o.issue), [b.number]);
  assert.equal(kinds(ops, 'create').length, 0, 'the surviving standing item still suppresses the ask');
});

test('ad-hoc items neither suppress nor consume a scheduled occurrence (§3)', async () => {
  // Ad-hoc is STRUCTURAL (§15.26), so both of its shapes are asserted: a qualified
  // item for a scheduled task, and an unscheduled task's item. Neither is in the
  // daily family, so the task is asked and its occurrence filed.
  const fanOut = item({ task: 'daily1', qualifier: 'member-x', labels: ['task:status:waiting-for-executor'], created_at: '2026-08-14T09:00:00Z' });
  const lever = item({ task: 'lever', labels: ['task:status:waiting-for-executor'], created_at: '2026-08-14T09:00:00Z' });
  const { ops } = await planSchedulerRun({
    tasks: [task('daily1', ['due:daily']), task('lever', [])],
    items: [fanOut, lever], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, evaluate: yes,
  });
  const creates = kinds(ops, 'create');
  assert.equal(creates.length, 1);
  assert.equal(creates[0].task, 'daily1', 'the unscheduled task is never asked at all');
});

test('an unqualified live item for a scheduled task IS that task\'s standing item, marker or no marker', async () => {
  const unmarked = item({ task: 'daily1', labels: ['task:status:waiting-for-executor'], created_at: '2026-08-14T04:10:00Z' });
  const { ops } = await planSchedulerRun({ tasks: [task('daily1', ['due:daily'])], items: [unmarked], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, evaluate: yes });
  assert.deepEqual(kinds(ops, 'create'), []);
});

// --- job 2: ready -------------------------------------------------------------

test('a blocked item readies when its time has passed and its blockers have closed', async () => {
  const sleeping = item({
    task: 'daily1', labels: ['origin:schedule', 'task:status:blocked'], created_at: '2026-08-13T04:10:00Z',
    body: 'packs/p/tasks/daily1/task.md\n\nNot-before: 2026-08-14T04:00:00Z\n',
  });
  const early = await planSchedulerRun({ tasks: [], items: [sleeping], now: '2026-08-14T03:00:00Z', schedule: SCHEDULE });
  assert.equal(kinds(early.ops, 'ready').length, 0);
  const due = await planSchedulerRun({ tasks: [], items: [sleeping], now: '2026-08-14T04:10:00Z', schedule: SCHEDULE });
  assert.deepEqual(kinds(due.ops, 'ready').map((o) => o.issue), [sleeping.number]);
});

test('an unreadable or open blocker delays rather than releases', async () => {
  const blocked = item({
    task: 'follow', labels: ['task:status:blocked'], created_at: '2026-08-13T04:10:00Z',
    body: 'packs/p/tasks/follow/task.md\n\nBlocked-by: #500, #501\n',
  });
  const bothOpen = await planSchedulerRun({ tasks: [], items: [blocked], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, stateOf: () => 'open' });
  assert.equal(kinds(bothOpen.ops, 'ready').length, 0);
  const unknown = await planSchedulerRun({ tasks: [], items: [blocked], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, stateOf: () => null });
  assert.equal(kinds(unknown.ops, 'ready').length, 0, 'an unknown blocker is never treated as closed');
  const settled = await planSchedulerRun({ tasks: [], items: [blocked], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, stateOf: () => 'closed' });
  assert.equal(kinds(settled.ops, 'ready').length, 1);
});

test('an item in triage is never readied by the scheduler run — only a human re-queues it', async () => {
  const triage = item({ task: 'daily1', labels: ['origin:schedule', 'task:status:needs-human-decision'], created_at: '2026-08-13T04:10:00Z' });
  const { ops } = await planSchedulerRun({ tasks: [], items: [triage], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE });
  assert.equal(kinds(ops, 'ready').length, 0);
});

// An adopted marked issue keeps the person's own title for life, so every
// title-shaped test misses it — and job 2 is the only site that ever releases a
// blocked item (#1497). The item here is exactly what adoption writes: the person's
// title, the machine block naming the built-in worker, `task:origin:ad-hoc`.
const adhoc = (labels, body) => ({
  number: (seq += 1),
  title: 'Verify in production: the retry re-arm',
  body, state: 'open', labels,
  created_at: '2026-08-13T04:10:00Z', closed_at: null, updated_at: '2026-08-13T04:10:00Z',
});

test('an AD-HOC item sleeping on a passed Not-before is readied like any other', async () => {
  const sleeping = adhoc(
    ['task:origin:ad-hoc', 'task:status:blocked'],
    'packs/claudinite-tasks/queue/tasks/implement-request/task.md\n\nNot-before: 2026-08-14T04:00:00Z\n',
  );
  const early = await planSchedulerRun({ tasks: [], items: [sleeping], now: '2026-08-14T03:00:00Z', schedule: SCHEDULE });
  assert.equal(kinds(early.ops, 'ready').length, 0);
  const due = await planSchedulerRun({ tasks: [], items: [sleeping], now: '2026-08-14T04:10:00Z', schedule: SCHEDULE });
  assert.deepEqual(kinds(due.ops, 'ready').map((o) => o.issue), [sleeping.number],
    'the queue re-adopts nothing here — the item exists, and its hold expired');
});

// --- job 3: reclaim -----------------------------------------------------------

test('a claim silent past the leash is reclaimed to the queue', async () => {
  const stuck = item({ task: 'daily1', labels: ['origin:schedule', 'task:status:running-executor'], created_at: '2026-08-14T04:10:00Z', updated_at: '2026-08-14T04:15:00Z' });
  const early = await planSchedulerRun({ tasks: [task('daily1', ['due:daily'])], items: [stuck], now: '2026-08-14T04:50:00Z', schedule: SCHEDULE });
  assert.equal(kinds(early.ops, 'reclaim').length, 0);
  const late = await planSchedulerRun({ tasks: [task('daily1', ['due:daily'])], items: [stuck], now: '2026-08-14T05:30:00Z', schedule: SCHEDULE });
  assert.deepEqual(kinds(late.ops, 'reclaim').map((o) => o.to), ['task:status:waiting-for-executor']);
});

// The ack-early/ack-late dial: a task that cannot promise a safe re-run is not
// re-queued by a recovery path — at-most-once plus a human.
test('a task declaring on_interrupt: needs-human is reclaimed to triage, not to the queue', async () => {
  const stuck = item({ task: 'oneshot', labels: ['origin:schedule', 'task:status:running-executor'], created_at: '2026-08-14T04:10:00Z', updated_at: '2026-08-14T04:15:00Z' });
  const { ops } = await planSchedulerRun({
    tasks: [task('oneshot', ['due:daily'], { on_interrupt: 'needs-human' })],
    items: [stuck], now: '2026-08-14T05:30:00Z', schedule: SCHEDULE,
  });
  // The kind says what the human is being asked for: whether the interrupted run
  // left anything behind, and so whether this re-queues at all — a decision.
  assert.deepEqual(kinds(ops, 'reclaim').map((o) => o.to), ['task:status:needs-human-decision']);
  assert.match(kinds(ops, 'reclaim')[0].reason, /on_interrupt/);
});

// The task every ad-hoc item runs is `engine/implement-request`, and it is the one
// task in the fleet declaring `needs-human` — so reading the id off the title alone
// would re-queue a code-writing run whose predecessor may have left a branch behind.
test('a dead claim on an ad-hoc item honours the request task\'s on_interrupt', async () => {
  const stuck = adhoc(
    ['task:origin:ad-hoc', 'task:status:running-executor'],
    'packs/claudinite-tasks/queue/tasks/implement-request/task.md\n',
  );
  stuck.updated_at = '2026-08-14T04:15:00Z';
  const { ops } = await planSchedulerRun({
    tasks: [{ pack: 'engine', id: 'implement-request', taskPath: 'packs/claudinite-tasks/queue/tasks/implement-request/task.md', decl: { id: 'implement-request', preconditions: ['request-eligible'], on_interrupt: 'needs-human' }, terms: new Map([['request-eligible', { signals: ['request'], needsItem: true, holds: () => ({ holds: true }) }]]) }],
    items: [stuck], now: '2026-08-14T09:30:00Z', schedule: SCHEDULE,
  });
  assert.deepEqual(kinds(ops, 'reclaim').map((o) => o.to), ['task:status:needs-human-decision']);
});

// --- the forced wake (DESIGN §8, #929) ----------------------------------------
// Forcing across repos: the enforcer dispatches, the member wakes its own item.

const wakeItems = [
  item({ task: 'update', labels: ['task:status:blocked', 'origin:schedule'], created_at: '2026-08-16T00:00:00Z' }),
  item({ task: 'tidy-prs', labels: ['task:status:running-executor', 'origin:schedule'], created_at: '2026-08-16T00:00:00Z' }),
];
const wakeTasks = [task('update', ['due:daily']), task('tidy-prs', ['due:daily'])];

test('a bare task id resolves against the repo\'s own declared packs', () => {
  const { wake, unmatched } = planWake('update', wakeTasks, wakeItems);
  assert.deepEqual(unmatched, []);
  assert.deepEqual(wake, [{ id: 'p/update', issue: wakeItems[0].number }]);
});

test('a pack-qualified id and several ids at once both resolve', () => {
  const { wake } = planWake('p/update', wakeTasks, wakeItems);
  assert.deepEqual(wake, [{ id: 'p/update', issue: wakeItems[0].number }]);
  const both = planWake('update tidy-prs', wakeTasks, wakeItems);
  assert.equal(both.wake.length + both.already.length, 2);
});

test('an id naming nothing is REPORTED, never silently dropped', () => {
  // A fleet-wide force whose report counts only what it woke reads as coverage.
  const { wake, unmatched } = planWake('update nonesuch', wakeTasks, wakeItems);
  assert.equal(wake.length, 1);
  assert.equal(unmatched.length, 1);
  assert.equal(unmatched[0].id, 'nonesuch');
  assert.match(unmatched[0].why, /no declared pack owns/);
});

test('a task whose standing item is CLOSED is forced by minting a new one', () => {
  // The gap is the common case, not an edge: a task that completes closes its item
  // and the next appears only at its anchor, so a daily task has no item for most
  // of the day. A force that reported "nothing to wake" there would fail on most
  // members most of the time — which is exactly what a fleet converge lever cannot do.
  const closed = [item({ task: 'update', labels: [], state: 'closed', created_at: '2026-08-16T00:00:00Z' })];
  const { wake, create, unmatched } = planWake('update', wakeTasks, closed);
  assert.deepEqual(wake, []);
  assert.deepEqual(unmatched, []);
  assert.equal(create.length, 1);
  assert.equal(create[0].id, 'p/update');
  assert.equal(create[0].taskPath, 'packs/p/tasks/update/task.md');
});

test('a task that has never had an item at all is also minted, not refused', () => {
  const { create, unmatched } = planWake('update', wakeTasks, []);
  assert.deepEqual(unmatched, []);
  assert.equal(create.length, 1);
});

test('an UNSCHEDULED task is never minted by a force — it wakes the items routed to it, or reports nothing', () => {
  // An unscheduled task has no standing item to stand in for: an item exists only
  // because an issue named the task, and a bare one carries nothing its worker can
  // read (#1721).
  const lever = task('lever', []);
  const none = planWake('lever', [...wakeTasks, lever], []);
  assert.deepEqual(none.create, []);
  assert.deepEqual(none.wake, []);
  assert.equal(none.unmatched.length, 1);
  assert.match(none.unmatched[0].why, /not on the schedule/);
  // An adopted issue routed to the task keeps its own title, so the force reaches it
  // by the task path in its machine block — and leaves one in flight alone.
  const routed = (number, status) => ({
    number, title: `Verify in production: thing ${number}`, state: 'open',
    labels: ['task:origin:ad-hoc', status],
    body: `Task: p/lever\n\n<!-- claudinite-item -->\npacks/p/tasks/lever/task.md\n\nNot-before: 2026-09-05T21:07:20Z\n<!-- /claudinite-item -->\n`,
  });
  const some = planWake('lever', [...wakeTasks, lever], [routed(1708, 'task:status:blocked'), routed(1710, 'task:status:running-executor')]);
  assert.deepEqual(some.create, []);
  assert.deepEqual(some.unmatched, []);
  assert.deepEqual(some.wake, [{ id: 'p/lever', issue: 1708 }]);
  assert.deepEqual(some.already, [{ id: 'lever', issue: 1710 }]);
});

test('a minted item consumes the current occurrence, so the scheduler run does not double it', async () => {
  // It is titled with the task and nothing else for exactly this reason — that is
  // what makes it the standing item structurally, and an item outside the family
  // would let the next scheduler run create a second one beside it.
  const now = '2026-08-16T10:00:00Z';
  const minted = item({
    task: 'update', labels: ['origin:schedule', 'task:status:waiting-for-executor'],
    created_at: now, updated_at: now,
  });
  const { ops } = await planSchedulerRun({ tasks: [task('update', ['due:daily'])], items: [minted], now, schedule: SCHEDULE, evaluate: yes });
  assert.deepEqual(kinds(ops, 'create'), [], 'the scheduler run must not mint a second standing item beside the forced one');
});

test('an item already in flight is left alone — waking it would drop an episode boundary on a live claim', () => {
  for (const label of ['task:status:waiting-for-executor', 'task:status:running-executor', 'task:status:running-agent']) {
    const live = [item({ task: 'update', labels: [label], created_at: '2026-08-16T00:00:00Z' })];
    const { wake, already } = planWake('update', wakeTasks, live);
    assert.deepEqual(wake, [], `${label} must not be re-woken`);
    assert.equal(already.length, 1);
  }
});

test('a needs-human item IS wakeable — the force is the sanctioned road back from triage', () => {
  const parked = [item({ task: 'update', labels: ['task:status:needs-human-failure'], created_at: '2026-08-16T00:00:00Z' })];
  const { wake } = planWake('update', wakeTasks, parked);
  assert.equal(wake.length, 1);
});

test('an ambiguous bare id refuses rather than guessing which pack meant it', () => {
  const twoPacks = [task('update', ['due:daily']), { ...task('update', ['due:daily']), pack: 'q' }];
  const { wake, unmatched } = planWake('update', twoPacks, wakeItems);
  assert.deepEqual(wake, []);
  assert.match(unmatched[0].why, /name it as pack\/task/);
});

test('an empty spec asks for nothing at all', () => {
  for (const spec of ['', '   ', null, undefined]) {
    const r = planWake(spec, wakeTasks, wakeItems);
    assert.deepEqual([r.wake, r.already, r.unmatched], [[], [], []]);
  }
});

// --- a standing item whose task is gone (#1215) --------------------------------

const orphan = () => item({
  task: 'retired', labels: ['task:blocked'], created_at: '2026-08-13T04:17:00Z',
  body: 'packs/p/tasks/retired/task.md\n\nNot-before: 2026-08-16T04:00:00.000Z\n',
});

test('a blocked standing item whose task is not declared at HEAD is reaped', async () => {
  const gone = orphan();
  const { ops } = await planSchedulerRun({
    tasks: [task('daily1', ['due:daily'])], items: [gone],
    now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, evaluate: no,
  });
  const [reap] = kinds(ops, 'retire-orphan');
  assert.equal(reap?.issue, gone.number);
  assert.match(reap.reason, /no longer declared/);
  assert.deepEqual(kinds(ops, 'ready'), [], 'and it is never handed to an executor');
});

test('a due orphan is reaped rather than readied', async () => {
  const gone = item({
    task: 'retired', labels: ['task:blocked'], created_at: '2026-08-13T04:17:00Z',
    body: 'packs/p/tasks/retired/task.md\n\nNot-before: 2026-08-14T04:00:00.000Z\n',
  });
  const { ops } = await planSchedulerRun({
    tasks: [task('daily1', ['due:daily'])], items: [gone],
    now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, evaluate: no,
  });
  assert.equal(kinds(ops, 'retire-orphan')[0]?.issue, gone.number);
  assert.deepEqual(kinds(ops, 'ready'), []);
});

test('an unreadable task list reaps nothing, and neither status nor qualifier is guessed at', async () => {
  const empty = await planSchedulerRun({
    tasks: [], items: [orphan()], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, evaluate: no,
  });
  assert.deepEqual(kinds(empty.ops, 'retire-orphan'), [], 'a failed read must never reap the queue');

  const inFlight = await planSchedulerRun({
    tasks: [task('daily1', ['due:daily'])],
    items: [
      item({ task: 'retired', labels: ['task:ready'], created_at: '2026-08-13T04:17:00Z' }),
      item({ task: 'retired', labels: ['task:blocked'], created_at: '2026-08-13T04:17:00Z', qualifier: '#7' }),
    ],
    now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, evaluate: no,
  });
  assert.deepEqual(kinds(inFlight.ops, 'retire-orphan'), [], 'only a blocked, unqualified standing item is the rule\'s');
});

// --- settings-level disablement ------------------------------------------------
// REPO SHAPE IS NOT A PRECONDITION (task-preconditions DESIGN). "This repo ships
// the store pipeline", "this repo has a vendored mount" are facts adoption
// settled, not questions worth re-asking every night — so a repo that carries a
// pack but not one task's subject names that task in
// `taskScheduler.disabledTasks`, read here, before anything is asked.

test('a disabled task is never asked, and its standing item is retired', async () => {
  const schedule = { ...SCHEDULE, disabledTasks: ['p/off'] };
  const tasks = [task('off', ['due:daily']), task('on', ['due:daily'])];

  const { seen, evaluate } = askedIds();
  const fresh = await planSchedulerRun({ tasks, items: [], now: '2026-08-14T10:00:00Z', schedule, evaluate });
  assert.deepEqual(seen, ['on']);
  assert.deepEqual(kinds(fresh.ops, 'create').map((o) => o.task), ['on']);

  // …and the item a previous cycle filed, before the repo disabled it, closes with
  // a reason naming the setting rather than pretending the task is gone.
  const standing = item({
    task: 'off', labels: ['task:status:blocked'], created_at: '2026-08-13T04:00:00Z',
    body: 'packs/p/tasks/off/task.md\n\nNot-before: 2026-08-15T04:00:00Z\n',
  });
  const withItem = await planSchedulerRun({ tasks, items: [standing], now: '2026-08-14T10:00:00Z', schedule, evaluate: yes });
  const [retired] = kinds(withItem.ops, 'retire-orphan');
  assert.equal(retired.issue, standing.number);
  assert.match(retired.reason, /taskScheduler\.disabledTasks/);
});

test('with nothing disabled the setting is simply absent — never "misconfigured"', async () => {
  // A value right for nearly every repo stays in code: unset means the default.
  for (const schedule of [SCHEDULE, { ...SCHEDULE, disabledTasks: [] }]) {
    const { ops } = await planSchedulerRun({ tasks: [task('on', ['due:daily'])], items: [], now: '2026-08-14T10:00:00Z', schedule, evaluate: yes });
    assert.deepEqual(kinds(ops, 'create').map((o) => o.task), ['on']);
  }
});
