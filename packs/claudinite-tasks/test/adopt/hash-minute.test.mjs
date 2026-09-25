import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { hashedMinute, hashedCron, hashedHours, isSchedulerCron, MINUTE_MIN, MINUTE_MAX } from '../../src/adopt/hash-minute.mjs';

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
  // "<minute> <anchor>,<drain> * * *" — two ticks a day, twelve hours apart (PRINCIPLES.md).
  assert.match(hashedCron('missingbulb/anything'), /^([1-9]\d?) \d{1,2},\d{1,2} \* \* \*$/);
  assert.equal(hashedCron('o/r'), hashedCron('o/r'), 'a pure function of the name');
});

// THE HOUR IS HASHED, NOT CONFIGURED (#1995). What the retired `dailyHour` reliably
// did was spread the fleet across the clock, and the hash does that without a knob.
test('both cron hours come from the repo name, twelve apart, inside the day', () => {
  const seen = new Set();
  for (let i = 0; i < 400; i += 1) {
    const { anchor, drain } = hashedHours(`owner/repo-${i}`);
    assert.ok(anchor >= 0 && anchor <= 11, `anchor in the first half of the day for ${i}`);
    assert.equal(drain, anchor + 12, 'the drain is twelve hours after the anchor');
    assert.ok(drain <= 23, 'and still inside the same day');
    seen.add(anchor);
  }
  assert.equal(seen.size, 12, 'every hour of the anchor band is reachable');
});

// The shape the update keeps rather than restamping. A line outside it is not one
// this repo wrote, so the update replaces it instead of preserving a broken cron.
test('isSchedulerCron accepts what hashedCron writes, and nothing malformed', () => {
  for (const name of ['o/r', 'missingbulb/Claudinite', 'a/b']) {
    assert.ok(isSchedulerCron(hashedCron(name)), name);
  }
  assert.ok(isSchedulerCron('44 5,17 * * *'), 'a cron written before the hour was hashed');
  for (const bad of ['10 * * * *', '5 4,16 * * *', '44 5,18 * * *', '44 13,1 * * *', '', 'nonsense', null]) {
    assert.equal(isSchedulerCron(bad), false, JSON.stringify(bad));
  }
});
