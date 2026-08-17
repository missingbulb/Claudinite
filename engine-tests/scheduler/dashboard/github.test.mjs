import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

class Mem {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

const res = (body, { status = 200, headers = {}, text = false } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
  text: async () => (text ? body : JSON.stringify(body)),
});

const RATE = { 'x-ratelimit-remaining': '4321', 'x-ratelimit-limit': '5000' };
// A full page, so pagination continues past it — a short page legitimately means
// the end of history.
const fullPage = (n = 100) => Array.from({ length: n }, (_, i) => ({ number: i + 1, title: `i${i}`, state: 'closed', labels: [], body: '' }));

const load = () => import(`../../../engine/scheduler/dashboard/github.mjs?t=${Math.random()}`);

beforeEach(() => { globalThis.localStorage = new Mem(); });

// The bug this pins: `Number(null)` is 0 and passes isFinite, so a response with no
// rate-limit header used to record a budget of ZERO. Every content read comes back
// without those headers, so the last one always won and the page reported the viewer
// as rate-limited when they had thousands of calls left.
test('a response without rate-limit headers leaves the known budget alone', async () => {
  const gh = await load();
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return url.includes('/contents/')
      ? res('file body', { headers: {}, text: true })          // no rate headers
      : res({ default_branch: 'main' }, { headers: RATE });
  };

  await gh.getRepo('o/r', 't');
  assert.equal(gh.rate.remaining, 4321);
  await gh.getTextAtSha('o/r', 'sha1', 'a.json', 't');
  assert.equal(gh.rate.remaining, 4321, 'a header-less response must not zero the budget');
});

test('a malformed rate-limit header is ignored rather than believed', async () => {
  const gh = await load();
  globalThis.fetch = async () => res({ default_branch: 'main' }, { headers: { 'x-ratelimit-remaining': 'lots' } });
  await gh.getRepo('o/r', 't');
  assert.equal(gh.rate.remaining, null);
});

// The whole point of the sha key: an unchanged head means no content calls at all.
test('content at a sha is fetched once and served from cache after', async () => {
  const gh = await load();
  let hits = 0;
  globalThis.fetch = async () => { hits += 1; return res('declaration', { headers: RATE, text: true }); };

  assert.equal(await gh.getTextAtSha('o/r', 'sha1', 'task.mjs', 't'), 'declaration');
  assert.equal(await gh.getTextAtSha('o/r', 'sha1', 'task.mjs', 't'), 'declaration');
  assert.equal(hits, 1, 'the second read never touched the network');
  assert.equal(gh.rate.spent, 1);
  assert.equal(gh.rate.served, 1);

  await gh.getTextAtSha('o/r', 'sha2', 'task.mjs', 't');
  assert.equal(hits, 2, 'a new sha is a new fetch');
});

// A 404 is an answer — an unadopted member has no declaration — and caching it is
// what stops a fleet sweep re-asking every member on every load.
test('a 404 is cached as a real absence', async () => {
  const gh = await load();
  let hits = 0;
  globalThis.fetch = async () => { hits += 1; return res({ message: 'Not Found' }, { status: 404, headers: RATE }); };

  assert.equal(await gh.getTextAtSha('o/r', 'sha1', 'nope.json', 't'), null);
  assert.equal(await gh.getTextAtSha('o/r', 'sha1', 'nope.json', 't'), null);
  assert.equal(hits, 1, 'the absence was cached, not re-asked');
});

// A 304 is the free path: GitHub does not charge it, so it must be counted apart
// from calls that actually spent budget.
test('a 304 returns the cached body and is counted as revalidated, not spent', async () => {
  const gh = await load();
  let sentEtag = null;
  globalThis.fetch = async (_url, init) => {
    sentEtag = init.headers['If-None-Match'];
    return sentEtag
      ? res(null, { status: 304, headers: RATE })
      : res({ default_branch: 'main', private: false, full_name: 'o/r' }, { headers: { ...RATE, etag: 'W/"v1"' } });
  };

  const first = await gh.getRepo('o/r', 't');
  assert.equal(gh.rate.spent, 1);

  gh.resetCounters();
  const second = await gh.getRepo('o/r', 't');
  assert.equal(sentEtag, 'W/"v1"', 'the stored etag was sent back');
  assert.deepEqual(second, first, 'the cached body is returned unchanged');
  assert.equal(gh.rate.spent, 0, 'a 304 spends no budget');
  assert.equal(gh.rate.revalidated, 1);
});

test('an error status becomes a GitHubError carrying the status', async () => {
  const gh = await load();
  globalThis.fetch = async () => res({ message: 'Bad credentials' }, { status: 401, headers: RATE });
  await assert.rejects(() => gh.getRepo('o/r', 'bad'), (e) => {
    assert.equal(e.status, 401);
    assert.match(e.message, /Bad credentials/);
    return true;
  });
});

// Page 1 holds every open item, so it must never come from a TTL cache; later pages
// are settled history and must not be refetched within the TTL.
test('issue page 1 is revalidated while history pages are served from the ttl cache', async () => {
  const gh = await load();
  const seen = [];
  globalThis.fetch = async (url, init) => {
    // Match on the PARSED page param: the string "page=1" is also a substring of
    // "per_page=100", which silently matched every page.
    seen.push({ page: new URL(url).searchParams.get('page'), cond: Boolean(init.headers['If-None-Match']) });
    const page = new URL(url).searchParams.get('page');
    if (page === '1') {
      return init.headers['If-None-Match']
        ? res(null, { status: 304, headers: RATE })
        : res(fullPage(), { headers: { ...RATE, etag: 'W/"p1"' } });
    }
    return res([], { headers: RATE });
  };

  await gh.listIssues('o/r', 't', { pages: 3 });
  const firstRoundPageOne = seen.filter((s) => s.page === '1').length;
  assert.equal(firstRoundPageOne, 1);

  gh.resetCounters();
  seen.length = 0;
  await gh.listIssues('o/r', 't', { pages: 3 });
  assert.ok(seen.some((s) => s.page === '1' && s.cond), 'page 1 is re-asked conditionally every time');
  assert.equal(gh.rate.spent, 0, 'and nothing was actually spent');
});

test('an expired history ttl refetches', async () => {
  const gh = await load();
  let historyFetches = 0;
  globalThis.fetch = async (url, init) => {
    const page = new URL(url).searchParams.get('page');
    if (page === '1') {
      return init.headers['If-None-Match']
        ? res(null, { status: 304, headers: RATE })
        : res(fullPage(), { headers: { ...RATE, etag: 'W/"p1"' } });
    }
    historyFetches += 1;
    return res([{ number: 9, title: 'old', state: 'closed', labels: [], body: '' }], { headers: RATE });
  };

  await gh.listIssues('o/r', 't', { pages: 2 });
  assert.equal(historyFetches, 1);
  await gh.listIssues('o/r', 't', { pages: 2, historyTtl: 0 });   // nothing is fresh at ttl 0
  assert.equal(historyFetches, 2);
});
