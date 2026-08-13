import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStore, fileFor, isUsableIdentity, DEFAULT_PATH } from '../../packs/claude-code-web-users-support/store.mjs';

// The pack's ONE reader of its own entry config, shared by the session-start step and
// the conformance rule. Its tests are here for the same reason it is a module rather
// than two copies: the step and the rule must never disagree about what "configured"
// means — one would then fetch nothing while the other reported everything fine.

test('resolveStore: a repo is the whole requirement; path defaults and normalizes', () => {
  assert.deepEqual(resolveStore({ repo: 'owner/name' }), { repo: 'owner/name', path: DEFAULT_PATH });
  assert.deepEqual(resolveStore({ repo: 'o/n', path: 'people/prefs/' }), { repo: 'o/n', path: 'people/prefs' });
  assert.deepEqual(resolveStore({ repo: 'o/n', path: './team' }), { repo: 'o/n', path: 'team' });
  // Case is preserved: the value is written verbatim into a URL, and a repo path is
  // not case-normalizable without guessing.
  assert.equal(resolveStore({ repo: 'MissingBulb/Sheepdog' }).repo, 'MissingBulb/Sheepdog');
});

test('resolveStore: nothing usable is null — "unset" and "wrong" collapse on purpose', () => {
  // Every caller's next move is the same either way, and the difference is reported
  // once, by the rule that exists to report it.
  for (const bad of [null, undefined, {}, 'owner/name', ['owner/name'], { repo: 'ownername' }, { repo: 'a/b/c' }, { repo: 'a b/c' }, { repo: 42 }]) {
    assert.equal(resolveStore(bad), null, JSON.stringify(bad));
  }
  // A path that escapes the store, or is absolute, is refused rather than resolved:
  // it becomes a file read and a URL.
  assert.equal(resolveStore({ repo: 'o/n', path: '../../etc' }), null);
  assert.equal(resolveStore({ repo: 'o/n', path: '/abs' }), null);
  assert.equal(resolveStore({ repo: 'o/n', path: 7 }), null);
});

test('fileFor: one file per person, named for their identity', () => {
  assert.equal(fileFor({ repo: 'o/n', path: 'preferences' }, 'me@example.com'), 'preferences/me@example.com.md');
  assert.equal(fileFor({ repo: 'o/n', path: 'team/people' }, 'me@example.com'), 'team/people/me@example.com.md');
});

test('isUsableIdentity: an identity becomes a path and a URL, so an implausible one is refused', () => {
  assert.equal(isUsableIdentity('me@example.com'), true);
  assert.equal(isUsableIdentity('first.last+tag@sub.example.co.uk'), true);
  for (const bad of ['', 'nobody', '../../../etc/passwd', 'a/b@c.com', 'a@b/../c', 'a b@c.com', null, 42]) {
    assert.equal(isUsableIdentity(bad), false, String(bad));
  }
});
