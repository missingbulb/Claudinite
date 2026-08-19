import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule from '../../packs/claude-code-web-users-support/store-file-names.mjs';
import { fileFor, resolveStore } from '../../packs/claude-code-web-users-support/store.mjs';

// See-it-fail proof for preferences-store-file-names. The violating fixtures are files
// the reader provably never opens; the clean one is exactly what store.mjs addresses —
// asserted against the real reader rather than restated, so the test cannot agree with
// a check that has drifted away from the code doing the opening.
const STORE = { repo: 'owner/store' };
// `null` means the pack is declared with no config at all — not the same as a config
// that fails to resolve, and both belong to store-configured rather than here.
const ctx = (files, config = STORE) => ({
  files,
  config: { packConfig: config === null ? {} : { 'claude-code-web-users-support': config } },
});

test('a file not named for an identity is found — and really is unaddressable', () => {
  const found = rule.run(ctx(['preferences/README.md', 'preferences/ariel.md']));
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, 'preferences-store-file-names');
  assert.equal(found[0].file, 'preferences/ariel.md');
  assert.equal(found[0].severity, 'advisory');
  assert.match(found[0].what, /not named for a usable identity/);
  // the defect the finding claims, demonstrated against the real reader
  const store = resolveStore(STORE);
  assert.equal(fileFor(store, 'arielra@gmail.com'), 'preferences/arielra@gmail.com.md');
  assert.notEqual(fileFor(store, 'arielra@gmail.com'), 'preferences/ariel.md');
});

test('the identity form is clean — and is exactly what the reader opens', () => {
  const files = ['preferences/README.md', 'preferences/arielra@gmail.com.md'];
  assert.deepEqual(rule.run(ctx(files)), []);
  assert.ok(files.includes(fileFor(resolveStore(STORE), 'arielra@gmail.com')));
});

test('a nested file is found — the address has no subdirectory in it', () => {
  const found = rule.run(ctx(['preferences/team/arielra@gmail.com.md']));
  assert.equal(found.length, 1);
  assert.match(found[0].what, /subdirectory/);
});

test('other unaddressable names are found too', () => {
  assert.equal(rule.run(ctx(['preferences/notes.txt'])).length, 1, 'not even markdown');
  assert.equal(rule.run(ctx(['preferences/arielra@gmail.com'])).length, 1, 'no .md suffix');
  assert.equal(rule.run(ctx(['preferences/a b@c.md'])).length, 1, 'whitespace is not a usable identity');
  assert.equal(rule.run(ctx(['preferences/x.md', 'preferences/y.md'])).length, 2, 'one finding per file');
});

test('a non-default store path is honoured', () => {
  const config = { repo: 'owner/store', path: 'people' };
  assert.deepEqual(rule.run(ctx(['preferences/ariel.md'], config)), [], 'preferences/ is not the store here');
  assert.equal(rule.run(ctx(['people/ariel.md'], config)).length, 1);
});

test('inert where it does not apply', () => {
  assert.deepEqual(rule.run(ctx(['preferences/ariel.md'], null)), [],
    'the pack is declared with no store — store-configured owns that half');
  assert.deepEqual(rule.run(ctx(['preferences/ariel.md'], { repo: 'ownername' })), [],
    'a store that does not resolve — store-configured owns that half too');
  assert.deepEqual(rule.run(ctx(['README.md', 'preferences.md'])), [],
    'a member that declares the pack but holds no store directory');
  assert.deepEqual(rule.run(ctx([])), [], 'no files at all');
});
