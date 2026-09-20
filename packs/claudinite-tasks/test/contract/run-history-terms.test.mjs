import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePreconditions, parsePreconditions, validatePreconditions, preconditionSignals } from '../../src/contract/precondition-policy.mjs';
import { cadenceOf, statesConditions, holdsOnFailure, cadenceTermFor } from '../../src/contract/calendar.mjs';

// The run-history terms (docs/PRINCIPLES.md): a task's cadence, its view of
// its own last failure, and whether it runs only when somebody asks — every one a
// condition over the `runs` signal, the task's own unqualified work items newest
// first, read at every scheduler tick. Pure over that bundle, so each case here is
// the real evaluator against a hand-built history at a chosen instant.

const NOW = '2026-09-09T16:20:00Z'; // a Wednesday; its day opened at 00:00Z, its week on Sunday the 6th
const run = (over = {}) => ({
  number: 10, createdAt: '2026-09-08T04:05:00Z', closedAt: '2026-09-08T04:40:00Z', state: 'closed',
  status: 'task:status:done', park: null, outcome: 'done', ...over,
});
const runs = (...list) => ({ runs: { list, horizonDays: 40 } });
const evaluate = (preconditions, signals, over = {}) =>
  evaluatePreconditions({ preconditions, signals, now: NOW, windowDays: 1.05, ...over });

// --- the cadence term -------------------------------------------------------
// The periods themselves, the retired `due:` spelling and the woken short-circuit are
// `cadence-without-anchors.test.mjs`. What is here is what that file does not cover:
// which run counts, and what an illegal argument does.

test('a run still open counts — an item that started inside this period is its run', () => {
  const open = run({ createdAt: '2026-09-09T04:05:00Z', closedAt: null, state: 'open', status: 'task:status:needs-human-failure', park: 'failure', outcome: null });
  assert.equal(evaluate(['schedule:at-most-daily'], runs(open)).run, false);
});

test('a woken item still answers to the task\'s OTHER conditions', () => {
  const today = run({ createdAt: '2026-09-09T04:05:00Z', closedAt: '2026-09-09T04:30:00Z' });
  const woken = { item: { number: 11, woken: true } };
  assert.equal(evaluate(['schedule:at-most-daily'], runs(today), woken).run, true);
  assert.equal(evaluate(['schedule:at-most-daily', 'substantive-change'], { ...runs(today), commits: { substantiveChange: false } }, woken).run, false);
});

test('schedule takes exactly one of the three cadences, and cannot answer with no instant', () => {
  assert.match(evaluate(['schedule:at-most-hourly'], runs()).error, /"schedule" takes one of at-most-daily, at-most-weekly, at-most-monthly/);
  assert.match(evaluate(['schedule'], runs()).error, /takes an inline argument/);
  const problems = validatePreconditions(['schedule:at-most-fortnightly']);
  assert.equal(problems.length, 1);
  assert.match(problems[0].what, /not "at-most-fortnightly"/);
  assert.deepEqual(validatePreconditions(['schedule:at-most-weekly']), []);
  assert.match(evaluate(['schedule:at-most-daily'], runs(), { now: null }).error, /no instant/);
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

// --- last-run-not-parked ------------------------------------------------------

test('last-run-not-parked declines while the newest run stands at ANY of the four parks', () => {
  assert.equal(evaluate(['last-run-not-parked'], runs()).run, true, 'nothing ran');
  assert.equal(evaluate(['last-run-not-parked'], runs(run())).run, true, 'done');
  assert.equal(evaluate(['last-run-not-parked'], runs(run({ status: 'task:status:rejected', outcome: 'rejected' }))).run, true, 'a decline is not a park');

  // Where it differs from last-run-not-failed: an unmerged pull request waiting
  // for a person parks on approval, which is not a fault and which that term
  // reads as clear.
  for (const park of ['failure', 'approval', 'action', 'decision']) {
    const parked = run({ number: 12, closedAt: null, state: 'open', status: `task:status:needs-human-${park}`, park, outcome: null });
    const v = evaluate(['last-run-not-parked'], runs(parked));
    assert.equal(v.run, false, `${park} holds the next run back`);
    assert.match(v.reason, new RegExp(`#12.*${park}`));
  }

  // Only the NEWEST run speaks, as for every other run-history term: a park
  // behind a later clean run is history, and re-queueing the parked item is what
  // puts a run in front of it.
  const parked = run({ number: 12, closedAt: null, state: 'open', status: 'task:status:needs-human-approval', park: 'approval', outcome: null });
  assert.equal(evaluate(['last-run-not-parked'], runs(run({ number: 13, createdAt: '2026-09-09T05:00:00Z' }), parked)).run, true);
});

// --- the empty expression -----------------------------------------------------
// A task stating no condition is not on the schedule; at the pick of an item
// somebody created for it, the empty expression holds.

test('the empty expression holds at a pick and reads no signal', () => {
  const v = evaluate([], {}, { item: { number: 5, woken: true } });
  assert.equal(v.run, true);
  assert.match(v.reason, /no conditions stated/);
  assert.deepEqual(preconditionSignals([], new Map()), []);
  assert.deepEqual(validatePreconditions([], new Map()), []);
});

test('the run-history terms read the runs signal', () => {
  assert.deepEqual(preconditionSignals(['due:daily'], new Map()), ['runs']);
  assert.deepEqual(preconditionSignals(['last-run-over:1d', 'last-run-not-failed'], new Map()), ['runs']);
  assert.deepEqual(preconditionSignals(['request-eligible'], new Map([['request-eligible', { signals: ['request'] }]])), ['request']);
});

// --- none is retired ----------------------------------------------------------

test('`none` is retired: absence is how a task states no condition', () => {
  const parsed = parsePreconditions(['none']);
  assert.equal(parsed.kind, 'invalid');
  assert.match(parsed.reason, /leave "preconditions" out/);
  assert.match(evaluate(['none'], {}).error, /schedule:at-most-daily/);
  assert.equal(validatePreconditions(['none']).length, 1);
  assert.match(validatePreconditions(['none'])[0].fix, /schedule:at-most-<daily\|weekly\|monthly>/);
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

test('cadenceOf reads the first cadence term, and nothing where there is none', () => {
  assert.deepEqual(cadenceOf(['schedule:at-most-weekly', 'repo-active']), { kind: 'period', cadence: 'weekly' });
  assert.deepEqual(cadenceOf(['substantive-change', 'schedule:at-most-monthly']), { kind: 'period', cadence: 'monthly' });
  assert.equal(cadenceOf(['request-eligible']), null);
  assert.equal(cadenceOf(['substantive-change']), null, 'movement alone: asked at every tick, runs on movement');
  assert.equal(cadenceOf(undefined), null);
  assert.equal(cadenceOf([]), null);
});

// A declaration states conditions or it does not: absent and empty read the same,
// and a blank entry states nothing.
test('statesConditions is the one read of whether a task has a schedule at all', () => {
  assert.equal(statesConditions(['schedule:at-most-daily']), true);
  assert.equal(statesConditions(['request-eligible']), true);
  assert.equal(statesConditions([]), false);
  assert.equal(statesConditions(undefined), false);
  assert.equal(statesConditions(['']), false);
});

// Nothing holds a task's lane past a failure park but the task's own word, and only
// as a whole conjunct: an alternative beside it means the task still runs some way.
test('a declaration holds its lane on a failure only when last-run-not-failed gates it', () => {
  assert.equal(holdsOnFailure(['due:daily', 'last-run-not-failed']), true);
  assert.equal(holdsOnFailure(['due:daily', 'last-run-not-failed || repo-active']), false);
  assert.equal(holdsOnFailure(['due:daily']), false);
  assert.equal(holdsOnFailure(undefined), false);
});

test('the retired frequency spells as the cadence term it always meant, and manual as no term', () => {
  assert.equal(cadenceTermFor('daily'), 'schedule:at-most-daily');
  assert.equal(cadenceTermFor('monthly'), 'schedule:at-most-monthly');
  assert.equal(cadenceTermFor('manual'), null);
});
