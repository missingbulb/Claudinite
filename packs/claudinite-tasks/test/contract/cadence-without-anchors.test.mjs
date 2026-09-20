import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePreconditions, validatePreconditions } from '../../src/contract/precondition-policy.mjs';
import {
  anchorInstant, cadenceOf, scheduleTermFor, SCHEDULE_TERM, CADENCES,
} from '../../src/contract/calendar.mjs';
import { normalizeTaskDeclaration } from '../../src/contract/task-contract.mjs';
import { nextAnchor } from '../../src/items/anchors.mjs';

// THE CADENCE IS THE UTC CALENDAR, and nothing a repo configures (#1995). A period
// starts at midnight UTC: the day it is in, the Sunday that opened its week, the 1st
// that opened its month. `anchorInstant` therefore takes a cadence and an instant and
// nothing else, and two repos asked at the same moment get the same answer.
//
// The vocabulary that states it is `schedule:at-most-<cadence>`, which says out loud
// what the term is: a rate limit on the scheduler's own asking, not a content gate.
// `due:<cadence>` is the same function under its old name, permanently accepted the
// way a retired frequency token is, because a task declaration is member-owned data
// that no vendoring pass rewrites.

const run = (over = {}) => ({
  number: 10, createdAt: '2026-09-08T04:05:00Z', closedAt: '2026-09-08T04:40:00Z',
  state: 'closed', status: 'task:status:done', park: null, outcome: 'done', ...over,
});
const runs = (...list) => ({ runs: { list, horizonDays: 40 } });
const at = (iso) => (preconditions, signals) =>
  evaluatePreconditions({ preconditions, signals, now: iso, windowDays: 1.05 });

// --- the anchor is a UTC period start ----------------------------------------

test('anchorInstant takes a cadence and an instant, and answers in whole UTC periods', () => {
  // A Wednesday. The day opened at 00:00Z, its week on Sunday the 6th, its month on the 1st.
  const now = new Date('2026-09-09T16:20:00Z');
  assert.equal(anchorInstant('daily', now).toISOString(), '2026-09-09T00:00:00.000Z');
  assert.equal(anchorInstant('weekly', now).toISOString(), '2026-09-06T00:00:00.000Z');
  assert.equal(anchorInstant('monthly', now).toISOString(), '2026-09-01T00:00:00.000Z');
  assert.equal(anchorInstant('manual', now), null, 'nothing schedules a manual task');
});

test('a period that opens exactly now is this period, not the previous one', () => {
  assert.equal(anchorInstant('daily', new Date('2026-09-15T00:00:00.000Z')).toISOString(), '2026-09-15T00:00:00.000Z');
  assert.equal(anchorInstant('daily', new Date('2026-09-14T23:59:59.999Z')).toISOString(), '2026-09-14T00:00:00.000Z');
  // Sunday the 13th opens its own week.
  assert.equal(anchorInstant('weekly', new Date('2026-09-13T00:00:00.000Z')).toISOString(), '2026-09-13T00:00:00.000Z');
  assert.equal(anchorInstant('weekly', new Date('2026-09-12T23:59:59.999Z')).toISOString(), '2026-09-06T00:00:00.000Z');
});

// THE WHOLE POINT OF THE CHANGE. Under the retired per-repo anchor these two instants
// answered differently: before `dailyHour` the current period was still yesterday's,
// so the same run read as consumed at 03:00 and as open at 09:00. A UTC date has no
// such seam, and a reader reasoning about "today" is now right.
test('the same facts read the same at every hour of the day', () => {
  const yesterday = run({ createdAt: '2026-10-07T06:00:00Z', closedAt: '2026-10-07T06:30:00Z' });
  for (const hour of ['00:30', '03:00', '09:00', '23:30']) {
    const v = at(`2026-10-08T${hour}:00Z`)(['schedule:at-most-daily'], runs(yesterday));
    assert.equal(v.run, true, `at ${hour} yesterday's run does not consume today`);
  }
});

// --- schedule:at-most-<cadence> ----------------------------------------------

test('schedule:at-most-daily holds until a run is created or closed inside the UTC day', () => {
  const now = at('2026-09-09T16:20:00Z');
  assert.equal(now(['schedule:at-most-daily'], runs()).run, true, 'no run at all');
  assert.equal(now(['schedule:at-most-daily'], runs(run())).run, true, 'yesterday is a different day');
  const today = run({ createdAt: '2026-09-09T04:05:00Z', closedAt: '2026-09-09T04:30:00Z' });
  assert.equal(now(['schedule:at-most-daily'], runs(today)).run, false);
  // Both halves of the occurrence guard: a run that started yesterday and closed today
  // consumed today too, or a second item is filed on top of one still running.
  const straddling = run({ createdAt: '2026-09-08T23:50:00Z', closedAt: '2026-09-09T00:10:00Z' });
  assert.equal(now(['schedule:at-most-daily'], runs(straddling)).run, false);
});

test('at-most-weekly and at-most-monthly measure the UTC week and month', () => {
  const now = at('2026-09-09T16:20:00Z');
  const thisWeek = run({ createdAt: '2026-09-07T04:05:00Z', closedAt: '2026-09-07T05:00:00Z' });
  const lastWeek = run({ createdAt: '2026-09-04T04:05:00Z', closedAt: '2026-09-04T05:00:00Z' });
  assert.equal(now(['schedule:at-most-weekly'], runs(thisWeek)).run, false, 'Monday the 7th is inside this week');
  assert.equal(now(['schedule:at-most-weekly'], runs(lastWeek)).run, true, 'Friday the 4th is before Sunday the 6th');
  assert.equal(now(['schedule:at-most-monthly'], runs(lastWeek)).run, false, 'the 4th is inside September');
  assert.equal(now(['schedule:at-most-monthly'], runs(run({ createdAt: '2026-08-31T04:05:00Z', closedAt: '2026-08-31T05:00:00Z' }))).run, true);
});

test('a woken item satisfies the term, and the reason says the wake stood in for it', () => {
  const today = run({ createdAt: '2026-09-09T04:05:00Z', closedAt: '2026-09-09T04:30:00Z' });
  const v = evaluatePreconditions({
    preconditions: ['schedule:at-most-daily'], signals: runs(today),
    now: '2026-09-09T16:20:00Z', item: { number: 11, woken: true },
  });
  assert.equal(v.run, true);
  assert.match(v.reason, /woken by hand/);
});

test('the argument must be a cadence this vocabulary knows', () => {
  for (const cadence of CADENCES) {
    assert.deepEqual(validatePreconditions([scheduleTermFor(cadence)]), []);
  }
  for (const bad of ['schedule:at-most-hourly', 'schedule:daily', 'schedule:every-24h', 'schedule']) {
    assert.notDeepEqual(validatePreconditions([bad]), [], `${bad} is not a cadence`);
  }
  assert.equal(scheduleTermFor('daily'), `${SCHEDULE_TERM}:at-most-daily`);
});

// --- due: is the same function under its old name ----------------------------

test('due:<cadence> reads as schedule:at-most-<cadence> everywhere', () => {
  const today = run({ createdAt: '2026-09-09T04:05:00Z', closedAt: '2026-09-09T04:30:00Z' });
  const now = at('2026-09-09T16:20:00Z');
  for (const cadence of CADENCES) {
    assert.deepEqual(
      now([`due:${cadence}`], runs(today)),
      now([scheduleTermFor(cadence)], runs(today)),
      `due:${cadence} and its current spelling are one term`,
    );
  }
  assert.deepEqual(cadenceOf(['due:weekly']), cadenceOf(['schedule:at-most-weekly']));
  assert.deepEqual(cadenceOf(['schedule:at-most-weekly']), { kind: 'period', cadence: 'weekly' });
});

test('the door rewrites a loaded declaration to the current spelling', () => {
  const decl = normalizeTaskDeclaration({
    id: 'x', description: 'd', trigger: 'schedule',
    preconditions: ['due:daily', 'substantive-change', 'touched || due:weekly'],
    expected_outcome: 'no_code_changes',
  });
  assert.deepEqual(decl.preconditions, [
    'schedule:at-most-daily', 'substantive-change', 'touched || schedule:at-most-weekly',
  ]);
});

// --- last-run-over: is gone --------------------------------------------------

test('last-run-over: names no term, and says so rather than failing silently', () => {
  for (const retired of ['last-run-over:1d', 'last-run-over:12h', 'last-run-over:7d']) {
    assert.notDeepEqual(validatePreconditions([retired]), [], `${retired} is retired`);
    const v = evaluatePreconditions({ preconditions: [retired], signals: runs(), now: '2026-09-09T16:20:00Z' });
    assert.match(v.error ?? '', /unknown precondition/, 'an unknown term is a failed run, never a quiet decline');
  }
  assert.equal(cadenceOf(['last-run-over:1d']), null);
});

// A caller still passing the retired `(frequency, schedule, now)` hands `nextAnchor` a
// schedule where the instant goes, and an unreadable instant made every comparison in
// its walk false: the loop ran forever rather than returning. Nothing about the answer
// is interesting here; not hanging is.
test('nextAnchor terminates on an instant it cannot read', () => {
  // `null` is left out deliberately: `new Date(null)` is the epoch, a real instant.
  for (const bad of [undefined, {}, 'not a date', NaN]) {
    assert.equal(nextAnchor('daily', bad), null);
    assert.equal(nextAnchor('weekly', bad), null);
    assert.equal(nextAnchor('monthly', bad), null);
  }
});
