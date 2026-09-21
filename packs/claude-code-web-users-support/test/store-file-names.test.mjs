import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule from '../worldRules/store-file-names.mjs';
import { folderFor, resolveStore } from '../store.mjs';

// See-it-fail proof for preferences-store-file-names. The violating fixtures are
// directories the reader provably never opens; the clean one is exactly what store.mjs
// addresses — asserted against the real reader rather than restated, so the test cannot
// agree with a check that has drifted away from the code doing the opening.
const STORE = { repo: 'owner/store' };
// `null` means the pack is declared with no config at all — not the same as a config
// that fails to resolve, and both belong to store-configured rather than here.
const ctx = (files, config = STORE) => ({
  files,
  config: { packConfig: config === null ? {} : { 'claude-code-web-users-support': config } },
});

test('a directory not named for an identity is found — and really is unaddressable', () => {
  const found = rule.run(ctx(['preferences/README.md', 'preferences/ariel/RULES.md']));
  assert.equal(found.length, 1);
  assert.equal(found[0].file, 'preferences/ariel');
  assert.equal(found[0].severity, 'advisory');
  assert.match(found[0].what, /not an identity the reader can address/);
  // the defect the finding claims, demonstrated against the real reader
  const store = resolveStore(STORE);
  assert.equal(folderFor(store, 'arielra@gmail.com'), 'preferences/arielra@gmail.com');
  assert.notEqual(folderFor(store, 'arielra@gmail.com'), 'preferences/ariel');
});

test('the identity form is clean — and is exactly what the reader pours', () => {
  const files = [
    'preferences/README.md',
    'preferences/arielra@gmail.com/RULES.md',
    'preferences/arielra@gmail.com/skills/pep-talk/SKILL.md',
  ];
  assert.deepEqual(rule.run(ctx(files)), []);
  assert.ok(files[1].startsWith(`${folderFor(resolveStore(STORE), 'arielra@gmail.com')}/`));
});

test('a file loose in the store is found — a person is a directory now', () => {
  // The address a reader of the retired layout would have used, which nothing opens.
  const found = rule.run(ctx(['preferences/arielra@gmail.com.md']));
  assert.equal(found.length, 1);
  assert.match(found[0].what, /sits loose in preferences\//);
});

test('other unaddressable names are found too, one finding per directory', () => {
  assert.equal(rule.run(ctx(['preferences/notes.txt'])).length, 1, 'a loose file of any kind');
  assert.equal(rule.run(ctx(['preferences/a b@c/RULES.md'])).length, 1, 'whitespace is not a usable identity');
  assert.equal(rule.run(ctx(['preferences/x/RULES.md', 'preferences/y/RULES.md'])).length, 2, 'one finding per person');
  assert.equal(
    rule.run(ctx(['preferences/x/RULES.md', 'preferences/x/pack.mjs', 'preferences/x/skills/s/SKILL.md'])).length,
    1,
    'one mistake with one fix, however many files sit under it',
  );
});

test('a non-default store path is honoured', () => {
  const config = { repo: 'owner/store', path: 'people' };
  assert.deepEqual(rule.run(ctx(['preferences/ariel/RULES.md'], config)), [], 'preferences/ is not the store here');
  assert.equal(rule.run(ctx(['people/ariel/RULES.md'], config)).length, 1);
});

test('inert where it does not apply', () => {
  assert.deepEqual(rule.run(ctx(['preferences/ariel/RULES.md'], null)), [],
    'the pack is declared with no store — store-configured owns that half');
  assert.deepEqual(rule.run(ctx(['preferences/ariel/RULES.md'], { repo: 'ownername' })), [],
    'a store that does not resolve — store-configured owns that half too');
  assert.deepEqual(rule.run(ctx(['README.md', 'preferences.md'])), [],
    'a member that declares the pack but holds no store directory');
  assert.deepEqual(rule.run(ctx([])), [], 'no files at all');
});
