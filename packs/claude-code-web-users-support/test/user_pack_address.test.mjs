import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStore, packDirFor, declineReason, isUsableIdentity, DEFAULT_PATH } from '../user_pack_address.mjs';

// The pack's ONE reader of its own entry config, shared by the copy step, the step that
// reports it and the conformance rules. Its tests are here for the same reason it is a module rather
// than two copies: the step and the rule must never disagree about what "configured"
// means — one would then fetch nothing while the other reported everything fine.

test('resolveStore: a repo is the whole requirement; path defaults and normalizes', () => {
  assert.deepEqual(resolveStore({ repo: 'owner/name' }), { repo: 'owner/name', path: DEFAULT_PATH });
  assert.deepEqual(resolveStore({ repo: 'o/n', path: 'people/prefs/' }), { repo: 'o/n', path: 'people/prefs' });
  assert.deepEqual(resolveStore({ repo: 'o/n', path: './team' }), { repo: 'o/n', path: 'team' });
  // Case is preserved: the value is written verbatim into a URL, and a repo path is
  // not case-normalizable without guessing.
  assert.equal(resolveStore({ repo: 'MissingBulb/Shepherd' }).repo, 'MissingBulb/Shepherd');
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

test('packDirFor: one pack per person, in a directory named for their identity', () => {
  assert.equal(packDirFor({ repo: 'o/n', path: 'preferences' }, 'me@example.com'), 'preferences/me@example.com');
  assert.equal(packDirFor({ repo: 'o/n', path: 'team/people' }, 'me@example.com'), 'team/people/me@example.com');
});

test("declineReason: every way a session gets no pack, in the reader's own words", () => {
  // One list, two readers: the copy stops on it and the start step says it. A reason that read
  // differently in the two places would be a session told something that did not happen.
  const ok = { CLAUDE_CODE_USER_EMAIL: 'me@example.com' };
  const store = { repo: 'o/n' };
  assert.equal(declineReason(store, ok), null);
  assert.equal(declineReason(store, { ...ok, CLAUDE_CODE_SESSION_ATTENDED: '1' }), null);
  // Unset attendedness is an older harness, and still copies.
  assert.equal(declineReason(store, { ...ok, CLAUDE_CODE_SESSION_ATTENDED: '' }), null);

  assert.match(declineReason({}, ok), /declares no store/);
  assert.match(declineReason({ repo: 'not-a-repo' }, ok), /declares no store/);
  assert.match(declineReason(store, { ...ok, CLAUDE_CODE_SESSION_ATTENDED: '0' }), /unattended/);
  assert.match(declineReason(store, {}), /CLAUDE_CODE_USER_EMAIL is not set/);
  assert.match(declineReason(store, { CLAUDE_CODE_USER_EMAIL: '../../etc/passwd' }), /not a usable directory name/);
  // An implausible identity is quoted back tidily rather than raw.
  assert.doesNotMatch(declineReason(store, { CLAUDE_CODE_USER_EMAIL: 'a"b' }), /"/);
});

test('isUsableIdentity: an identity becomes a path and a URL, so an implausible one is refused', () => {
  assert.equal(isUsableIdentity('me@example.com'), true);
  assert.equal(isUsableIdentity('first.last+tag@sub.example.co.uk'), true);
  for (const bad of ['', 'nobody', '../../../etc/passwd', 'a/b@c.com', 'a@b/../c', 'a b@c.com', null, 42]) {
    assert.equal(isUsableIdentity(bad), false, String(bad));
  }
});
