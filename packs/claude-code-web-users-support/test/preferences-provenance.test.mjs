import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule, { provenanceDirOf } from '../worldRules/preferences-provenance.mjs';
import { resolveStore } from '../store.mjs';

// See-it-fail proof for preferences-provenance: a preference with no marker, one whose
// marker names no file, and the clean shape — a marker naming a file beside the store.
const STORE = { repo: 'owner/store' };
const ctx = (files, texts = {}, config = STORE) => ({
  files,
  config: { packConfig: config === null ? {} : { 'claude-code-web-users-support': config } },
  read: (p) => texts[p] ?? null,
  exists: (p) => files.includes(p),
});
const PREFS = '- **Ending a turn** — a blockquote callout. (turn-callout)\n\n- **Saying LGTM** — merges the change at hand.\n';

test('the provenance folder sits beside the store, named for it', () => {
  assert.equal(provenanceDirOf(resolveStore(STORE)), 'preferences-provenance');
  assert.equal(provenanceDirOf(resolveStore({ repo: 'o/r', path: 'people' })), 'people-provenance');
});

test('a preference with no marker, and one whose marker names no file, are each found at their line', () => {
  const found = rule.run(ctx(['preferences/a@b.c.md'], { 'preferences/a@b.c.md': PREFS }));
  assert.equal(found.length, 2);
  assert.equal(found[0].severity, 'advisory');
  assert.equal(found[0].line, 1);
  assert.match(found[0].what, /"Ending a turn" names preferences-provenance\/a@b\.c\/turn-callout\.md, which does not exist/);
  assert.equal(found[1].line, 3);
  assert.match(found[1].what, /"Saying LGTM" ends with no marker/);
  assert.match(found[1].fix, /\(saying-lgtm\)/);
});

test('a marker naming a file beside the store is clean', () => {
  const files = ['preferences/a@b.c.md', 'preferences-provenance/a@b.c/turn-callout.md', 'preferences-provenance/a@b.c/saying-lgtm.md'];
  const texts = { 'preferences/a@b.c.md': PREFS.replace('at hand.', 'at hand. (saying-lgtm)') };
  assert.deepEqual(rule.run(ctx(files, texts)), []);
});

test('inert where this repo is not the store, where the pack names none, and for files store-file-names already reports', () => {
  assert.deepEqual(rule.run(ctx(['src/app.js'], {})), []);
  assert.deepEqual(rule.run(ctx(['preferences/a@b.c.md'], { 'preferences/a@b.c.md': PREFS }, null)), []);
  assert.deepEqual(rule.run(ctx(['preferences/README.md', 'preferences/ariel.md'], { 'preferences/ariel.md': PREFS })), []);
});
