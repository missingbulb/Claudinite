import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, makeRepo } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import pack from '../pack.mjs';

const detect = (root) => pack.detect(buildContext({ root, mode: 'all' }));

test('the pack fingerprints a repo whose page carries the version stamp', () => {
  const root = makeRepo({ base: {
    'package.json': '{ "version": "1.10913.4" }\n',
    'site/index.html': '<p title="version 1.10913.4">c</p>\n',
  } });
  try { assert.equal(detect(root), true); } finally { cleanup(root); }
});

// A version record alone is every node project; a page with an unrelated title is
// every site. Neither says "public website" on its own.
test('the pack is inert on a repo with no stamped page (FP guard)', () => {
  const root = makeRepo({ base: {
    'package.json': '{ "version": "1.2.3" }\n',
    'index.html': '<p title="about us">c</p>\n',
  } });
  try { assert.equal(detect(root), false); } finally { cleanup(root); }
});

// The pack composes with a hosting pack by that pack reaching its public seam — never
// the other way round — so nothing in the manifest may name one.
test('the manifest names no hosting pack', () => {
  const text = JSON.stringify(pack.ruleRoutingGuidance) + (pack.requires ?? []).join(' ');
  assert.doesNotMatch(text, /github-pages|cloudflare|pages\b/i);
});
