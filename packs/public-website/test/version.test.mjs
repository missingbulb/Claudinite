import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, git, makeRepo } from '../../../engine-tests/helpers.mjs';
import { bumpedFiles, nextVersion, stampHtml } from '../public/version.mjs';
import { bump } from '../bump-version.mjs';

// The build is a monotonic counter rather than a per-day one, so two releases either
// side of midnight cannot land on the same version.
test('the version advances across a day rollover', () => {
  const eve = nextVersion('1.10903.57', new Date('2026-09-03T20:00:00Z'));
  assert.equal(eve, '1.10903.58');
  assert.equal(nextVersion(eve, new Date('2026-09-04T20:00:00Z')), '1.10904.59');
});

// The whole point of the year offset. A bare MMDD goes BACKWARDS every New Year —
// 1231 then 0101 — so the middle part could not be read as "later means bigger" and
// the ordering rested entirely on the build counter. Counting years from the epoch
// makes it strictly increasing forever, with no wrap to absorb.
test('the middle part keeps increasing across a year rollover', () => {
  const eve = nextVersion('1.11230.4', new Date('2026-12-31T20:00:00Z'));
  assert.equal(eve, '1.11231.5');
  const day = nextVersion(eve, new Date('2027-01-01T20:00:00Z'));
  assert.equal(day, '1.20101.6');
  assert.ok(Number(day.split('.')[1]) > Number(eve.split('.')[1]),
    'the new year must sort above the old one');
});

// A year is one step, whatever its digits do: 2035 takes the offset to two digits and
// the middle part to six, which is still numerically above 2034's five.
test('the offset keeps ordering when it reaches two digits', () => {
  const y2034 = nextVersion('1.91231.9', new Date('2034-12-31T20:00:00Z'));
  assert.equal(y2034, '1.91231.10');
  const y2035 = nextVersion(y2034, new Date('2035-01-01T20:00:00Z'));
  assert.equal(y2035, '1.100101.11');
  assert.ok(Number(y2035.split('.')[1]) > Number(y2034.split('.')[1]));
});

test('an unparseable recorded version still yields a first release', () => {
  assert.equal(nextVersion('1.0.0', new Date('2026-09-04T20:00:00Z')), '1.10904.1');
  assert.equal(nextVersion(undefined, new Date('2026-09-04T20:00:00Z')), '1.10904.1');
});

// The major is a generation statement a person raises by hand; a release carries it
// over and never touches it.
test('the release carries the recorded major over', () => {
  assert.equal(nextVersion('3.10903.57', new Date('2026-09-04T20:00:00Z')), '3.10904.58');
});

test('the stamp rewrites every version title and leaves a page without one alone', () => {
  const page = '<p class="copyright" title="version 1.0903.57">c</p><i title="version 1.0903.57"></i>';
  assert.equal(
    stampHtml(page, '1.0904.58'),
    '<p class="copyright" title="version 1.0904.58">c</p><i title="version 1.0904.58"></i>',
  );
  assert.equal(stampHtml('<p title="a page">no stamp here</p>', '1.0904.58'), '<p title="a page">no stamp here</p>');
});

// The seam a release uses: a set of file contents built from a read function, so
// the bump can be committed onto a branch tip without a checkout. Pages anywhere in
// the tree are stamped — the stamp is the page's opt-in, and nothing here knows
// which directory is served.
test('bumpedFiles rewrites the record and every stamped page, wherever it sits', () => {
  const tree = {
    'package.json': '{\n  "name": "site",\n  "version": "1.10910.4"\n}\n',
    'site/index.html': '<b title="version 1.10910.4">x</b>',
    'docs/nested/about.html': '<b title="version 1.10801.1">x</b>',
    'site/plain.html': '<b title="about us">x</b>',
    'notes/a.txt': 'title="version 0"',
  };
  const result = bumpedFiles({ read: (p) => tree[p] ?? null, tracked: Object.keys(tree), now: new Date('2026-09-11T00:00:00Z') });
  assert.equal(result.version, '1.10911.5');
  assert.deepEqual(Object.keys(result.files).sort(), ['docs/nested/about.html', 'package.json', 'site/index.html']);
  assert.equal(JSON.parse(result.files['package.json']).name, 'site', 'the record keeps its other fields');
  assert.match(result.files['docs/nested/about.html'], /version 1\.10911\.5/);
});

test('bumpedFiles is null with no version record, and stamp-only rewrites no record', () => {
  assert.equal(bumpedFiles({ read: () => null, tracked: ['index.html'] }), null);
  const tree = { 'package.json': '{ "version": "1.10910.4" }', 'index.html': '<b title="version 1.0801.1">x</b>' };
  const result = bumpedFiles({ read: (p) => tree[p] ?? null, tracked: Object.keys(tree), stampOnly: true });
  assert.equal(result.version, '1.10910.4');
  assert.deepEqual(Object.keys(result.files), ['index.html']);
});

// --stamp-only is the drift repair, and a repair that consumed a version number would
// be a release nobody shipped. The CLI reads git's file list, so an untracked page is
// left alone.
test('the CLI repairs the tracked pages in place, and only a real bump advances the record', () => {
  const root = makeRepo({ base: {
    'package.json': '{\n  "version": "1.10910.4"\n}\n',
    'site/index.html': '<b title="version 1.0801.1">x</b>',
  } });
  try {
    writeFileSync(join(root, 'site', 'scratch.html'), '<b title="version 1.0801.1">x</b>');
    assert.equal(bump(root, { stampOnly: true }), '1.10910.4');
    assert.match(readFileSync(join(root, 'site', 'index.html'), 'utf8'), /version 1\.10910\.4/);
    assert.match(readFileSync(join(root, 'site', 'scratch.html'), 'utf8'), /version 1\.0801\.1/, 'untracked page untouched');
    assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, '1.10910.4');

    assert.equal(bump(root, { now: new Date('2026-09-11T00:00:00Z') }), '1.10911.5');
    assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, '1.10911.5');
    assert.match(readFileSync(join(root, 'site', 'index.html'), 'utf8'), /version 1\.10911\.5/);
    assert.match(git(root, 'status', '--short'), /package\.json/);
  } finally { cleanup(root); }
});
