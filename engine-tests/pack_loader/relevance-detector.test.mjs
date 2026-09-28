import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRelevanceDetector, detectsRelevance, detectorCandidates, relevanceDetectorData } from '../../engine/pack_loader/relevance-detector.mjs';

const ctxOf = (files) => ({ tracked: Object.keys(files), read: (p) => (p in files ? files[p] : null) });

test('a path-only relevanceDetector matches on the listing alone and reads nothing', () => {
  const relevanceDetector = { about: 'acme.toml near the root', paths: /^([^/]+\/)?acme\.toml$/ };
  const reads = [];
  const ctx = { tracked: ['app/acme.toml'], read: (p) => { reads.push(p); return null; } };
  assert.equal(detectsRelevance(relevanceDetector, ctx), true);
  assert.equal(detectsRelevance(relevanceDetector, ctxOf({ 'a/b/acme.toml': '' })), false);
  assert.deepEqual(reads, []);
});

test('a text relevanceDetector reads only the files its paths name, and every pattern must match the same file', () => {
  const relevanceDetector = { about: 'both libs in one manifest', paths: /(^|\/)requirements\.txt$/, text: [/\bacme\b/, /\bwidget\b/], search: ['acme'] };
  assert.equal(detectsRelevance(relevanceDetector, ctxOf({ 'requirements.txt': 'acme\nwidget\n', 'src/x.py': 'acme widget' })), true);
  assert.equal(detectsRelevance(relevanceDetector, ctxOf({ 'requirements.txt': 'acme\n', 'other/requirements.txt': 'widget\n' })), false);
  const reads = [];
  detectsRelevance(relevanceDetector, { tracked: ['src/x.py', 'requirements.txt'], read: (p) => { reads.push(p); return ''; } });
  assert.deepEqual(reads, ['requirements.txt']);
  assert.deepEqual(detectorCandidates(relevanceDetector, ['src/x.py', 'requirements.txt', 'a/requirements.txt']), ['requirements.txt', 'a/requirements.txt']);
});

test('a global-flagged pattern cannot make a second match fail', () => {
  assert.match(validateRelevanceDetector({ about: 'x', paths: /x/g }).join(' '), /flag/);
});

test('a relevanceDetector is judged as data: paths required, text needs search terms, about required', () => {
  assert.deepEqual(validateRelevanceDetector(null), []);
  assert.deepEqual(validateRelevanceDetector({ about: 'x', paths: /x/ }), []);
  assert.match(validateRelevanceDetector({ paths: /x/ }).join(' '), /about/);
  assert.match(validateRelevanceDetector({ about: 'x' }).join(' '), /paths/);
  assert.match(validateRelevanceDetector({ about: 'x', paths: /x/, text: /y/ }).join(' '), /search/);
  assert.match(validateRelevanceDetector({ about: 'x', paths: /x/, text: 'y', search: ['y'] }).join(' '), /text/);
  assert.match(validateRelevanceDetector({ about: 'x', paths: /x/, extra: 1 }).join(' '), /extra/);
  // GitHub's code search refuses a query joining more than six terms with OR.
  assert.match(validateRelevanceDetector({ about: 'x', paths: /x/, text: /y/, search: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).join(' '), /six/);
});

test('its data form carries every pattern as source and flags, for a reader with no RegExp of ours', () => {
  const data = relevanceDetectorData({ about: 'x', paths: /^a\.json$/i, text: /"b"/, search: ['b'] });
  assert.deepEqual(data, { about: 'x', paths: { source: '^a\\.json$', flags: 'i' }, text: [{ source: '"b"', flags: '' }], search: ['b'] });
  assert.equal(relevanceDetectorData(null), null);
});
