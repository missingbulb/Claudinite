import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePreconditions, parsePreconditions, validatePreconditions, preconditionSignals } from '../precondition-policy.mjs';
import { cadenceOf, isWokenGated, holdsOnFailure, cadenceTermFor, parseDuration } from '../calendar.mjs';

// The run-history terms (tasks-dispatch DESIGN §5): a task's cadence, its view of
// its own last failure, and whether it runs only when somebody asks — every one a
// condition over the `runs` signal, the task's own unqualified work items newest
// first, read at every scheduler tick. Pure over that bundle, so each case here is
// the real evaluator against a hand-built history at a chosen instant.

const SCHEDULE = { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 };
const NOW = '2026-09-09T16:20:00Z'; // a Wednesday; today's daily anchor is 04:00Z, the weekly one Sunday the 6th
const run = (over = {}) => ({
  number: 10, createdAt: '2026-09-08T04:05:00Z', closedAt: '2026-09-08T04:40:00Z', state: 'closed',
  status: 'task:status:done', park: null, outcome: 'done', ...over,
});
const runs = (...list) => ({ runs: { list, horizonDays: 40 } });
const evaluate = (preconditions, signals, over = {}) =>
  evaluatePreconditions({ preconditions, signals, schedule: SCHEDULE, now: NOW, windowDays: 1.05, ...over });

// --- due:<cadence> ------------------------------------------------------------

test('due:daily holds only while no run of the task started or ended since today\'s anchor', () => {
  assert.equal(evaluate(['due:daily'], runs()).run, true, 'no run at all');
  assert.equal(evaluate(['due:daily'], runs(run())).run, true, 'yesterday\'s run is before today\'s 04:00 anchor');
  const today = run({ createdAt: '2026-09-09T04:05:00Z', closedAt: '2026-09-09T04:30:00Z' });
  assert.equal(evaluate(['due:daily'], runs(today)).run, false, 'a run since the anchor consumed today');
  // Both halves of the occurrence guard (F13): an item CREATED before the anchor
  // that CLOSED after it ran today, and a second one today is a double execution.
  const straddling = run({ createdAt: '2026-09-09T03:50:00Z', closedAt: '2026-09-09T04:10:00Z' });
  assert.equal(evaluate(['due:daily'], runs(straddling)).run, false);
  assert.match(evaluate(['due:daily'], runs(today)).reason, /already ran since/);
});

test('due:weekly and due:monthly anchor on the repo\'s own schedule', () => {
  const lastWeek = run({ createdAt: '2026-09-05T04:05:00Z', closedAt: '2026-09-05T05:00:00Z' });
  const thisWeek = run({ createdAt: '2026-09-07T04:05:00Z', closedAt: '2026-09-07T05:00:00Z' });
  assert.equal(evaluate(['due:weekly'], runs(lastWeek)).run, true);
  assert.equal(evaluate(['due:weekly'], runs(thisWeek)).run, false);
  assert.equal(evaluate(['due:monthly'], runs(lastWeek)).run, false, 'the 5th is after the 1st');
  const lastMonth = run({ createdAt: '2026-08-20T04:05:00Z', closedAt: '2026-08-20T05:00:00Z' });
  assert.equal(evaluate(['due:monthly'], runs(lastMonth)).run, true);
  // A member anchored elsewhere moves every cadence with it.
  const late = { ...SCHEDULE, dailyHour: 20 };
  assert.equal(evaluate(['due:daily'], runs(run({ createdAt: '2026-09-09T04:05:00Z', closedAt: '2026-09-09T05:00:00Z' })), { schedule: late }).run, false,
    'at 16:20 the most recent 20:00 anchor is yesterday evening\'s, and this morning\'s run came after it');
  assert.equal(evaluate(['due:daily'], runs(run({ createdAt: '2026-09-08T19:00:00Z', closedAt: '2026-09-08T19:30:00Z' })), { schedule: late }).run, true,
    'a run before yesterday evening\'s anchor leaves this period open');
});

test('a run still open counts — an item that started since the anchor is this period\'s', () => {
  const open = run({ createdAt: '2026-09-09T04:05:00Z', closedAt: null, state: 'open', status: 'task:status:needs-human-failure', park: 'failure', outcome: null });
  assert.equal(evaluate(['due:daily'], runs(open)).run, false);
});

test('a woken item satisfies the cadence terms — the wake IS the cadence', () => {
  const today = run({ createdAt: '2026-09-09T04:05:00Z', closedAt: '2026-09-09T04:30:00Z' });
  const woken = { item: { number: 11, woken: true } };
  assert.equal(evaluate(['due:daily'], runs(today), woken).run, true);
  assert.equal(evaluate(['last-run-over:7d'], runs(today), woken).run, true);
  assert.match(evaluate(['due:daily'], runs(today), woken).reason, /woken/);
  // …and nothing else: a woken item still answers to the task's other conditions.
  assert.equal(evaluate(['due:daily', 'substantive-change'], { ...runs(today), commits: { substantiveChange: false } }, woken).run, false);
});

test('due takes exactly one of the three cadences', () => {
  assert.match(evaluate(['due:hourly'], runs()).error, /"due" takes one of daily, weekly, monthly/);
  assert.match(evaluate(['due'], runs()).error, /takes an inline argument/);
  const problems = validatePreconditions(['due:fortnightly']);
  assert.equal(problems.length, 1);
  assert.match(problems[0].what, /"due" takes one of daily, weekly, monthly, not "fortnightly"/);
  assert.deepEqual(validatePreconditions(['due:weekly']), []);
});

test('a due term anchors on the documented defaults with no schedule, and cannot answer with no instant', () => {
  // No `taskScheduler` in the repo's settings is the common case, and the anchor
  // math has always read the defaults for it (04:00Z daily, Sunday, the 1st).
  assert.equal(evaluate(['due:daily'], runs(run({ createdAt: '2026-09-09T04:05:00Z', closedAt: '2026-09-09T04:30:00Z' })), { schedule: null }).run, false);
  assert.match(evaluate(['due:daily'], runs(), { now: null }).error, /no instant/);
});

// --- last-run-over:<duration> ------------------------------------------------

test('last-run-over measures from the newest run\'s START, or holds with no run in the horizon', () => {
  assert.equal(evaluate(['last-run-over:1d'], runs()).run, true);
  // Newest started 2026-09-08T04:05Z; now is the 9th at 16:20 — 36h15m ago.
  assert.equal(evaluate(['last-run-over:1d'], runs(run())).run, true);
  assert.equal(evaluate(['last-run-over:36h'], runs(run())).run, true);
  assert.equal(evaluate(['last-run-over:37h'], runs(run())).run, false);
  assert.equal(evaluate(['last-run-over:7d'], runs(run())).run, false);
  assert.match(evaluate(['last-run-over:7d'], runs(run())).reason, /started .* ago/);
  // Newest first is the collector's promise; the term reads the head of the list.
  const older = run({ number: 3, createdAt: '2026-08-01T04:05:00Z', closedAt: '2026-08-01T05:00:00Z' });
  assert.equal(evaluate(['last-run-over:7d'], runs(run(), older)).run, false);
});

test('last-run-over takes a whole number of hours or days', () => {
  for (const bad of ['last-run-over:soon', 'last-run-over:1.5d', 'last-run-over:2w', 'last-run-over']) {
    assert.ok(evaluate([bad], runs()).error, bad);
  }
  assert.equal(parseDuration('12h'), 12 * 3600e3);
  assert.equal(parseDuration('7d'), 7 * 86400e3);
  assert.equal(parseDuration('7 d'), null);
});

// --- last-run-not-failed ------------------------------------------------------

test('last-run-not-failed declines exactly while the newest run stands or ended at a failure park', () => {
  assert.equal(evaluate(['last-run-not-failed'], runs()).run, true, 'nothing ran');
  assert.equal(evaluate(['last-run-not-failed'], runs(run())).run, true, 'done');
  const failed = run({ number: 12, createdAt: '2026-09-09T04:05:00Z', closedAt: null, state: 'open', status: 'task:status:needs-human-failure', park: 'failure', outcome: null });
  assert.equal(evaluate(['last-run-not-failed'], runs(failed)).run, false);
  assert.match(evaluate(['last-run-not-failed'], runs(failed)).reason, /#12.*failure/);
  // The other three parks are somebody's inbox, not a fault in the task.
  const approval = run({ ...failed, status: 'task:status:needs-human-approval', park: 'approval' });
  assert.equal(evaluate(['last-run-not-failed'], runs(approval)).run, true);
  // Only the NEWEST run speaks: a failure behind a later clean run is history.
  assert.equal(evaluate(['last-run-not-failed'], runs(run({ number: 13, createdAt: '2026-09-09T05:00:00Z' }), failed)).run, true);
});

// --- woken --------------------------------------------------------------------

test('woken holds only for an item somebody created, never at the scheduler\'s own ask', () => {
  assert.equal(evaluate(['woken'], {}).run, false, 'no item: the schedule asking');
  assert.match(evaluate(['woken'], {}).reason, /only from an item somebody created/);
  assert.equal(evaluate(['woken'], {}, { item: { number: 5, woken: false } }).run, false, 'a scheduled item');
  assert.equal(evaluate(['woken'], {}, { item: { number: 5, woken: true } }).run, true);
});

test('the run-history terms read the runs signal, and woken reads nothing', () => {
  assert.deepEqual(preconditionSignals(['due:daily'], new Map()), ['runs']);
  assert.deepEqual(preconditionSignals(['last-run-over:1d', 'last-run-not-failed'], new Map()), ['runs']);
  assert.deepEqual(preconditionSignals(['woken'], new Map()), []);
  assert.deepEqual(preconditionSignals(['woken', 'request-eligible'], new Map([['request-eligible', { signals: ['request'] }]])), ['request']);
});

// --- none is retired ----------------------------------------------------------

test('`none` is retired: a task with no condition would run at every tick', () => {
  const parsed = parsePreconditions(['none']);
  assert.equal(parsed.kind, 'invalid');
  assert.match(parsed.reason, /every scheduler tick/);
  assert.match(evaluate(['none'], {}).error, /due:daily|woken/);
  assert.equal(validatePreconditions(['none']).length, 1);
  assert.match(validatePreconditions(['none'])[0].fix, /due:<daily\|weekly\|monthly>/);
});

// --- partial evaluation: decide on history alone where it can -----------------

test('a partial evaluation declines on a decided conjunct without the other signals', () => {
  const today = run({ createdAt: '2026-09-09T04:05:00Z', closedAt: '2026-09-09T04:30:00Z' });
  const v = evaluate(['due:daily', 'substantive-change'], runs(today), { partial: true });
  assert.equal(v.run, false);
  assert.match(v.reason, /already ran/);
});

test('a partial evaluation is undecided while a conjunct\'s signal is not there yet', () => {
  const v = evaluate(['due:daily', 'substantive-change'], runs(), { partial: true });
  assert.equal(v.run, null);
  assert.equal(v.undecided, true);
  assert.deepEqual(v.missing, ['commits']);
});

test('a partial evaluation that decides everything from history answers yes', () => {
  const v = evaluate(['due:daily'], runs(), { partial: true });
  assert.equal(v.run, true);
  // An alternative rescues an unknown one: `X || Y` with X held is held.
  const both = evaluate(['due:daily || substantive-change'], runs(), { partial: true });
  assert.equal(both.run, true);
  // …and an alternative that could not be decided keeps the conjunct undecided
  // rather than declined.
  const today = run({ createdAt: '2026-09-09T04:05:00Z', closedAt: '2026-09-09T04:30:00Z' });
  assert.equal(evaluate(['due:daily || substantive-change'], runs(today), { partial: true }).undecided, true);
});

test('a full evaluation still treats a missing signal as a term that does not hold', () => {
  // The pre-existing contract: a collector that was never asked answers nothing,
  // and nothing is not movement. Only the partial mode reads absence as unknown.
  assert.equal(evaluate(['substantive-change'], {}).run, false);
});

test('an unreadable runs signal errors, as every unreadable signal does', () => {
  assert.match(evaluate(['due:daily'], { runs: { error: 'the issues API answered 502' } }).error, /`runs` signal could not be read/);
});

// --- the calendar\'s reading of a declaration ---------------------------------

test('cadenceOf reads the first cadence term, and woken when that is all there is', () => {
  assert.deepEqual(cadenceOf(['due:weekly', 'repo-active']), { kind: 'due', cadence: 'weekly' });
  assert.deepEqual(cadenceOf(['substantive-change', 'last-run-over:3d']), { kind: 'elapsed', ms: 3 * 86400e3, text: '3d' });
  assert.deepEqual(cadenceOf(['woken', 'request-eligible']), { kind: 'woken' });
  assert.equal(cadenceOf(['substantive-change']), null, 'movement alone: asked at every tick, runs on movement');
  assert.equal(cadenceOf(undefined), null);
});

test('woken gates only as a whole conjunct', () => {
  assert.equal(isWokenGated(['woken']), true);
  assert.equal(isWokenGated(['woken', 'request-eligible']), true);
  assert.equal(isWokenGated(['due:daily || woken']), false);
  assert.equal(isWokenGated(['due:daily']), false);
});

// Nothing holds a task's lane past a failure park but the task's own word, and only
// as a whole conjunct: an alternative beside it means the task still runs some way.
test('a declaration holds its lane on a failure only when last-run-not-failed gates it', () => {
  assert.equal(holdsOnFailure(['due:daily', 'last-run-not-failed']), true);
  assert.equal(holdsOnFailure(['due:daily', 'last-run-not-failed || woken']), false);
  assert.equal(holdsOnFailure(['due:daily']), false);
  assert.equal(holdsOnFailure(undefined), false);
});

test('the retired frequency spells as the cadence term it always meant', () => {
  assert.equal(cadenceTermFor('daily'), 'due:daily');
  assert.equal(cadenceTermFor('monthly'), 'due:monthly');
  assert.equal(cadenceTermFor('manual'), 'woken');
});
