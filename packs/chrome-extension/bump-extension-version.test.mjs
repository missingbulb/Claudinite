import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BumpError, bump, compare, nextVersion, readVersion, rewrite,
} from '../../packs/chrome-extension/stubs/actions/bump-extension-patch/bump.mjs';

test('nextVersion: the patch is what a shipped change raises', () => {
  assert.equal(nextVersion('1.2.3'), '1.2.4');
  assert.equal(nextVersion('1.2.3', 'patch'), '1.2.4');
});

test('nextVersion: minor and major each reset everything below them', () => {
  assert.equal(nextVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(nextVersion('1.2.3', 'major'), '2.0.0');
});

test('nextVersion: an off-scheme version or an unknown part is an error, never a guess', () => {
  assert.throws(() => nextVersion('1.2', 'patch'), BumpError);
  assert.throws(() => nextVersion('1.2.3', 'build'), BumpError);
});

test('compare: the ordering runs major, then minor, then patch, each numerically', () => {
  assert.equal(compare('1.2.4', '1.2.3'), 1);
  assert.equal(compare('1.10.0', '1.9.9'), 1);
  assert.equal(compare('1.2.3', '2.0.0'), -1);
  assert.equal(compare('1.2.3', '1.2.3'), 0);
});

test('readVersion: the version is read by the same token the rewrite replaces', () => {
  assert.equal(readVersion('manifest.json', '{"version": "1.2.3"}'), '1.2.3');
  assert.throws(() => readVersion('manifest.json', '{}'), BumpError);
});

test('rewrite: a version record carrying the token twice is refused rather than half-written', () => {
  assert.throws(
    () => rewrite('package.json', '{"version": "1.2.3", "x": {"version": "1.2.3"}}', '1.2.3', '1.2.4'),
    BumpError,
  );
});

test('bump: both records are validated before either is written', () => {
  const files = {
    'extension/manifest.json': '{\n  "version": "1.2.3"\n}\n',
    // Disagrees with the manifest, so nothing may be written at all.
    'package.json': '{\n  "version": "1.2.0"\n}\n',
  };
  const written = [];
  assert.throws(
    () => bump(Object.keys(files), 'patch', { read: (f) => files[f], write: (f, t) => written.push([f, t]) }),
    BumpError,
  );
  assert.deepEqual(written, []);
});

test('bump: the two records move together', () => {
  const files = {
    'extension/manifest.json': '{\n  "version": "1.2.3"\n}\n',
    'package.json': '{\n  "name": "x",\n  "version": "1.2.3"\n}\n',
  };
  const written = new Map();
  const next = bump(Object.keys(files), 'minor', { read: (f) => files[f], write: (f, t) => written.set(f, t) });
  assert.equal(next, '1.3.0');
  assert.equal(written.size, 2);
  for (const text of written.values()) assert.match(text, /"version": "1\.3\.0"/);
});
