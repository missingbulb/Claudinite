import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripComments } from '../../../engine/checks/helpers/code-scanning.mjs';

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

const load = () => import(`../../../packs/claudinite-dashboard/github.mjs?t=${Math.random()}`);

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

// History page 1 is where a newly-created item lands, so it must never come from a TTL
// cache; later pages are settled history and must not be refetched within the TTL.
test('issue page 1 is revalidated while history pages are served from the ttl cache', async () => {
  const gh = await load();
  const seen = [];
  globalThis.fetch = async (url, init) => {
    const q = new URL(url).searchParams;
    if (q.get('state') === 'open') {
      // The live open listing carries an ETag like any other response, so a repeat
      // load revalidates it for free — which is what makes asking it every time cheap.
      return init.headers['If-None-Match']
        ? res(null, { status: 304, headers: RATE })
        : res([], { headers: { ...RATE, etag: 'W/"open"' } });
    }
    // Match on the PARSED page param: the string "page=1" is also a substring of
    // "per_page=100", which silently matched every page.
    seen.push({ page: q.get('page'), cond: Boolean(init.headers['If-None-Match']) });
    const page = q.get('page');
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
    const q = new URL(url).searchParams;
    if (q.get('state') === 'open') return res([], { headers: RATE });
    const page = q.get('page');
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

// The premise page 1 was trusted on — "it holds every open item" — is false under
// `sort=created`: an item created a hundred issues ago sits in the TTL'd history,
// wearing whatever state it had when that page was cached. This is the bug the lead
// card showed: a closed issue offered as the one thing to do next.
test('an item that closed since its history page was cached reads as closed', async () => {
  const gh = await load();
  let openState = 'open';
  globalThis.fetch = async (url, init) => {
    const q = new URL(url).searchParams;
    if (q.get('state') === 'open') {
      // A live listing GitHub answers afresh: the item leaves it the moment it closes.
      const body = openState === 'open' ? [{ number: 219, title: 'old work', state: 'open', labels: [], body: '' }] : [];
      return res(body, { headers: { ...RATE, etag: `W/"open-${openState}"` } });
    }
    const page = q.get('page');
    if (page === '1') {
      return init.headers['If-None-Match']
        ? res(null, { status: 304, headers: RATE })
        : res(fullPage(), { headers: { ...RATE, etag: 'W/"p1"' } });
    }
    return res([{ number: 219, title: 'old work', state: 'open', labels: [], body: '' }], { headers: RATE });
  };

  const first = await gh.listIssues('o/r', 't', { pages: 2 });
  assert.equal(first.issues.find((i) => i.number === 219).state, 'open');

  openState = 'closed';                                   // and the history page stays cached
  const second = await gh.listIssues('o/r', 't', { pages: 2 });
  assert.equal(second.issues.find((i) => i.number === 219).state, 'closed',
    'an open item the live open listing no longer names has closed');
});

// The other half of the same premise: an open item older than the pages actually
// scanned was simply absent, so nothing could report it.
test('an open item deeper than the scanned history still appears', async () => {
  const gh = await load();
  globalThis.fetch = async (url) => {
    const q = new URL(url).searchParams;
    if (q.get('state') === 'open') {
      return res([{ number: 7, title: 'ancient', state: 'open', labels: [], body: '' }], { headers: RATE });
    }
    return res(fullPage(), { headers: { ...RATE, etag: 'W/"p1"' } });
  };

  const { issues } = await gh.listIssues('o/r', 't', { pages: 1 });
  assert.ok(issues.some((i) => i.number === 7 && i.state === 'open'));
});

// Open PRs are read off the same pages and go stale the same way: one that merged
// yesterday must not still count as work waiting on a person.
test('open pull requests come from the live open listing', async () => {
  const gh = await load();
  globalThis.fetch = async (url) => {
    const q = new URL(url).searchParams;
    if (q.get('state') === 'open') return res([], { headers: RATE });
    return res([{ number: 4, title: 'merged since', state: 'open', pull_request: {}, labels: [], body: '' }],
      { headers: { ...RATE, etag: 'W/"p1"' } });
  };

  const { prs } = await gh.listIssues('o/r', 't', { pages: 1 });
  assert.deepEqual(prs, [], 'a PR the live listing does not name is not open');
});

// The merged half of the same read: the lead-time series the page draws for the days
// the fold has not reached comes from PRs the page already fetched, and from nowhere
// else — the open listing is asked by state and cannot answer them at all.
test('merged pull requests inside the window survive a COMPLETE open listing', async () => {
  const gh = await load();
  let requests = 0;
  const merged = (number, mergedAt) => ({
    number, title: `pr${number}`, state: 'closed', labels: [],
    body: `does the thing\n\nCloses #${number - 1}\n`,
    pull_request: { merged_at: mergedAt },
  });
  globalThis.fetch = async (url) => {
    requests += 1;
    const q = new URL(url).searchParams;
    if (q.get('state') === 'open') return res([], { headers: RATE });
    return res([
      merged(11, new Date(Date.now() - 2 * 86400e3).toISOString()),
      merged(12, new Date(Date.now() - 60 * 86400e3).toISOString()),   // past the window
      { number: 13, title: 'closed unmerged', state: 'closed', labels: [], body: '', pull_request: { merged_at: null } },
    ], { headers: { ...RATE, etag: 'W/"p1"' } });
  };

  const { prs } = await gh.listIssues('o/r', 't', { pages: 1 });
  assert.deepEqual(prs.map((p) => p.number), [11], 'a complete open set must not drop the merged ones');
  assert.equal(prs[0].closesIssue, 10, 'the closing issue is parsed on the way in, so no body is stored');
  assert.equal(prs[0].body, undefined);
  // THE WHOLE POINT: this costs the viewer nothing. Both listings were being fetched
  // already, and a merged PR arrives inside the response the page was making anyway.
  assert.equal(requests, 2, 'one open listing and one history page, exactly as before');
});

// Both halves fail soft: a budget too thin for the open listing leaves the history
// pages saying what they last saw, which is a stale answer rather than no member.
test('a withheld open listing degrades to the history pages rather than failing the read', async () => {
  const gh = await load();
  globalThis.fetch = async (url) => {
    const q = new URL(url).searchParams;
    if (q.get('state') === 'open') return res([], { headers: { ...RATE, etag: 'W/"open"' } });
    return res([{ number: 5, title: 'stale', state: 'open', labels: [], body: '' }], { headers: { ...RATE, etag: 'W/"p1"' } });
  };

  await gh.listIssues('o/r', 't', { pages: 1 });          // warms both caches
  // ...and then only the history half survives — the shape a load carries when the
  // budget is gone before the open listing has ever been read.
  for (const k of [...globalThis.localStorage.m.keys()]) {
    if (k.includes('state=open')) globalThis.localStorage.removeItem(k);
  }
  gh.resetCounters();
  gh.setPolicy({ spendCeiling: 0 });
  const out = await gh.listIssues('o/r', 't', { pages: 1 });
  assert.deepEqual(out.issues.map((i) => i.number), [5]);
});

// --- commit activity --------------------------------------------------------------

test('commit activity is fetched once and served from the ttl cache after', async () => {
  const gh = await load();
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; return res([{ week: 1, days: [1, 0, 0, 0, 0, 0, 0] }], { headers: RATE }); };
  assert.deepEqual(await gh.commitActivity('o/r', 't'), [{ week: 1, days: [1, 0, 0, 0, 0, 0, 0] }]);
  await gh.commitActivity('o/r', 't');
  assert.equal(fetches, 1);
});

// GitHub computes these statistics lazily. A 202 is "ask again", and caching it would
// leave a member showing an empty year until the entry aged out.
test('a 202 is not cached, so the next load asks again instead of showing an empty year', async () => {
  const gh = await load();
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; return res(null, { status: 202, headers: RATE }); };
  assert.equal(await gh.commitActivity('o/r', 't'), null);
  await gh.commitActivity('o/r', 't');
  assert.equal(fetches, 2);
});

// The graph is decoration, and decoration is what a tight budget goes without first.
// It withholds rather than reading, and says `undefined` — which the row renders as
// "not read", never as a repo that made no commits.
test('a policy that forbids extras withholds the read rather than spending on it', async () => {
  const gh = await load();
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; return res([], { headers: RATE }); };
  gh.setPolicy({ extras: false });
  assert.equal(await gh.commitActivity('o/r', 't'), undefined);
  assert.equal(fetches, 0);
  assert.equal(gh.rate.withheld, 1);
});

// --- one runs URL, not two --------------------------------------------------------

// The cache is keyed by URL, so a caller passing its own page size makes a second
// entry for the same question: the fleet view asked for 30 and the repo view for 40,
// and opening a member re-fetched the list the fleet page already held.
test('both views ask for the same runs URL, so the second is a cache hit', async () => {
  const gh = await load();
  const urls = [];
  globalThis.fetch = async (u) => {
    urls.push(String(u));
    return res({ workflow_runs: [] }, { headers: { ...RATE, etag: 'W/"a"' } });
  };
  await gh.listRuns('o/r', 't');                     // as the fleet view calls it
  await gh.listRuns('o/r', 't', gh.RUNS_PER_PAGE);   // as the repo view calls it
  assert.equal(urls[0], urls[1]);
  assert.match(urls[0], new RegExp(`per_page=${gh.RUNS_PER_PAGE}$`));
});

// The drift guard for the above: the shared page size is only shared while nobody
// passes their own. A third argument at a call site is the exact regression — one
// caller asking for 30 while the constant says 40 — and it is invisible at runtime,
// because both URLs work and simply cache separately.
test('no caller overrides the shared runs page size', async () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const sources = (await readdir(dir))
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'));
  const offenders = [];
  for (const f of sources) {
    const code = stripComments(await readFile(resolve(dir, f), 'utf8'));
    // Two arguments is the shared default; a third is an override.
    if (/\blistRuns\s*\([^)]*,[^)]*,[^)]*\)/.test(code)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], 'pass no page size — the constant is the whole point');
});
