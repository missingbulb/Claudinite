import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLocate, locateMatches, locateCandidates, locateData } from '../../engine/pack_loader/locate.mjs';

const ctxOf = (files) => ({ tracked: Object.keys(files), read: (p) => (p in files ? files[p] : null) });

test('a path-only locate matches on the listing alone and reads nothing', () => {
  const locate = { about: 'acme.toml near the root', paths: /^([^/]+\/)?acme\.toml$/ };
  const reads = [];
  const ctx = { tracked: ['app/acme.toml'], read: (p) => { reads.push(p); return null; } };
  assert.equal(locateMatches(locate, ctx), true);
  assert.equal(locateMatches(locate, ctxOf({ 'a/b/acme.toml': '' })), false);
  assert.deepEqual(reads, []);
});

test('a text locate reads only the files its paths name, and every pattern must match the same file', () => {
  const locate = { about: 'both libs in one manifest', paths: /(^|\/)requirements\.txt$/, text: [/\bacme\b/, /\bwidget\b/], search: ['acme'] };
  assert.equal(locateMatches(locate, ctxOf({ 'requirements.txt': 'acme\nwidget\n', 'src/x.py': 'acme widget' })), true);
  assert.equal(locateMatches(locate, ctxOf({ 'requirements.txt': 'acme\n', 'other/requirements.txt': 'widget\n' })), false);
  const reads = [];
  locateMatches(locate, { tracked: ['src/x.py', 'requirements.txt'], read: (p) => { reads.push(p); return ''; } });
  assert.deepEqual(reads, ['requirements.txt']);
  assert.deepEqual(locateCandidates(locate, ['src/x.py', 'requirements.txt', 'a/requirements.txt']), ['requirements.txt', 'a/requirements.txt']);
});

test('a global-flagged pattern cannot make a second match fail', () => {
  assert.match(validateLocate({ about: 'x', paths: /x/g }).join(' '), /flag/);
});

test('a locate is judged as data: paths required, text needs search terms, about required', () => {
  assert.deepEqual(validateLocate(null), []);
  assert.deepEqual(validateLocate({ about: 'x', paths: /x/ }), []);
  assert.match(validateLocate({ paths: /x/ }).join(' '), /about/);
  assert.match(validateLocate({ about: 'x' }).join(' '), /paths/);
  assert.match(validateLocate({ about: 'x', paths: /x/, text: /y/ }).join(' '), /search/);
  assert.match(validateLocate({ about: 'x', paths: /x/, text: 'y', search: ['y'] }).join(' '), /text/);
  assert.match(validateLocate({ about: 'x', paths: /x/, extra: 1 }).join(' '), /extra/);
  // GitHub's code search refuses a query joining more than six terms with OR.
  assert.match(validateLocate({ about: 'x', paths: /x/, text: /y/, search: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).join(' '), /six/);
});

test('its data form carries every pattern as source and flags, for a reader with no RegExp of ours', () => {
  const data = locateData({ about: 'x', paths: /^a\.json$/i, text: /"b"/, search: ['b'] });
  assert.deepEqual(data, { about: 'x', paths: { source: '^a\\.json$', flags: 'i' }, text: [{ source: '"b"', flags: '' }], search: ['b'] });
  assert.equal(locateData(null), null);
});
