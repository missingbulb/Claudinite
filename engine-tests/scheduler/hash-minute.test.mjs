import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DEFAULT_SCHEDULE } from '../../engine/scheduler/calendar.mjs';
import assert from 'node:assert/strict';
import { hashedMinute, hashedCron, MINUTE_MIN, MINUTE_MAX } from '../../engine/scheduler/hash-minute.mjs';

// Golden values pin the hash function itself: if the algorithm ever changes, every
// repo's stable minute moves and the fleet re-stampedes — so these must fail loudly
// on any change, not be quietly updated. Computed from the current FNV-1a over the
// lowercased full name.
test('known repos map to their pinned minutes', () => {
  assert.equal(hashedMinute('missingbulb/GoogleCalendarEventCreator'), 24);
  assert.equal(hashedMinute('missingbulb/Claudinite'), 44);
  assert.equal(hashedMinute('missingbulb/EdFringeNow'), 49);
  assert.equal(hashedMinute('missingbulb/Shepherd'), 11);
});

test('every minute lands in the :10–:50 band the shape check enforces', () => {
  for (let i = 0; i < 500; i += 1) {
    const m = hashedMinute(`missingbulb/repo-${i}`);
    assert.ok(Number.isInteger(m), `minute for repo-${i} is an integer`);
    assert.ok(m >= MINUTE_MIN && m <= MINUTE_MAX, `minute ${m} for repo-${i} is in [${MINUTE_MIN}, ${MINUTE_MAX}]`);
  }
});

test('the hash is deterministic — same name, same minute', () => {
  assert.equal(hashedMinute('missingbulb/Claudinite'), hashedMinute('missingbulb/Claudinite'));
});

test('the hash is case-insensitive (keyed on the lowercased name)', () => {
  assert.equal(
    hashedMinute('missingbulb/GoogleCalendarEventCreator'),
    hashedMinute('missingbulb/googlecalendareventcreator'),
  );
});

test('the band is well-spread — a realistic fleet covers the whole window', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i += 1) seen.add(hashedMinute(`missingbulb/repo-${i}`));
  // 41 slots in [10, 50]; a good hash reaches every one over a few hundred names.
  assert.equal(seen.size, MINUTE_MAX - MINUTE_MIN + 1);
});

test('hashedCron is the full two-tick line the workflow holds', () => {
  assert.equal(hashedCron('missingbulb/GoogleCalendarEventCreator', 4), '24 4,16 * * *');
  // "<minute> <anchor>,<drain> * * *" — two ticks a day, twelve hours apart (DESIGN §17).
  assert.match(hashedCron('missingbulb/anything', 4), /^([1-9]\d?) \d{1,2},\d{1,2} \* \* \*$/);
});

test('both cron hours follow the repo\'s own dailyHour, and the drain wraps the day', () => {
  const hours = (name, h) => hashedCron(name, h).split(' ')[1].split(',').map(Number);
  assert.deepEqual(hours('o/r', 0), [0, 12]);
  assert.deepEqual(hours('o/r', 5), [5, 17]);
  assert.deepEqual(hours('o/r', 12), [12, 0], 'the drain tick wraps past midnight');
  assert.deepEqual(hours('o/r', 23), [23, 11]);
  // Every legal anchor produces two distinct in-range hours — a cron GitHub will accept.
  for (let h = 0; h <= 23; h += 1) {
    const [a, d] = hours('o/r', h);
    assert.equal(a, h);
    assert.ok(a >= 0 && a <= 23 && d >= 0 && d <= 23, `hours in range for ${h}`);
    assert.notEqual(a, d);
  }
});

// A member's VENDORED worker is a cycle stale and may still call this with one argument. It must
// get the default-schedule answer — right for every repo that has not moved its anchor — rather
// than an `undefined` that would write a cron GitHub rejects outright.
test('a one-argument call from a stale worker still writes a valid cron', () => {
  assert.equal(hashedCron('missingbulb/GoogleCalendarEventCreator'),
    hashedCron('missingbulb/GoogleCalendarEventCreator', DEFAULT_SCHEDULE.dailyHour));
  assert.match(hashedCron('o/r'), /^([1-9]\d?) \d{1,2},\d{1,2} \* \* \*$/);
});

// The drift guard the duplication needs. `hash-minute.mjs` imports nothing by contract, so it
// carries its own copy of the default anchor hour; if `calendar.mjs` ever moves DEFAULT_SCHEDULE,
// a stale worker's one-argument call would silently write a cron for the wrong hour.
test('hash-minute\'s default anchor hour agrees with the calendar\'s DEFAULT_SCHEDULE', () => {
  const src = readFileSync(new URL('../../engine/scheduler/hash-minute.mjs', import.meta.url), 'utf8');
  const declared = Number(/const DEFAULT_DAILY_HOUR = (\d+);/.exec(src)?.[1]);
  assert.equal(declared, DEFAULT_SCHEDULE.dailyHour,
    'hash-minute.mjs duplicates calendar.mjs DEFAULT_SCHEDULE.dailyHour — move both together');
});
