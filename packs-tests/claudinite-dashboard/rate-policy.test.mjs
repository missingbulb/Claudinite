// What the budget policy actually DOES to the wire. `budget.test.mjs` pins the
// decision; this pins that `github.mjs` obeys it — which is the half a viewer feels,
// because a policy that plans a cheap load and then makes every request anyway is
// indistinguishable from no policy at all.

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

const res = (body, { status = 200, headers = {} } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const load = () => import(`../../packs/claudinite-dashboard/github.mjs?t=${Math.random()}`);

beforeEach(() => { globalThis.localStorage = new Mem(); });

test('a young cached entry is served with NO request once a floor is set', async () => {
  const gh = await load();
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return res({ default_branch: 'main' }, { headers: { etag: 'W/"a"', 'x-ratelimit-remaining': '30', 'x-ratelimit-limit': '60' } }); };

  await gh.getRepo('o/r', 't');
  assert.equal(calls, 1, 'the cold read has to happen');

  // Live policy: a warm read still revalidates (a 304 is free of the primary limit).
  await gh.getRepo('o/r', 't');
  assert.equal(calls, 2);

  // Under pressure the same read makes no request at all — this is what turns a page
  // reload into something that costs the viewer nothing.
  gh.setPolicy({ minAge: 30 * 60e3 });
  await gh.getRepo('o/r', 't');
  assert.equal(calls, 2, 'nothing goes to the wire inside the floor');
  assert.equal(gh.rate.served, 1);
});

test('past the spend ceiling a cached answer is served and an uncached one refuses', async () => {
  const gh = await load();
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return res({ default_branch: 'main' }, { headers: { etag: 'W/"a"' } }); };

  await gh.getRepo('o/warm', 't');          // fills the cache, spends 1
  gh.setPolicy({ spendCeiling: 1 });

  const warm = await gh.getRepo('o/warm', 't');
  assert.equal(warm.default_branch, 'main', 'a cached answer still renders');
  assert.equal(calls, 1, 'but it costs nothing');
  assert.equal(gh.rate.withheld, 1);

  // A member never read before cannot be served from anywhere, and the page says so
  // rather than pretending the repo is broken.
  await assert.rejects(() => gh.getRepo('o/cold', 't'), (e) => e.status === 'budget');
  assert.equal(calls, 1);
});

test('a 403 with nothing left stops the sweep instead of failing member by member', async () => {
  const gh = await load();
  const paths = [];
  globalThis.fetch = async (url) => {
    paths.push(url);
    return res({ message: 'API rate limit exceeded' }, {
      status: 403,
      headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-limit': '60', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600) },
    });
  };

  await assert.rejects(() => gh.getRepo('o/a', 't'));
  assert.ok(gh.rate.exhaustedUntil > Date.now(), 'the exhaustion is latched');

  // Eleven more members must not each spend a request discovering the same thing —
  // requests made are what the SECONDARY limit counts, so retrying is the one thing
  // that can make a rate limit worse.
  await assert.rejects(() => gh.getRepo('o/b', 't'), (e) => e.status === 'budget');
  assert.equal(paths.length, 1);
});

test('the budget survives a page load, so a fresh tab plans before it spends', async () => {
  const gh = await load();
  globalThis.fetch = async () => res({ default_branch: 'main' }, {
    headers: { 'x-ratelimit-remaining': '12', 'x-ratelimit-limit': '60', 'x-ratelimit-reset': '99999' },
  });
  await gh.getRepo('o/r', 't');

  const fresh = await load();               // a new module instance is a new tab
  assert.equal(fresh.rate.remaining, null, 'nothing is known before it is restored');
  fresh.restoreRate();
  assert.equal(fresh.rate.remaining, 12);
  assert.equal(fresh.rate.limit, 60);
});

test('the preflight reads the budget without spending any of it', async () => {
  const gh = await load();
  globalThis.fetch = async (url) => {
    assert.match(url, /\/rate_limit$/);
    return res({ resources: { core: { limit: 5000, remaining: 4321, reset: 12345 } } }, { headers: {} });
  };
  const out = await gh.preflightRate('t');
  assert.equal(out.remaining, 4321);
  assert.equal(gh.rate.limit, 5000);
  assert.equal(gh.rate.spent, 0, 'the preflight is not charged to the load');
});

test('history pages are withheld before the live queue is', async () => {
  const gh = await load();
  const full = Array.from({ length: 100 }, (_, i) => ({ number: i + 1, title: `i${i}`, state: 'closed', labels: [], body: '' }));
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return res(full, { headers: { etag: 'W/"p"' } }); };

  gh.setPolicy({ spendCeiling: 1 });
  const out = await gh.listIssues('o/r', 't', { pages: 5 });
  assert.equal(calls, 1, 'page 1 — the whole open queue — is still read');
  assert.equal(out.issues.length, 100);
  assert.equal(gh.rate.withheld, 1, 'the settled history behind it is what goes without');
});
