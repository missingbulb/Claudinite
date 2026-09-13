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
  const eve = nextVersion('1.0903.57', new Date('2026-09-03T20:00:00Z'));
  assert.equal(eve, '1.0903.58');
  assert.equal(nextVersion(eve, new Date('2026-09-04T20:00:00Z')), '1.0904.59');
});

test('an unparseable recorded version still yields a first release', () => {
  assert.equal(nextVersion('1.0.0', new Date('2026-09-04T20:00:00Z')), '1.0904.1');
  assert.equal(nextVersion(undefined, new Date('2026-09-04T20:00:00Z')), '1.0904.1');
});

// The major is a generation statement a person raises by hand; a release carries it
// over and never touches it.
test('the release carries the recorded major over', () => {
  assert.equal(nextVersion('3.0903.57', new Date('2026-09-04T20:00:00Z')), '3.0904.58');
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
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.0910.4' }, null, 2));
    writeFileSync(join(root, 'wrangler.json'), JSON.stringify({ assets: { directory: './site' } }));
    writeFileSync(join(root, 'site', 'index.html'), '<b title="version 1.0801.1">x</b>');

    assert.equal(bump(root, { stampOnly: true }), '1.0910.4');
    assert.match(readFileSync(join(root, 'site', 'index.html'), 'utf8'), /version 1\.0910\.4/);
    assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, '1.0910.4');

    assert.equal(bump(root, { now: new Date('2026-09-11T00:00:00Z') }), '1.0911.5');
    assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, '1.0911.5');
    assert.match(readFileSync(join(root, 'site', 'index.html'), 'utf8'), /version 1\.0911\.5/);
  });
});
