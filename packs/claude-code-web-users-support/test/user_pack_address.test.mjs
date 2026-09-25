import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStore, packDirFor, declineReason, isUsableIdentity, isUsableLogin, storeDirForm, candidateDirs, DEFAULT_PATH } from '../user_pack_address.mjs';

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

test("declineReason: the reasons a session gets no pack whoever it is, in the reader's own words", () => {
  // One list, two readers: the copy stops on it and the start step says it. Who the person is
  // is not among them - that takes a network read, which only the copy step makes.
  const store = { repo: 'o/n' };
  assert.equal(declineReason(store, {}), null);
  assert.equal(declineReason(store, { CLAUDE_CODE_SESSION_ATTENDED: '1' }), null);
  // Unset attendedness is an older harness, and still copies.
  assert.equal(declineReason(store, { CLAUDE_CODE_SESSION_ATTENDED: '' }), null);

  assert.match(declineReason({}, {}), /declares no store/);
  assert.match(declineReason({ repo: 'not-a-repo' }, {}), /declares no store/);
  assert.match(declineReason(store, { CLAUDE_CODE_SESSION_ATTENDED: '0' }), /unattended/);
});

test('isUsableLogin: exactly the names GitHub allows, because a login becomes a path and a URL', () => {
  for (const ok of ['a', 'acme-user', 'Acme-User', 'a1-b2-c3', 'x'.repeat(39)]) {
    assert.equal(isUsableLogin(ok), true, ok);
  }
  for (const bad of ['', '-acme', 'acme-', 'ac--me', 'x'.repeat(40), 'a_b', 'a.b', 'me@example.com', '../x', 'a/b', 'a b', null, 42]) {
    assert.equal(isUsableLogin(bad), false, String(bad));
  }
});

test('storeDirForm: a directory is a login in lower case, a legacy email, or unaddressable', () => {
  assert.equal(storeDirForm('acme-user'), 'login');
  // GitHub logins compare case-insensitively and directory names do not, so the reader
  // lowercases the login and a mixed-case directory is one it never opens.
  assert.equal(storeDirForm('Acme-User'), 'miscased-login');
  assert.equal(storeDirForm('me@example.com'), 'email');
  for (const bad of ['a b', '../x', '-x', '']) assert.equal(storeDirForm(bad), null, bad);
});

test('candidateDirs: the login first, lower-cased, then the legacy email directory', () => {
  const store = { repo: 'o/n', path: 'preferences' };
  assert.deepEqual(candidateDirs(store, { login: 'Acme-User', email: 'me@example.com' }), [
    { dir: 'preferences/acme-user', form: 'login', identity: 'Acme-User' },
    { dir: 'preferences/me@example.com', form: 'email', identity: 'me@example.com' },
  ]);
  assert.deepEqual(candidateDirs(store, { login: null, email: 'me@example.com' }).map((c) => c.form), ['email']);
  assert.deepEqual(candidateDirs(store, { login: 'acme-user', email: '' }).map((c) => c.form), ['login']);
  // An unusable identity of either kind is never an address.
  assert.deepEqual(candidateDirs(store, { login: '../x', email: '../../etc/passwd' }), []);
});

test('isUsableIdentity: an identity becomes a path and a URL, so an implausible one is refused', () => {
  assert.equal(isUsableIdentity('me@example.com'), true);
  assert.equal(isUsableIdentity('first.last+tag@sub.example.co.uk'), true);
  for (const bad of ['', 'nobody', '../../../etc/passwd', 'a/b@c.com', 'a@b/../c', 'a b@c.com', null, 42]) {
    assert.equal(isUsableIdentity(bad), false, String(bad));
  }
});
