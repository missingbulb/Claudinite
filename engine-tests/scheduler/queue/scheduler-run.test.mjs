import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSchedulerRun, planWake } from '../../../engine/scheduler/queue/scheduler-run.mjs';
import { mostRecentAnchor, nextAnchor, periodMs } from '../../../engine/scheduler/queue/anchors.mjs';
import { parseWorkItemBody } from '../../../engine/scheduler/queue/work-item.mjs';

const SCHEDULE = { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 };

const task = (id, frequency, extra = {}) => ({
  pack: 'p', id, taskPath: `packs/p/tasks/${id}/task.md`,
  decl: { id, frequency, ...extra },
});

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
  // The retired spellings are gone from the vocabulary, so the calendar treats them as it treats
  // any unknown token — loudly. Nothing reaches here with one: the contract rejects the
  // declaration first.
  assert.throws(() => nextAnchor('daily-2h', SCHEDULE, '2026-08-14T10:00:00Z'), /unknown frequency/);
  assert.throws(() => nextAnchor('hourly', SCHEDULE, '2026-08-14T10:37:00Z'), /unknown frequency/);
  assert.equal(nextAnchor('weekly', SCHEDULE, '2026-08-14T10:00:00Z').toISOString(), '2026-08-16T04:00:00.000Z');
  // Monthly anchors are not a fixed distance apart — the walk must not overshoot.
  assert.equal(nextAnchor('monthly', SCHEDULE, '2026-08-14T10:00:00Z').toISOString(), '2026-09-01T04:00:00.000Z');
  assert.equal(nextAnchor('monthly', SCHEDULE, '2026-01-31T10:00:00Z').toISOString(), '2026-02-01T04:00:00.000Z');
  assert.equal(mostRecentAnchor('manual', SCHEDULE, '2026-08-14T10:00:00Z'), null);
  assert.equal(periodMs('weekly'), 7 * 86400e3);
});

// --- job 1: instantiate -------------------------------------------------------

test('with no evaluation seam a brand-new task\'s FIRST item is still born blocked (S25)', async () => {
  const { ops } = await planSchedulerRun({ tasks: [task('weeklyish', 'weekly')], items: [], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE });
  const [create] = kinds(ops, 'create');
  assert.deepEqual(create.labels, ['task:blocked']);
  assert.equal(parseWorkItemBody(create.body).notBefore, '2026-08-16T04:00:00.000Z');
});

test('later occurrences are born ready, and a manual task is never instantiated', async () => {
  const yesterday = item({ task: 'daily1', labels: ['origin:schedule'], state: 'closed', created_at: '2026-08-13T04:10:00Z', closed_at: '2026-08-13T05:00:00Z' });
  const { ops } = await planSchedulerRun({
    tasks: [task('daily1', 'daily'), task('lever', 'manual')],
    items: [yesterday], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
  });
  const creates = kinds(ops, 'create');
  assert.equal(creates.length, 1);
  assert.deepEqual(creates[0].labels, ['task:ready']);
  assert.equal(parseWorkItemBody(creates[0].body).notBefore, null);
});

test('an open standing item suppresses instantiation however long it has stood', async () => {
  const standing = item({ task: 'daily1', labels: ['origin:schedule', 'task:blocked'], created_at: '2026-06-01T04:10:00Z' });
  const { ops } = await planSchedulerRun({ tasks: [task('daily1', 'daily')], items: [standing], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE });
  assert.equal(kinds(ops, 'create').length, 0);
});

// F13 — the half a creation-time-only guard misses. A rolled item created in an
// earlier period, run and CLOSED today, has consumed today's occurrence; without
// the closed_at half the very next scheduler run mints a second item for the same
// occurrence, which is a double execution.
test('the occurrence guard has both halves: created-at-or-after AND closed-at-or-after (F13)', async () => {
  const ranToday = item({
    task: 'daily1', labels: ['origin:schedule'], state: 'closed',
    created_at: '2026-08-10T04:10:00Z', closed_at: '2026-08-14T04:30:00Z',
  });
  const after = await planSchedulerRun({ tasks: [task('daily1', 'daily')], items: [ranToday], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE });
  assert.equal(kinds(after.ops, 'create').length, 0, 'today\'s occurrence was already consumed by the item that ran and closed today');

  // …and tomorrow it instantiates again, so the guard bounds one occurrence only.
  const tomorrow = await planSchedulerRun({ tasks: [task('daily1', 'daily')], items: [ranToday], now: '2026-08-15T10:00:00Z', schedule: SCHEDULE });
  assert.equal(kinds(tomorrow.ops, 'create').length, 1);
});

// F16 — nothing documents that a REST list from another node sees a creation
// seconds old, so the scheduler run assumes a duplicate WILL happen and self-heals first.
test('a duplicate standing item is closed obsolete, oldest kept (F16)', async () => {
  const a = item({ task: 'daily1', labels: ['origin:schedule', 'task:ready'], created_at: '2026-08-14T04:10:00Z' });
  const b = item({ task: 'daily1', labels: ['origin:schedule', 'task:ready'], created_at: '2026-08-14T04:11:00Z' });
  const { ops } = await planSchedulerRun({ tasks: [task('daily1', 'daily')], items: [a, b], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE });
  const dedupes = kinds(ops, 'dedupe');
  assert.deepEqual(dedupes.map((o) => o.issue), [b.number]);
  assert.equal(kinds(ops, 'create').length, 0, 'the surviving standing item still suppresses instantiation');
});

test('ad-hoc items neither suppress nor consume a scheduled occurrence (§3)', async () => {
  // Ad-hoc is STRUCTURAL (§15.26), so both of its shapes are asserted: a qualified
  // item for a scheduled task, and a `manual` task's item, which has no anchor to
  // stand for. Neither is in the daily family, so today's occurrence is still filed.
  const fanOut = item({ task: 'daily1', qualifier: 'member-x', labels: ['task:ready'], created_at: '2026-08-14T09:00:00Z' });
  const lever = item({ task: 'lever', labels: ['task:ready'], created_at: '2026-08-14T09:00:00Z' });
  const { ops } = await planSchedulerRun({
    tasks: [task('daily1', 'daily'), task('lever', 'manual')],
    items: [fanOut, lever], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
  });
  const creates = kinds(ops, 'create');
  assert.equal(creates.length, 1);
  assert.equal(creates[0].task, 'daily1', 'the manual task is never instantiated at all');
});

test('an unqualified item for a scheduled task IS that task\'s standing item, marker or no marker', async () => {
  // The origin marker is gone (§15.26) and nothing replaced it with a second one: an
  // item titled with the task and nothing else, whose task is on a calendar, is the
  // occurrence — so it suppresses instantiation, and a twin beside it is deduped.
  const unmarked = item({ task: 'daily1', labels: ['task:ready'], created_at: '2026-08-14T04:10:00Z' });
  const { ops } = await planSchedulerRun({ tasks: [task('daily1', 'daily')], items: [unmarked], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE });
  assert.deepEqual(kinds(ops, 'create'), []);
});

// --- job 2: ready -------------------------------------------------------------

test('a blocked item readies when its time has passed and its blockers have closed', async () => {
  const sleeping = item({
    task: 'daily1', labels: ['origin:schedule', 'task:blocked'], created_at: '2026-08-13T04:10:00Z',
    body: 'packs/p/tasks/daily1/task.md\n\nNot-before: 2026-08-14T04:00:00Z\n',
  });
  const early = await planSchedulerRun({ tasks: [], items: [sleeping], now: '2026-08-14T03:00:00Z', schedule: SCHEDULE });
  assert.equal(kinds(early.ops, 'ready').length, 0);
  const due = await planSchedulerRun({ tasks: [], items: [sleeping], now: '2026-08-14T04:10:00Z', schedule: SCHEDULE });
  assert.deepEqual(kinds(due.ops, 'ready').map((o) => o.issue), [sleeping.number]);
});

test('an unreadable or open blocker delays rather than releases', async () => {
  const blocked = item({
    task: 'follow', labels: ['task:blocked'], created_at: '2026-08-13T04:10:00Z',
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
  const triage = item({ task: 'daily1', labels: ['origin:schedule', 'task:blocked', 'needs-human'], created_at: '2026-08-13T04:10:00Z' });
  const { ops } = await planSchedulerRun({ tasks: [], items: [triage], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE });
  assert.equal(kinds(ops, 'ready').length, 0);
});

// --- job 3: reclaim -----------------------------------------------------------

test('a claim silent past the leash is reclaimed to the queue', async () => {
  const stuck = item({ task: 'daily1', labels: ['origin:schedule', 'task:executing'], created_at: '2026-08-14T04:10:00Z', updated_at: '2026-08-14T04:15:00Z' });
  const early = await planSchedulerRun({ tasks: [task('daily1', 'daily')], items: [stuck], now: '2026-08-14T04:50:00Z', schedule: SCHEDULE });
  assert.equal(kinds(early.ops, 'reclaim').length, 0);
  const late = await planSchedulerRun({ tasks: [task('daily1', 'daily')], items: [stuck], now: '2026-08-14T05:30:00Z', schedule: SCHEDULE });
  assert.deepEqual(kinds(late.ops, 'reclaim').map((o) => o.to), ['task:ready']);
});

// The ack-early/ack-late dial: a task that cannot promise a safe re-run is not
// re-queued by a recovery path — at-most-once plus a human.
test('a task declaring on_interrupt: needs-human is reclaimed to triage, not to the queue', async () => {
  const stuck = item({ task: 'oneshot', labels: ['origin:schedule', 'task:executing'], created_at: '2026-08-14T04:10:00Z', updated_at: '2026-08-14T04:15:00Z' });
  const { ops } = await planSchedulerRun({
    tasks: [task('oneshot', 'daily', { on_interrupt: 'needs-human' })],
    items: [stuck], now: '2026-08-14T05:30:00Z', schedule: SCHEDULE,
  });
  assert.deepEqual(kinds(ops, 'reclaim').map((o) => o.to), ['needs-human']);
  assert.match(kinds(ops, 'reclaim')[0].reason, /on_interrupt/);
});

test('the scheduler run evaluates nothing: a task with a precondition that throws is still instantiated', async () => {
  const throwing = task('daily1', 'daily', { precondition() { throw new Error('the scheduler run must never call me'); } });
  const { ops } = await planSchedulerRun({ tasks: [throwing], items: [], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE });
  assert.equal(kinds(ops, 'create').length, 1);
});

// --- the forced wake (DESIGN §8, #929) ----------------------------------------
// Forcing across repos: the enforcer dispatches, the member wakes its own item.

const wakeItems = [
  item({ task: 'update', labels: ['task:blocked', 'origin:schedule'], created_at: '2026-08-16T00:00:00Z' }),
  item({ task: 'tidy-prs', labels: ['task:executing', 'origin:schedule'], created_at: '2026-08-16T00:00:00Z' }),
];
const wakeTasks = [task('update', 'daily'), task('tidy-prs', 'daily')];

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

test('a minted item consumes the current occurrence, so the scheduler run does not double it', async () => {
  // It is titled with the task and nothing else for exactly this reason — that is
  // what makes it the standing item structurally, and an item outside the family
  // would let the next scheduler run create a second one beside it.
  const now = '2026-08-16T10:00:00Z';
  const minted = item({
    task: 'update', labels: ['origin:schedule', 'task:ready'],
    created_at: now, updated_at: now,
  });
  const { ops } = await planSchedulerRun({ tasks: [task('update', 'daily')], items: [minted], now, schedule: SCHEDULE });
  assert.deepEqual(kinds(ops, 'create'), [], 'the scheduler run must not mint a second standing item beside the forced one');
});

test('an item already in flight is left alone — waking it would drop an episode boundary on a live claim', () => {
  for (const label of ['task:ready', 'task:executing', 'task:agent']) {
    const live = [item({ task: 'update', labels: [label], created_at: '2026-08-16T00:00:00Z' })];
    const { wake, already } = planWake('update', wakeTasks, live);
    assert.deepEqual(wake, [], `${label} must not be re-woken`);
    assert.equal(already.length, 1);
  }
});

test('a needs-human item IS wakeable — the force is the sanctioned road back from triage', () => {
  const parked = [item({ task: 'update', labels: ['needs-human'], created_at: '2026-08-16T00:00:00Z' })];
  const { wake } = planWake('update', wakeTasks, parked);
  assert.equal(wake.length, 1);
});

test('an ambiguous bare id refuses rather than guessing which pack meant it', () => {
  const twoPacks = [task('update', 'daily'), { ...task('update', 'daily'), pack: 'q' }];
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

// --- job 1: a park only holds the lane when it is a fault ----------------------

// The lane rule, from both sides. An open `origin:schedule` item IS the task's
// standing item, so while one exists no further occurrence is filed — which for a
// broken run is the point (a queue of items that will break the same way helps
// nobody) and for a person's inbox is a bug: a PR nobody has reviewed must not
// stop tomorrow's run.
test('a non-blocking park does not suppress the next occurrence', async () => {
  for (const triage of ['task:needs-human-approval', 'task:needs-human-action', 'task:needs-human-decision']) {
    const parked = item({
      task: 'x', labels: ['origin:schedule', 'needs-human', triage],
      created_at: '2026-08-13T04:00:00Z',
    });
    const { ops } = await planSchedulerRun({
      tasks: [task('x', 'daily')], items: [parked], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
    });
    assert.equal(kinds(ops, 'create').length, 1, triage);
    // …and the parked item is not mistaken for a duplicate of the new one.
    assert.deepEqual(kinds(ops, 'dedupe'), [], triage);
  }
});

test('a failure park — and an unclassified one — holds the task\'s lane', async () => {
  for (const labels of [['needs-human', 'task:needs-human-failure'], ['needs-human']]) {
    const parked = item({
      task: 'x', labels: ['origin:schedule', ...labels], created_at: '2026-08-13T04:00:00Z',
    });
    const { ops } = await planSchedulerRun({
      tasks: [task('x', 'daily')], items: [parked], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
    });
    assert.deepEqual(kinds(ops, 'create'), [], labels.join('+'));
  }
});

// --- the evaluate-at-anchor seam and the schedule board (#1115) ----------------
// The scheduler run asks the precondition when the anchor comes and files an
// item only on a yes; a no is a board row; anything the scheduler cannot read
// fails OPEN. The executor still re-evaluates at pick — the board's verdict is
// a watermark, never a verdict carried forward.

const seeded = (t) => item({ task: t, labels: [], state: 'closed', created_at: '2026-08-13T04:17:00Z', closed_at: '2026-08-13T04:40:00Z' });

test('a decline at the anchor files nothing and lands as a board row', async () => {
  const { ops } = await planSchedulerRun({
    tasks: [task('daily1', 'daily')], items: [seeded('daily1')],
    now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
    evaluate: async () => ({ run: false, reason: 'no work today' }),
    board: { rows: new Map() },
  });
  assert.deepEqual(kinds(ops, 'create'), [], 'no work, no item');
  const [board] = kinds(ops, 'board');
  assert.ok(board, 'the decline is recorded');
  const row = board.rows.find((r) => r.task === 'p/daily1');
  assert.equal(row.verdict, 'no');
  assert.equal(row.lastAsked, '2026-08-14T04:00:00.000Z');
  assert.equal(row.reason, 'no work today');
});

test('a yes files the item; the board records the go but never gates on it (F31)', async () => {
  const goRow = { task: 'p/daily1', frequency: 'daily', lastAsked: '2026-08-14T04:00:00.000Z', verdict: 'go', reason: '' };
  const evaluated = [];
  const { ops } = await planSchedulerRun({
    tasks: [task('daily1', 'daily')], items: [seeded('daily1')],
    now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
    evaluate: async (t) => { evaluated.push(t.id); return { run: true, reason: 'work exists' }; },
    // the go row is already on the board — as after a CREATE that failed —
    // and must NOT suppress the re-ask, or the occurrence is eaten
    board: { rows: new Map([['p/daily1', goRow]]) },
  });
  assert.deepEqual(evaluated, ['daily1'], 'a go row is record, never a watermark');
  assert.equal(kinds(ops, 'create').length, 1, 'the item is created for the executor to decide');
});

test('a declined row for THIS anchor is the watermark; the next anchor asks again', async () => {
  const noRow = { task: 'p/daily1', frequency: 'daily', lastAsked: '2026-08-14T04:00:00.000Z', verdict: 'no', reason: 'quiet' };
  const evaluated = [];
  const sameAnchor = await planSchedulerRun({
    tasks: [task('daily1', 'daily')], items: [seeded('daily1')],
    now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
    evaluate: async (t) => { evaluated.push(t.id); return { run: false, reason: 'quiet' }; },
    board: { rows: new Map([['p/daily1', noRow]]) },
  });
  assert.deepEqual(evaluated, [], 'this occurrence was already asked and declined');
  assert.deepEqual(kinds(sameAnchor.ops, 'board'), [], 'and an unchanged board is not rewritten');

  const nextDay = await planSchedulerRun({
    tasks: [task('daily1', 'daily')], items: [seeded('daily1')],
    now: '2026-08-15T10:00:00Z', schedule: SCHEDULE,
    evaluate: async (t) => { evaluated.push(t.id); return { run: false, reason: 'quiet' }; },
    board: { rows: new Map([['p/daily1', noRow]]) },
  });
  assert.deepEqual(evaluated, ['daily1'], 'the next anchor is a new question');
  assert.equal(kinds(nextDay.ops, 'board').length, 1, 'and its answer moves the row');
});

test('an evaluation error fails OPEN: the item is created exactly as before (#1115)', async () => {
  const { ops } = await planSchedulerRun({
    tasks: [task('daily1', 'daily')], items: [seeded('daily1')],
    now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
    evaluate: async () => ({ error: 'FLEET_GITHUB_TOKEN is not available here' }),
    board: { rows: new Map() },
  });
  const [create] = kinds(ops, 'create');
  assert.ok(create, 'never fewer runs because a read failed');
  assert.deepEqual(create.labels, ['task:ready']);
  const row = kinds(ops, 'board')[0].rows.find((r) => r.task === 'p/daily1');
  assert.equal(row.verdict, 'fail-open');
});

test('with no seam wired every occurrence fails open — the calendar-only behaviour', async () => {
  const { ops } = await planSchedulerRun({
    tasks: [task('daily1', 'daily')], items: [seeded('daily1')],
    now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
  });
  assert.equal(kinds(ops, 'create').length, 1);
  assert.deepEqual(kinds(ops, 'board'), [], 'no seam, no board');
});

test('an absent board reads as absent: evaluate, and rewrite from what this run knows', async () => {
  const { ops } = await planSchedulerRun({
    tasks: [task('daily1', 'daily')], items: [seeded('daily1')],
    now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
    evaluate: async () => ({ run: false, reason: 'quiet' }),
    board: null,
  });
  assert.equal(kinds(ops, 'board').length, 1, 'the first row to write mints the board');
});

// --- the one-time migration (#1115) --------------------------------------------

const sleepingBody = (notBefore, extra = '') => 'packs/p/tasks/daily1/task.md\n\n'
  + `Not-before: ${notBefore}\n${extra}\n`
  + '### Last verdict\n\n- 2026-08-13T04:20:00Z — the precondition declined: no work\n';

test('the migration closes a sleeping rolled item and seeds its verdict onto the board', async () => {
  const sleeping = item({
    task: 'daily1', labels: ['task:blocked'], created_at: '2026-08-13T04:17:00Z',
    body: sleepingBody('2026-08-15T04:00:00.000Z'),
  });
  const { ops } = await planSchedulerRun({
    tasks: [task('daily1', 'daily')], items: [sleeping],
    now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
    evaluate: async () => ({ run: false, reason: 'quiet' }),
    board: { rows: new Map() },
  });
  const [retire] = kinds(ops, 'retire-sleeping');
  assert.equal(retire?.issue, sleeping.number);
  assert.match(retire.reason, /schedule board/);
  const row = kinds(ops, 'board')[0].rows.find((r) => r.task === 'p/daily1');
  assert.equal(row.verdict, 'no');
  assert.equal(row.reason, 'no work');
  // the retired item counts as closed NOW, so this run does not also create
  // an item for the current occurrence
  assert.deepEqual(kinds(ops, 'create'), []);
});

test('the migration spares a blocker wait and a due item', async () => {
  const withBlocker = item({
    task: 'daily1', labels: ['task:blocked'], created_at: '2026-08-13T04:17:00Z',
    body: sleepingBody('2026-08-15T04:00:00.000Z', 'Blocked-by: #7\n'),
  });
  // a rolled item whose wake has PASSED is due, not sleeping — job 2's to ready
  const due = item({
    task: 'daily2', labels: ['task:blocked'], created_at: '2026-08-12T04:17:00Z',
    body: 'packs/p/tasks/daily2/task.md\n\nNot-before: 2026-08-14T04:00:00.000Z\n'
      + '### Last verdict\n\n- 2026-08-13T04:20:00Z — the precondition declined: no work\n',
  });
  const { ops } = await planSchedulerRun({
    tasks: [task('daily1', 'daily'), task('daily2', 'daily')],
    items: [withBlocker, due],
    now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
    evaluate: async () => ({ run: false, reason: 'quiet' }),
    board: { rows: new Map() }, stateOf: () => 'open',
  });
  assert.deepEqual(kinds(ops, 'retire-sleeping'), [], 'neither is the migration\'s');
  assert.ok(kinds(ops, 'ready').some((o) => o.issue === due.number), 'the due item simply readies');
});

// --- first sight is a row, not an item (#1215) ---------------------------------

const firstWindowRow = (ops, key) => kinds(ops, 'board')[0]?.rows.find((r) => r.task === key);

test('a task never seen on this repo books its first window on the board and files nothing', async () => {
  const { ops } = await planSchedulerRun({
    tasks: [task('weeklyish', 'weekly')], items: [],
    now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
    evaluate: async () => { throw new Error('a first sight is never asked — it has no anchor yet'); },
    board: { rows: new Map() },
  });
  assert.deepEqual(kinds(ops, 'create'), [], 'no born-blocked item');
  const row = firstWindowRow(ops, 'p/weeklyish');
  assert.equal(row.verdict, 'no');
  assert.equal(row.lastAsked, '2026-08-09T04:00:00.000Z', 'the anchor it is declining, so the watermark holds the window');
  assert.match(row.reason, /2026-08-16T04:00:00\.000Z/, 'and it names the first window');
});

test('the booked window is not re-booked for the rest of it, and is asked at its anchor', async () => {
  const booked = new Map([['p/weeklyish', {
    task: 'p/weeklyish', frequency: 'weekly', lastAsked: '2026-08-09T04:00:00.000Z',
    verdict: 'no', reason: 'first window at 2026-08-16T04:00:00.000Z',
  }]]);
  const held = await planSchedulerRun({
    tasks: [task('weeklyish', 'weekly')], items: [],
    now: '2026-08-14T11:00:00Z', schedule: SCHEDULE,
    evaluate: async () => { throw new Error('still inside the booked window'); },
    board: { rows: new Map(booked) },
  });
  assert.deepEqual(kinds(held.ops, 'create'), []);
  assert.deepEqual(kinds(held.ops, 'board'), [], 'nothing changed, so the board is not rewritten');

  const arrived = await planSchedulerRun({
    tasks: [task('weeklyish', 'weekly')], items: [],
    now: '2026-08-16T05:00:00Z', schedule: SCHEDULE,
    evaluate: async () => ({ run: true, reason: 'work waiting' }),
    board: { rows: new Map(booked) },
  });
  const [create] = kinds(arrived.ops, 'create');
  assert.deepEqual(create.labels, ['task:ready'], 'the first anchor files a ready item, never a blocked one');
  assert.equal(parseWorkItemBody(create.body).notBefore, null);
});

test('the migration retires a born-blocked item onto the board as its first window', async () => {
  const born = item({
    task: 'weekly1', labels: ['task:blocked'], created_at: '2026-08-13T04:17:00Z',
    body: 'packs/p/tasks/weekly1/task.md\n\nNot-before: 2026-08-16T04:00:00.000Z\n',
  });
  const { ops } = await planSchedulerRun({
    tasks: [task('weekly1', 'weekly')], items: [born],
    now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
    evaluate: async () => ({ run: false, reason: 'quiet' }),
    board: { rows: new Map() },
  });
  const [retire] = kinds(ops, 'retire-sleeping');
  assert.equal(retire?.issue, born.number);
  const row = firstWindowRow(ops, 'p/weekly1');
  assert.equal(row.verdict, 'no');
  assert.match(row.reason, /2026-08-16T04:00:00\.000Z/);
  assert.deepEqual(kinds(ops, 'create'), [], 'the retired item covers this occurrence');
});

// --- a standing item whose task is gone (#1215) --------------------------------

const orphan = () => item({
  task: 'retired', labels: ['task:blocked'], created_at: '2026-08-13T04:17:00Z',
  body: 'packs/p/tasks/retired/task.md\n\nNot-before: 2026-08-16T04:00:00.000Z\n',
});

test('a blocked standing item whose task is not declared at HEAD is reaped', async () => {
  const gone = orphan();
  const { ops } = await planSchedulerRun({
    tasks: [task('daily1', 'daily')], items: [gone],
    now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
    evaluate: async () => ({ run: false, reason: 'quiet' }),
    board: { rows: new Map() },
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
    tasks: [task('daily1', 'daily')], items: [gone],
    now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
    evaluate: async () => ({ run: false, reason: 'quiet' }),
    board: { rows: new Map() },
  });
  assert.equal(kinds(ops, 'retire-orphan')[0]?.issue, gone.number);
  assert.deepEqual(kinds(ops, 'ready'), []);
});

test('an unreadable task list reaps nothing, and neither status nor qualifier is guessed at', async () => {
  const empty = await planSchedulerRun({
    tasks: [], items: [orphan()], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
    evaluate: async () => ({ run: false }), board: { rows: new Map() },
  });
  assert.deepEqual(kinds(empty.ops, 'retire-orphan'), [], 'a failed read must never reap the queue');

  const inFlight = await planSchedulerRun({
    tasks: [task('daily1', 'daily')],
    items: [
      item({ task: 'retired', labels: ['task:ready'], created_at: '2026-08-13T04:17:00Z' }),
      item({ task: 'retired', labels: ['task:blocked'], created_at: '2026-08-13T04:17:00Z', qualifier: '#7' }),
    ],
    now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
    evaluate: async () => ({ run: false }), board: { rows: new Map() },
  });
  assert.deepEqual(kinds(inFlight.ops, 'retire-orphan'), [], 'only a blocked, unqualified standing item is the rule\'s');
});
