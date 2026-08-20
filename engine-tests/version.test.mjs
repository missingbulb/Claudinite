import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENGINE_VERSION, versionDay, parseVersion, isVersion, isDeclaredVersion, isLegacyVersion,
  compareVersions, versionAbove, versionsEqual, nextVersion, versionFromLiteral, VERSION_SOURCE,
} from '../engine/version.mjs';

test('the day part is the year anchored on 2020, then the month and day', () => {
  assert.equal(versionDay('2026-08-20'), 60820);
  assert.equal(versionDay(new Date('2026-08-20T23:59:59Z')), 60820);
  assert.equal(versionDay('2026-01-01'), 60101);
  // The anchor is what keeps the ordering true past 2029, where a last-digit year
  // would wrap to 0 and sort a decade of releases underneath.
  assert.ok(versionDay('2030-01-01') > versionDay('2029-12-31'));
  assert.equal(versionDay('not-a-date'), null);
});

test('both spellings parse to the same tuple shape, and nothing else does', () => {
  assert.deepEqual(parseVersion('60820.1'), { day: 60820, seq: 1 });
  assert.deepEqual(parseVersion('60820.12'), { day: 60820, seq: 12 });
  assert.deepEqual(parseVersion(6), { day: 6, seq: 0 });

  for (const bad of ['60820', '60820.0', '60820.', '.1', '0.1', 'v60820.1', '', null, undefined, -1, 1.5, {}]) {
    assert.equal(parseVersion(bad), null, `${JSON.stringify(bad)} is not a version`);
    assert.equal(isVersion(bad), false);
  }
  assert.equal(isLegacyVersion(6), true);
  assert.equal(isLegacyVersion('60820.1'), false);
});

test('zero is the install floor — readable, sorting below everything, never declarable', () => {
  assert.deepEqual(parseVersion(0), { day: 0, seq: 0 });
  assert.equal(isVersion(0), true, 'a stamp at the install floor says something, and must not read as absence');
  assert.equal(isDeclaredVersion(0), false, 'no manifest and no release may write the floor');
  assert.ok(compareVersions(0, 1) < 0);
  assert.ok(compareVersions(0, '60820.1') < 0);
});

test('equality refuses to be satisfied by a side it cannot price', () => {
  assert.equal(versionsEqual('60820.1', '60820.1'), true);
  assert.equal(versionsEqual(6, 6), true);
  assert.equal(versionsEqual('60820.1', 6), false);
  // compareVersions alone reads an unpriceable side as equal — the trap this closes.
  assert.equal(compareVersions('60820.1', undefined), 0);
  assert.equal(versionsEqual('60820.1', undefined), false);
});

test('a legacy integer sorts below every date-anchored version', () => {
  assert.ok(compareVersions(6, '60820.1') < 0);
  assert.ok(compareVersions(18, '60820.1') < 0);
  assert.ok(versionAbove('60820.1', 6));
  assert.ok(!versionAbove(6, '60820.1'));
});

test('the running number orders within a day, and the day orders across days', () => {
  // The reason a version is a STRING: as floats, 60820.10 and 60820.1 are one number.
  assert.ok(compareVersions('60820.10', '60820.9') > 0);
  assert.ok(compareVersions('60820.2', '60820.1') > 0);
  assert.ok(compareVersions('60821.1', '60820.99') > 0);
  assert.equal(compareVersions('60820.1', '60820.1'), 0);
});

test('an unpriceable side is no gap in either direction', () => {
  assert.equal(compareVersions(undefined, '60820.1'), 0);
  assert.equal(compareVersions('60820.1', 'nonsense'), 0);
  assert.equal(versionAbove('60820.1', null), false);
  assert.equal(versionAbove(null, '60820.1'), false);
});

test('the next version restarts at 1 on a new day and increments within one', () => {
  assert.equal(nextVersion('60820.1', '2026-08-20'), '60820.2');
  assert.equal(nextVersion('60820.9', '2026-08-20'), '60820.10');
  assert.equal(nextVersion('60820.4', '2026-08-21'), '60821.1');
  assert.equal(nextVersion(6, '2026-08-20'), '60820.1');
  assert.equal(nextVersion(null, '2026-08-20'), '60820.1');
});

test('a scraped literal keeps the spelling it was written in', () => {
  assert.equal(versionFromLiteral('60820.1'), '60820.1');
  assert.equal(versionFromLiteral(' 6 '), 6);
  assert.equal(versionFromLiteral('nope'), null);
  assert.equal(versionFromLiteral(null), null);
});

test('the scraper fragment matches both spellings and nothing ragged', () => {
  const anchored = new RegExp(`^(${VERSION_SOURCE})$`);
  assert.ok(anchored.test('60820.1'));
  assert.ok(anchored.test('6'));
  assert.equal(anchored.test('6.'), false);
  assert.equal(anchored.test('a.1'), false);
});

test('the engine ships a date-anchored version', () => {
  assert.ok(isVersion(ENGINE_VERSION));
  assert.equal(isLegacyVersion(ENGINE_VERSION), false,
    'the engine version is the corpus\'s own example of the format — it may not be the legacy spelling');
});
