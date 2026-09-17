import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeTree } from '../../../engine/remove-tree.mjs';
import { bump, nextVersion, stampHtml, stampPages } from '../bump-version.mjs';

const withTemp = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'cloudflare-site-test-'));
  try { return fn(dir); } finally { removeTree(dir); }
};

// The patch is a monotonic counter rather than a per-day one, so two releases either
// side of midnight cannot land on the same version.
test('the version advances across a day rollover', () => {
  const eve = nextVersion('1.10903.57', new Date('2026-09-03T20:00:00Z'));
  assert.equal(eve, '1.10903.58');
  assert.equal(nextVersion(eve, new Date('2026-09-04T20:00:00Z')), '1.10904.59');
});

// The whole point of the year offset. A bare MMDD goes BACKWARDS every New Year —
// 1231 then 0101 — so the minor could not be read as "later means bigger" and the
// ordering rested entirely on the patch counter. Counting years from the epoch makes
// the minor strictly increasing forever, with no wrap to absorb.
test('the minor keeps increasing across a year rollover', () => {
  const eve = nextVersion('1.11230.4', new Date('2026-12-31T20:00:00Z'));
  assert.equal(eve, '1.11231.5');
  const day = nextVersion(eve, new Date('2027-01-01T20:00:00Z'));
  assert.equal(day, '1.20101.6');
  assert.ok(Number(day.split('.')[1]) > Number(eve.split('.')[1]),
    'the new year must sort above the old one');
});

// A year is one step, whatever its digits do: 2035 takes the offset to two digits and
// the minor to six, which is still numerically above 2034's five.
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

test('stamping reaches pages nested under the published tree', () => {
  withTemp((dir) => {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'index.html'), '<b title="version 0">x</b>');
    writeFileSync(join(dir, 'docs', 'a.html'), '<b title="version 0">x</b>');
    writeFileSync(join(dir, 'docs', 'a.txt'), 'title="version 0"');
    assert.equal(stampPages(dir, '1.0904.1').length, 2);
    assert.match(readFileSync(join(dir, 'docs', 'a.html'), 'utf8'), /version 1\.0904\.1/);
    assert.match(readFileSync(join(dir, 'docs', 'a.txt'), 'utf8'), /version 0/);
  });
});

// --stamp-only is the drift repair, and a repair that consumed a version number would
// be a release nobody shipped.
test('a stamp-only run repairs the pages and consumes no version', () => {
  withTemp((root) => {
    mkdirSync(join(root, 'site'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.10910.4' }, null, 2));
    writeFileSync(join(root, 'wrangler.json'), JSON.stringify({ assets: { directory: './site' } }));
    writeFileSync(join(root, 'site', 'index.html'), '<b title="version 1.0801.1">x</b>');

    assert.equal(bump(root, { stampOnly: true }), '1.10910.4');
    assert.match(readFileSync(join(root, 'site', 'index.html'), 'utf8'), /version 1\.10910\.4/);
    assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, '1.10910.4');

    assert.equal(bump(root, { now: new Date('2026-09-11T00:00:00Z') }), '1.10911.5');
    assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, '1.10911.5');
    assert.match(readFileSync(join(root, 'site', 'index.html'), 'utf8'), /version 1\.10911\.5/);
  });
});
