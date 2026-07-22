import { test } from 'node:test';
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
  assert.equal(hashedMinute('missingbulb/Sheepdog'), 10);
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

test('hashedCron is the full hourly line the workflow holds', () => {
  assert.equal(hashedCron('missingbulb/GoogleCalendarEventCreator'), '24 * * * *');
  // Hourly shape: "<minute> * * * *".
  assert.match(hashedCron('missingbulb/anything'), /^([1-9]\d?) \* \* \* \*$/);
});
