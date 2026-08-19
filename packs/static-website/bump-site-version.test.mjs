import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BumpError, VERSION_RE, bump, nextVersion, readVersion, rewrite, ymmdd,
} from '../../packs/static-website/stubs/actions/bump-site-version/bump.mjs';

const utc = (iso) => new Date(`${iso}T12:00:00Z`);

test('ymmdd: last digit of the UTC year, then MMDD', () => {
  assert.equal(ymmdd(utc('2026-12-31')), '61231');
  assert.equal(ymmdd(utc('2027-01-01')), '70101');
  assert.equal(ymmdd(utc('2026-07-04')), '60704');
});

test('ymmdd: reads the date in UTC, not the runner local zone', () => {
  // 2026-01-01T00:30Z is still 2025-12-31 in every zone behind UTC. The version
  // must not depend on which region the job landed in.
  assert.equal(ymmdd(new Date('2026-01-01T00:30:00Z')), '60101');
});

test('nextVersion: a second release the same day increments the day counter', () => {
  assert.equal(nextVersion('1.61231.3', utc('2026-12-31')), '1.61231.4');
});

test('nextVersion: a new day resets the counter to 1', () => {
  assert.equal(nextVersion('1.61230.7', utc('2026-12-31')), '1.61231.1');
});

test('nextVersion: the year boundary stays monotonic — the flaw the year digit fixes', () => {
  // The bare-MMDD form this replaces produced 1.1231.3 -> 1.0101.1, which sorts
  // BACKWARDS. With the year digit the successor is strictly greater.
  const next = nextVersion('1.61231.3', utc('2027-01-01'));
  assert.equal(next, '1.70101.1');
  assert.ok(Number('70101') > Number('61231'));
});

test('nextVersion: the decade wrap bumps the major so ordering survives it', () => {
  assert.equal(nextVersion('1.91231.4', utc('2030-01-01')), '2.00101.1');
});

test('nextVersion: a version dated in the future is an error, not a wrap', () => {
  assert.throws(() => nextVersion('1.60704.1', utc('2026-07-03')), (err) => {
    assert.ok(err instanceof BumpError);
    assert.match(err.message, /ahead of today/);
    return true;
  });
});

test('nextVersion: an off-scheme current version is refused', () => {
  for (const bad of ['1.2.3', '1.1231.3', 'v1.60704.1', '', undefined]) {
    assert.throws(() => nextVersion(bad, utc('2026-07-04')), BumpError, `expected ${bad} to be refused`);
  }
});

test('VERSION_RE: accepts the scheme and only the scheme', () => {
  assert.ok(VERSION_RE.test('1.61231.3'));
  assert.ok(VERSION_RE.test('12.00101.987'));
  assert.ok(!VERSION_RE.test('1.1231.3'));   // no year digit
  assert.ok(!VERSION_RE.test('1.61231'));
});

test('rewrite: a JSON record keeps its formatting and changes one line', () => {
  const json = '{\n  "name": "site",\n  "version": "1.60704.1"\n}\n';
  assert.equal(
    rewrite('package.json', json, '1.60704.1', '1.60704.2'),
    '{\n  "name": "site",\n  "version": "1.60704.2"\n}\n',
  );
});

test('rewrite: a JSON record carrying the version twice is refused rather than half-written', () => {
  const json = '{"version": "1.60704.1", "x": {"version": "1.60704.1"}}';
  assert.throws(() => rewrite('package.json', json, '1.60704.1', '1.60704.2'), /exactly one/);
});

test('rewrite: a bare version file must already hold the current version', () => {
  assert.equal(rewrite('VERSION', '1.60704.1\n', '1.60704.1', '1.60704.2'), '1.60704.2\n');
  assert.throws(() => rewrite('VERSION', '1.60101.9\n', '1.60704.1', '1.60704.2'), /disagree/);
});

test('readVersion: from a JSON field, or the whole bare file', () => {
  assert.equal(readVersion('package.json', '{"version": "1.60704.1"}'), '1.60704.1');
  assert.equal(readVersion('VERSION', ' 1.60704.1\n'), '1.60704.1');
  assert.throws(() => readVersion('package.json', '{}'), /no "version" field/);
});

test('bump: writes every record together, and writes none when one is invalid', () => {
  const files = {
    'package.json': '{"version": "1.60704.1"}',
    VERSION: '1.60704.1\n',
  };
  const written = {};
  const next = bump(Object.keys(files), utc('2026-07-04'), {
    read: (f) => files[f],
    write: (f, text) => { written[f] = text; },
  });
  assert.equal(next, '1.60704.2');
  assert.deepEqual(written, { 'package.json': '{"version": "1.60704.2"}', VERSION: '1.60704.2\n' });

  const disagreeing = { 'package.json': '{"version": "1.60704.1"}', VERSION: '9.99999.9\n' };
  const late = {};
  assert.throws(() => bump(Object.keys(disagreeing), utc('2026-07-04'), {
    read: (f) => disagreeing[f],
    write: (f, text) => { late[f] = text; },
  }), BumpError);
  assert.deepEqual(late, {}, 'a validation failure must not leave a half-bumped tree');
});
