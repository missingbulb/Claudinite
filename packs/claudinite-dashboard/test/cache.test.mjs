import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// `cache.mjs` is browser code talking to `localStorage`, so the test supplies one.
// A Map-backed stand-in with a byte ceiling is enough to exercise the two behaviours
// that actually matter: that a full quota degrades instead of throwing, and that
// eviction drops the OLDEST entries rather than whatever the engine iterated first.
class FakeStorage {
  constructor(limit = Infinity) { this.m = new Map(); this.limit = limit; }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  removeItem(k) { this.m.delete(k); }
  setItem(k, v) {
    const next = [...this.m.entries()].reduce((n, [a, b]) => n + a.length + b.length, 0)
      + k.length + String(v).length - (this.m.has(k) ? k.length + this.m.get(k).length : 0);
    if (next > this.limit) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    this.m.set(k, String(v));
  }
}

const load = async () => import(`../../../packs/claudinite-dashboard/cache.mjs?t=${Math.random()}`);

beforeEach(() => { globalThis.localStorage = new FakeStorage(); });

test('an immutable blob round-trips under its sha', async () => {
  const c = await load();
  assert.equal(c.immutable.get('o/r', 'sha1', 'a.mjs'), undefined, 'cold read is a miss');
  c.immutable.set('o/r', 'sha1', 'a.mjs', 'contents');
  assert.equal(c.immutable.get('o/r', 'sha1', 'a.mjs'), 'contents');
  // A different sha is a different world — this is the whole point of the key.
  assert.equal(c.immutable.get('o/r', 'sha2', 'a.mjs'), undefined);
});

// A 404 is a real answer that must be cached, and `null` must not read as a miss —
// otherwise every fleet sweep re-asks every member for files that are not there.
test('a cached absence is a hit, not a miss', async () => {
  const c = await load();
  c.immutable.set('o/r', 'sha1', 'missing.json', null);
  assert.equal(c.immutable.get('o/r', 'sha1', 'missing.json'), null);
  assert.notEqual(c.immutable.get('o/r', 'sha1', 'missing.json'), undefined);
});

test('a validated entry keeps its etag, and touch refreshes only the timestamp', async () => {
  const c = await load();
  c.validated.set('/x', 'W/"abc"', { v: 1 });
  const first = c.validated.get('/x');
  assert.equal(first.etag, 'W/"abc"');
  assert.deepEqual(first.data, { v: 1 });
  c.validated.touch('/x');
  const second = c.validated.get('/x');
  assert.deepEqual(second.data, { v: 1 }, 'a 304 must not disturb the cached body');
  assert.ok(second.at >= first.at);
});

test('an ageing entry expires at its ttl and not before', async () => {
  const c = await load();
  c.ageing.set('h', [1, 2, 3]);
  assert.deepEqual(c.ageing.get('h', 1000), [1, 2, 3]);
  assert.equal(c.ageing.get('h', 0), undefined, 'a zero ttl is always expired');
});

test('a full quota degrades to a miss instead of throwing', async () => {
  globalThis.localStorage = new FakeStorage(120);
  const c = await load();
  assert.doesNotThrow(() => c.ageing.set('big', 'x'.repeat(5000)));
  assert.equal(c.ageing.get('big'), undefined, 'the oversized write is simply absent');
});

test('eviction drops the oldest entries first', async () => {
  const c = await load();
  c.ageing.set('oldest', 'a');
  await new Promise((r) => setTimeout(r, 5));
  c.ageing.set('newest', 'b');
  // Shrink the ceiling so the next write must evict.
  globalThis.localStorage.limit = JSON.stringify({ at: Date.now(), data: 'b' }).length + 80;
  c.ageing.set('third', 'c');
  assert.equal(c.ageing.get('oldest'), undefined, 'the oldest entry went');
});

test('clearAll removes this tool\'s entries and leaves others alone', async () => {
  const c = await load();
  globalThis.localStorage.setItem('someone-else', 'keep me');
  c.ageing.set('mine', 1);
  c.clearAll();
  assert.equal(globalThis.localStorage.getItem('someone-else'), 'keep me');
  assert.equal(c.ageing.get('mine'), undefined);
});

// The projections are what makes a fleet's history fit in a ~5MB quota. A closed
// item's body is never read by the model, so storing it is pure waste.
test('projectIssue drops a closed item\'s body and keeps an open one\'s fields', async () => {
  const c = await load();
  const closed = c.projectIssue({ number: 1, title: 't', state: 'CLOSED', body: 'x'.repeat(9000), labels: [{ name: 'outcome:done' }] });
  assert.equal(closed.body, '');
  assert.equal(closed.state, 'closed', 'state is normalised to lowercase');
  assert.deepEqual(closed.labels, ['outcome:done']);

  const open = c.projectIssue({ number: 2, title: 't', state: 'open', body: `path\n\nNot-before: 2026-08-17T04:00:00Z\n${'x'.repeat(9000)}`, labels: [] });
  assert.ok(open.body.includes('Not-before'), 'the scheduling fields survive truncation');
  assert.ok(open.body.length < 1000, 'but the body is bounded');
});

test('projectRun keeps only the rendered fields', async () => {
  const c = await load();
  const r = c.projectRun({ name: 'CI', path: '.github/workflows/ci.yml', status: 'completed', conclusion: 'success', event: 'push', head_branch: 'main', created_at: 'x', html_url: 'u', repository: { huge: true } });
  assert.deepEqual(Object.keys(r).sort(), ['conclusion', 'created_at', 'event', 'head_branch', 'html_url', 'name', 'path', 'status']);
  // The workflow file, which is how a scheduler or executor run is told from the
  // repo's own CI. A payload without one keeps the key as null rather than dropping
  // it, so a reader never has to distinguish "absent" from "old cache entry".
  assert.equal(c.projectRun({ name: 'CI' }).path, null);
});
