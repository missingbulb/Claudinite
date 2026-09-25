import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule from '../worldRules/store-file-names.mjs';
import { packDirFor, resolveStore } from '../user_pack_address.mjs';

// See-it-fail proof for preferences-store-file-names. The violating fixtures are
// directories the reader provably never opens; the clean one is exactly what user_pack_address.mjs
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
  const found = rule.run(ctx(['preferences/README.md', 'preferences/Ariel/RULES.md']));
  assert.equal(found.length, 1);
  assert.equal(found[0].file, 'preferences/Ariel');
  assert.equal(found[0].on_fail, 'advise');
  assert.match(found[0].what, /not an identity the reader can address/);
  // the defect the finding claims, demonstrated against the real reader
  const store = resolveStore(STORE);
  // the reader lowercases the login, so a mixed-case directory is never the one it opens
  assert.equal(packDirFor(store, 'Ariel'.toLowerCase()), 'preferences/ariel');
  assert.notEqual(packDirFor(store, 'Ariel'.toLowerCase()), 'preferences/Ariel');
});

test('the lower-case login form is clean — and is exactly what the reader copies', () => {
  const files = [
    'preferences/README.md',
    'preferences/acme-user/RULES.md',
    'preferences/acme-user/skills/pep-talk/SKILL.md',
  ];
  assert.deepEqual(rule.run(ctx(files)), []);
  assert.ok(files[1].startsWith(`${packDirFor(resolveStore(STORE), 'acme-user')}/`));
});

test('a file loose in the store is found — a person is a directory now', () => {
  // The address a reader of the retired layout would have used, which nothing opens.
  const found = rule.run(ctx(['preferences/acme-user.md']));
  assert.equal(found.length, 1);
  assert.match(found[0].what, /sits loose in preferences\//);
});

test('other unaddressable names are found too, one finding per directory', () => {
  assert.equal(rule.run(ctx(['preferences/notes.txt'])).length, 1, 'a loose file of any kind');
  assert.equal(rule.run(ctx(['preferences/a b@c/RULES.md'])).length, 1, 'whitespace is not a usable identity');
  assert.equal(rule.run(ctx(['preferences/X/RULES.md', 'preferences/Y/RULES.md'])).length, 2, 'one finding per person');
  assert.equal(
    rule.run(ctx(['preferences/X/RULES.md', 'preferences/X/pack.mjs', 'preferences/X/skills/s/SKILL.md'])).length,
    1,
    'one mistake with one fix, however many files sit under it',
  );
});

test('a non-default store path is honoured', () => {
  const config = { repo: 'owner/store', path: 'people' };
  assert.deepEqual(rule.run(ctx(['preferences/Ariel/RULES.md'], config)), [], 'preferences/ is not the store here');
  assert.equal(rule.run(ctx(['people/Ariel/RULES.md'], config)).length, 1);
});

test('inert where it does not apply', () => {
  assert.deepEqual(rule.run(ctx(['preferences/Ariel/RULES.md'], null)), [],
    'the pack is declared with no store — store-configured owns that half');
  assert.deepEqual(rule.run(ctx(['preferences/Ariel/RULES.md'], { repo: 'ownername' })), [],
    'a store that does not resolve — store-configured owns that half too');
  assert.deepEqual(rule.run(ctx(['README.md', 'preferences.md'])), [],
    'a member that declares the pack but holds no store directory');
  assert.deepEqual(rule.run(ctx([])), [], 'no files at all');
});
