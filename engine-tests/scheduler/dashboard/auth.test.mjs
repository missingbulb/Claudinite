import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Browser globals the module needs. Kept minimal and explicit so what the flow
// actually depends on is visible.
class Mem {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

let replaced;
beforeEach(() => {
  globalThis.sessionStorage = new Mem();
  replaced = [];
  globalThis.location = { href: 'https://o.github.io/R/?repo=o%2Fa', origin: 'https://o.github.io', pathname: '/R/', search: '' };
  globalThis.history = { replaceState: (_a, _b, url) => replaced.push(String(url)) };
});

const load = () => import(`../../../engine/scheduler/dashboard/auth.mjs?t=${Math.random()}`);
const CONFIG = { clientId: 'Iv1.x', exchangeUrl: 'https://exchange.example/gh' };

test('a page that is not a callback is left alone', async () => {
  const a = await load();
  assert.deepEqual(await a.completeSignIn(CONFIG, { search: '?repo=o/a' }), { status: 'none' });
  assert.equal(replaced.length, 0, 'a non-callback load must not rewrite the URL');
});

// The state check is the whole defence against a crafted callback URL: without it a
// stranger can hand the viewer a link that makes this page exchange someone else's
// code. A mismatch must not even attempt the exchange.
test('a callback whose state does not match is refused without exchanging', async () => {
  const a = await load();
  let called = false;
  globalThis.fetch = async () => { called = true; return { ok: true, json: async () => ({ access_token: 'nope' }) }; };

  sessionStorage.setItem('claudinite-dashboard:oauth-state', 'expected');
  const out = await a.completeSignIn(CONFIG, { search: '?code=abc&state=attacker' });

  assert.equal(out.status, 'error');
  assert.match(out.message, /state did not match/);
  assert.equal(called, false, 'the code must never be exchanged on a state mismatch');
  assert.equal(a.currentToken(), '');
});

test('a callback with no stored state at all is refused', async () => {
  const a = await load();
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ access_token: 't' }) });
  const out = await a.completeSignIn(CONFIG, { search: '?code=abc&state=whatever' });
  assert.equal(out.status, 'error');
  assert.equal(a.currentToken(), '');
});

test('a matching callback exchanges the code and stores the token', async () => {
  const a = await load();
  let sent = null;
  globalThis.fetch = async (url, init) => {
    sent = { url, body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ access_token: 'gho_abc', token_type: 'bearer' }) };
  };
  sessionStorage.setItem('claudinite-dashboard:oauth-state', 's1');
  const out = await a.completeSignIn(CONFIG, { search: '?code=abc&state=s1' });

  assert.deepEqual(out, { status: 'signed-in' });
  assert.equal(sent.url, CONFIG.exchangeUrl);
  assert.equal(sent.body.code, 'abc');
  assert.equal(a.currentToken(), 'gho_abc');
});

// A spent state must not be replayable.
test('the stored state is consumed, so a second callback fails', async () => {
  const a = await load();
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ access_token: 't' }) });
  sessionStorage.setItem('claudinite-dashboard:oauth-state', 's1');
  assert.equal((await a.completeSignIn(CONFIG, { search: '?code=abc&state=s1' })).status, 'signed-in');
  assert.equal((await a.completeSignIn(CONFIG, { search: '?code=abc&state=s1' })).status, 'error');
});

// A code left in the address bar is a live credential that ends up in history and
// pasted links, so it is scrubbed on every callback outcome — success or failure.
test('the code is scrubbed from the URL on success and on failure alike', async () => {
  const a = await load();
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ access_token: 't' }) });

  sessionStorage.setItem('claudinite-dashboard:oauth-state', 's1');
  await a.completeSignIn(CONFIG, { search: '?code=abc&state=s1' });
  assert.ok(replaced.length >= 1);
  assert.ok(!replaced.at(-1).includes('code='), 'the code is gone from the URL');

  await a.completeSignIn(CONFIG, { search: '?code=xyz&state=mismatch' });
  assert.ok(!replaced.at(-1).includes('code='), 'and gone after a refusal too');
});

test('the repo parameter survives the scrub', async () => {
  const a = await load();
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ access_token: 't' }) });
  sessionStorage.setItem('claudinite-dashboard:oauth-state', 's1');
  await a.completeSignIn(CONFIG, { search: '?code=abc&state=s1' });
  assert.match(replaced.at(-1), /repo=/, 'scrubbing must not drop the view the user asked for');
});

test('an error returned by GitHub is surfaced, not swallowed', async () => {
  const a = await load();
  globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: 'bad_verification_code', error_description: 'The code is incorrect.' }) });
  sessionStorage.setItem('claudinite-dashboard:oauth-state', 's1');
  const out = await a.completeSignIn(CONFIG, { search: '?code=abc&state=s1' });
  assert.equal(out.status, 'error');
  assert.match(out.message, /code is incorrect/);
  assert.equal(a.currentToken(), '');
});

test('a denied authorization reports the reason and stores nothing', async () => {
  const a = await load();
  const out = await a.completeSignIn(CONFIG, { search: '?error=access_denied&error_description=User+denied' });
  assert.equal(out.status, 'error');
  assert.match(out.message, /User denied/);
  assert.equal(a.currentToken(), '');
});

test('an unreachable exchange endpoint is an error, not a crash', async () => {
  const a = await load();
  globalThis.fetch = async () => { throw new Error('DNS'); };
  sessionStorage.setItem('claudinite-dashboard:oauth-state', 's1');
  const out = await a.completeSignIn(CONFIG, { search: '?code=abc&state=s1' });
  assert.equal(out.status, 'error');
  assert.match(out.message, /unreachable/);
});

test('signOut clears the credential', async () => {
  const a = await load();
  a.setPastedToken('  ghp_x  ');
  assert.equal(a.currentToken(), 'ghp_x', 'a pasted token is trimmed');
  a.signOut();
  assert.equal(a.currentToken(), '');
});
