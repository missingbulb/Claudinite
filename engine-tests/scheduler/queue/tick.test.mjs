import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTick } from '../../../engine/scheduler/queue/tick.mjs';
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
  assert.equal(nextAnchor('daily-2h', SCHEDULE, '2026-08-14T10:00:00Z').toISOString(), '2026-08-15T02:00:00.000Z');
  assert.equal(nextAnchor('hourly', SCHEDULE, '2026-08-14T10:37:00Z').toISOString(), '2026-08-14T11:00:00.000Z');
  assert.equal(nextAnchor('weekly', SCHEDULE, '2026-08-14T10:00:00Z').toISOString(), '2026-08-16T04:00:00.000Z');
  // Monthly anchors are not a fixed distance apart — the walk must not overshoot.
  assert.equal(nextAnchor('monthly', SCHEDULE, '2026-08-14T10:00:00Z').toISOString(), '2026-09-01T04:00:00.000Z');
  assert.equal(nextAnchor('monthly', SCHEDULE, '2026-01-31T10:00:00Z').toISOString(), '2026-02-01T04:00:00.000Z');
  assert.equal(mostRecentAnchor('manual', SCHEDULE, '2026-08-14T10:00:00Z'), null);
  assert.equal(periodMs('weekly'), 7 * 86400e3);
});

// --- job 1: instantiate -------------------------------------------------------

test('a brand-new task\'s FIRST item is born blocked until its next real anchor (S25)', () => {
  const { ops } = planTick({ tasks: [task('weeklyish', 'weekly')], items: [], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE });
  const [create] = kinds(ops, 'create');
  assert.deepEqual(create.labels, ['origin:schedule', 'task:blocked']);
  assert.equal(parseWorkItemBody(create.body).notBefore, '2026-08-16T04:00:00.000Z');
});

test('later occurrences are born ready, and a manual task is never instantiated', () => {
  const yesterday = item({ task: 'daily1', labels: ['origin:schedule'], state: 'closed', created_at: '2026-08-13T04:10:00Z', closed_at: '2026-08-13T05:00:00Z' });
  const { ops } = planTick({
    tasks: [task('daily1', 'daily'), task('lever', 'manual')],
    items: [yesterday], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE,
  });
  const creates = kinds(ops, 'create');
  assert.equal(creates.length, 1);
  assert.deepEqual(creates[0].labels, ['origin:schedule', 'task:ready']);
  assert.equal(parseWorkItemBody(creates[0].body).notBefore, null);
});

test('an open standing item suppresses instantiation however long it has stood', () => {
  const standing = item({ task: 'daily1', labels: ['origin:schedule', 'task:blocked'], created_at: '2026-06-01T04:10:00Z' });
  const { ops } = planTick({ tasks: [task('daily1', 'daily')], items: [standing], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE });
  assert.equal(kinds(ops, 'create').length, 0);
});

// F13 — the half a creation-time-only guard misses. A rolled item created in an
// earlier period, run and CLOSED today, has consumed today's occurrence; without
// the closed_at half the very next tick mints a second item for the same
// occurrence, which is a double execution.
test('the occurrence guard has both halves: created-at-or-after AND closed-at-or-after (F13)', () => {
  const ranToday = item({
    task: 'daily1', labels: ['origin:schedule'], state: 'closed',
    created_at: '2026-08-10T04:10:00Z', closed_at: '2026-08-14T04:30:00Z',
  });
  const after = planTick({ tasks: [task('daily1', 'daily')], items: [ranToday], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE });
  assert.equal(kinds(after.ops, 'create').length, 0, 'today\'s occurrence was already consumed by the item that ran and closed today');

  // …and tomorrow it instantiates again, so the guard bounds one occurrence only.
  const tomorrow = planTick({ tasks: [task('daily1', 'daily')], items: [ranToday], now: '2026-08-15T10:00:00Z', schedule: SCHEDULE });
  assert.equal(kinds(tomorrow.ops, 'create').length, 1);
});

// F16 — nothing documents that a REST list from another node sees a creation
// seconds old, so the tick assumes a duplicate WILL happen and self-heals first.
test('a duplicate standing item is closed obsolete, oldest kept (F16)', () => {
  const a = item({ task: 'daily1', labels: ['origin:schedule', 'task:ready'], created_at: '2026-08-14T04:10:00Z' });
  const b = item({ task: 'daily1', labels: ['origin:schedule', 'task:ready'], created_at: '2026-08-14T04:11:00Z' });
  const { ops } = planTick({ tasks: [task('daily1', 'daily')], items: [a, b], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE });
  const dedupes = kinds(ops, 'dedupe');
  assert.deepEqual(dedupes.map((o) => o.issue), [b.number]);
  assert.equal(kinds(ops, 'create').length, 0, 'the surviving standing item still suppresses instantiation');
});

test('ad-hoc items neither suppress nor consume a scheduled occurrence (§3)', () => {
  const adHoc = item({ task: 'daily1', labels: ['task:ready'], created_at: '2026-08-14T09:00:00Z' });
  const { ops } = planTick({ tasks: [task('daily1', 'daily')], items: [adHoc], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE });
  assert.equal(kinds(ops, 'create').length, 1, 'an item with no origin:schedule is not in the family');
});

test('a fan-out qualifier is a different item, not this task\'s standing one', () => {
  const fanOut = item({ task: 'daily1', qualifier: 'member-x', labels: ['origin:schedule', 'task:ready'], created_at: '2026-08-14T09:00:00Z' });
  const { ops } = planTick({ tasks: [task('daily1', 'daily')], items: [fanOut], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE });
  assert.equal(kinds(ops, 'create').length, 1);
});

// --- job 2: ready -------------------------------------------------------------

test('a blocked item readies when its time has passed and its blockers have closed', () => {
  const sleeping = item({
    task: 'daily1', labels: ['origin:schedule', 'task:blocked'], created_at: '2026-08-13T04:10:00Z',
    body: 'packs/p/tasks/daily1/task.md\n\nNot-before: 2026-08-14T04:00:00Z\n',
  });
  const early = planTick({ tasks: [], items: [sleeping], now: '2026-08-14T03:00:00Z', schedule: SCHEDULE });
  assert.equal(kinds(early.ops, 'ready').length, 0);
  const due = planTick({ tasks: [], items: [sleeping], now: '2026-08-14T04:10:00Z', schedule: SCHEDULE });
  assert.deepEqual(kinds(due.ops, 'ready').map((o) => o.issue), [sleeping.number]);
});

test('an unreadable or open blocker delays rather than releases', () => {
  const blocked = item({
    task: 'follow', labels: ['task:blocked'], created_at: '2026-08-13T04:10:00Z',
    body: 'packs/p/tasks/follow/task.md\n\nBlocked-by: #500, #501\n',
  });
  const bothOpen = planTick({ tasks: [], items: [blocked], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, stateOf: () => 'open' });
  assert.equal(kinds(bothOpen.ops, 'ready').length, 0);
  const unknown = planTick({ tasks: [], items: [blocked], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, stateOf: () => null });
  assert.equal(kinds(unknown.ops, 'ready').length, 0, 'an unknown blocker is never treated as closed');
  const settled = planTick({ tasks: [], items: [blocked], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE, stateOf: () => 'closed' });
  assert.equal(kinds(settled.ops, 'ready').length, 1);
});

test('an item in triage is never readied by the tick — only a human re-queues it', () => {
  const triage = item({ task: 'daily1', labels: ['origin:schedule', 'task:blocked', 'needs-human'], created_at: '2026-08-13T04:10:00Z' });
  const { ops } = planTick({ tasks: [], items: [triage], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE });
  assert.equal(kinds(ops, 'ready').length, 0);
});

// --- job 3: reclaim -----------------------------------------------------------

test('a claim silent past the leash is reclaimed to the queue', () => {
  const stuck = item({ task: 'daily1', labels: ['origin:schedule', 'task:executing'], created_at: '2026-08-14T04:10:00Z', updated_at: '2026-08-14T04:15:00Z' });
  const early = planTick({ tasks: [task('daily1', 'daily')], items: [stuck], now: '2026-08-14T04:50:00Z', schedule: SCHEDULE });
  assert.equal(kinds(early.ops, 'reclaim').length, 0);
  const late = planTick({ tasks: [task('daily1', 'daily')], items: [stuck], now: '2026-08-14T05:30:00Z', schedule: SCHEDULE });
  assert.deepEqual(kinds(late.ops, 'reclaim').map((o) => o.to), ['task:ready']);
});

// The ack-early/ack-late dial: a task that cannot promise a safe re-run is not
// re-queued by a recovery path — at-most-once plus a human.
test('a task declaring on_interrupt: needs-human is reclaimed to triage, not to the queue', () => {
  const stuck = item({ task: 'oneshot', labels: ['origin:schedule', 'task:executing'], created_at: '2026-08-14T04:10:00Z', updated_at: '2026-08-14T04:15:00Z' });
  const { ops } = planTick({
    tasks: [task('oneshot', 'daily', { on_interrupt: 'needs-human' })],
    items: [stuck], now: '2026-08-14T05:30:00Z', schedule: SCHEDULE,
  });
  assert.deepEqual(kinds(ops, 'reclaim').map((o) => o.to), ['needs-human']);
  assert.match(kinds(ops, 'reclaim')[0].reason, /on_interrupt/);
});

test('the tick evaluates nothing: a task with a precondition that throws is still instantiated', () => {
  const throwing = task('daily1', 'daily', { precondition() { throw new Error('the tick must never call me'); } });
  const { ops } = planTick({ tasks: [throwing], items: [], now: '2026-08-14T10:00:00Z', schedule: SCHEDULE });
  assert.equal(kinds(ops, 'create').length, 1);
});
