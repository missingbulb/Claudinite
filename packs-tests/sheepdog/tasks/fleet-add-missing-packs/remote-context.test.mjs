import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRemoteContext, makeRemoteEvaluator, fetchTree } from '../../../../packs/sheepdog/tasks/fleet-add-missing-packs/remote-context.mjs';

// The remote context is an APPROXIMATION of buildContext, and the whole point of the
// tests below is the boundary of that approximation: what it can decide from a path
// listing, what it can decide after a bounded prefetch, and what it must refuse to
// decide rather than answering "no".

// A fake `gh` that serves one tree and a fixed blob table, counting calls so the
// budget behaviour is observable rather than inferred.
function fakeGh({ tracked = [], truncated = false, blobs = {} } = {}) {
  const calls = [];
  const gh = async (path) => {
    calls.push(path);
    if (path.includes('/git/trees/')) {
      return { status: 200, json: { truncated, tree: tracked.map((p) => ({ type: 'blob', path: p })) } };
    }
    const m = /\/contents\/(.+)\?ref=/.exec(path);
    const file = m && decodeURIComponent(m[1]);
    if (file && Object.hasOwn(blobs, file)) {
      return { status: 200, json: { content: Buffer.from(blobs[file], 'utf8').toString('base64') } };
    }
    return { status: 404, json: null };
  };
  gh.calls = calls;
  return gh;
}

const pathOnly = { id: 'path-only', detect: (ctx) => ctx.tracked.includes('package.json') };
const readsOne = {
  id: 'reads-one',
  detect: (ctx) => ctx.tracked.filter((f) => f.endsWith('manifest.json'))
    .some((f) => (ctx.read(f) ?? '').includes('manifest_version')),
};
const grepsSource = {
  id: 'greps-source',
  detect: (ctx) => ctx.tracked.filter((f) => f.endsWith('.ts'))
    .some((f) => (ctx.read(f) ?? '').includes('jsonwebtoken')),
};

// --- the context itself -------------------------------------------------------

test('makeRemoteContext: read serves the cache, returns null for a miss, and records both', () => {
  // Null-for-a-miss is exactly what the real ctx.read does for an absent file, so a
  // fingerprint cannot tell "not fetched" from "not there" — which is precisely why
  // the evaluator below tracks the requests instead of trusting the verdict.
  const ctx = makeRemoteContext({ tracked: ['a.ts', 'b.ts'], blobs: new Map([['a.ts', 'hello']]) });
  assert.equal(ctx.read('a.ts'), 'hello');
  assert.equal(ctx.read('b.ts'), null);
  assert.deepEqual(ctx._requested, ['a.ts', 'b.ts']);
});

test('fetchTree: blobs only, and it surfaces GitHub\'s truncation flag', async () => {
  const gh = fakeGh({ tracked: ['package.json', 'src/a.ts'], truncated: true });
  const res = await fetchTree(gh, 'o/r', 'main');
  assert.deepEqual(res.tracked, ['package.json', 'src/a.ts']);
  assert.equal(res.truncated, true);
});

test('fetchTree: a non-200 throws rather than reporting an empty tree', async () => {
  // An empty tracked list would make every fingerprint answer "no" and the member
  // would be reported as perfectly fitted.
  const gh = async () => ({ status: 409, json: null });
  await assert.rejects(() => fetchTree(gh, 'o/r', 'main'), /returned 409/);
});

// --- what a path listing alone can decide -------------------------------------

test('a path-only fingerprint is decided from the tree, with no content reads at all', async () => {
  const gh = fakeGh({ tracked: ['package.json'] });
  const evaluate = makeRemoteEvaluator(gh, 'o/r', 'main', { tracked: ['package.json'], truncated: false });
  assert.deepEqual(await evaluate(pathOnly), { verdict: true, why: null });
  assert.equal(gh.calls.length, 0);   // the tree was passed in; nothing else was fetched
});

test('a path-only NON-match over a truncated tree is undecided, not false', async () => {
  // The listing is a subset, so "I did not see it" is not "it is not there".
  const evaluate = makeRemoteEvaluator(fakeGh(), 'o/r', 'main', { tracked: ['README.md'], truncated: true });
  const res = await evaluate(pathOnly);
  assert.equal(res.verdict, null);
  assert.match(res.why, /truncated/);
});

// --- the two-pass prefetch ----------------------------------------------------

test('a content-reading fingerprint resolves after the probe pass names its files', async () => {
  const tracked = ['src/manifest.json', 'README.md'];
  const gh = fakeGh({ tracked, blobs: { 'src/manifest.json': '{"manifest_version":3}' } });
  const evaluate = makeRemoteEvaluator(gh, 'o/r', 'main', { tracked, truncated: false });
  assert.deepEqual(await evaluate(readsOne), { verdict: true, why: null });
  // Exactly the one file the probe asked for — not the whole tree.
  assert.equal(gh.calls.length, 1);
  assert.match(gh.calls[0], /src%2Fmanifest\.json|src\/manifest\.json/);
});

test('a resolved fingerprint that finds nothing is a real false, not undecided', async () => {
  const tracked = ['src/manifest.json'];
  const gh = fakeGh({ tracked, blobs: { 'src/manifest.json': '{"name":"not an extension"}' } });
  const evaluate = makeRemoteEvaluator(gh, 'o/r', 'main', { tracked, truncated: false });
  assert.deepEqual(await evaluate(readsOne), { verdict: false, why: null });
});

test('a fingerprint that wants more reads than the budget is undecided, never false', async () => {
  // This is the guard that keeps the sweep honest about jwt/leaflet/web-speech-shaped
  // fingerprints: they grep every source file, and a weekly sweep across a whole
  // account cannot fetch them. Reporting `false` would silently under-detect.
  const tracked = Array.from({ length: 50 }, (_, i) => `src/f${i}.ts`);
  const gh = fakeGh({ tracked });
  const evaluate = makeRemoteEvaluator(gh, 'o/r', 'main', { tracked, truncated: false, budget: 5 });
  const res = await evaluate(grepsSource);
  assert.equal(res.verdict, null);
  assert.match(res.why, /50 file reads \(budget 5\)/);
  assert.equal(gh.calls.length, 0);   // and it costs nothing to give up
});

test('a fingerprint reaching past the probe\'s file list is undecided, never false', async () => {
  // `some` short-circuits: the probe pass stops at the first file (read → null →
  // falsy is not enough to stop it here, but a hit in pass 2 changes which files get
  // read). If pass 2 touches a file we never fetched, a `false` is under-detection.
  const tracked = ['src/a.ts', 'src/b.ts'];
  let pass = 0;
  const reachesFurther = {
    id: 'reaches',
    detect: (ctx) => {
      pass += 1;
      // pass 1 asks for a.ts only; pass 2 asks for b.ts, which was never prefetched
      return pass === 1 ? ctx.read('src/a.ts') === 'hit' : ctx.read('src/b.ts') === 'hit';
    },
  };
  const gh = fakeGh({ tracked, blobs: { 'src/a.ts': 'miss' } });
  const evaluate = makeRemoteEvaluator(gh, 'o/r', 'main', { tracked, truncated: false });
  const res = await evaluate(reachesFurther);
  assert.equal(res.verdict, null);
  assert.match(res.why, /reached past the files the probe pass named/);
});

test('a fingerprint that throws is undecided, with the message kept', async () => {
  const evaluate = makeRemoteEvaluator(fakeGh(), 'o/r', 'main', { tracked: [], truncated: false });
  const res = await evaluate({ id: 'broken', detect() { throw new Error('bad predicate'); } });
  assert.equal(res.verdict, null);
  assert.match(res.why, /bad predicate/);
});

// --- the real fingerprints ----------------------------------------------------

test('the canon\'s path-only fingerprints really are decidable over a tree listing', async () => {
  // The sweep's value depends on this being true of most packs; if the corpus moved
  // wholesale to content-reading fingerprints, the remote sweep would defer
  // everything and this test is where that would surface.
  const { default: node } = await import('../../../../packs/node/pack.mjs');
  const { default: githubActions } = await import('../../../../packs/github-actions/pack.mjs');
  const tracked = ['package.json', '.github/workflows/ci.yml'];
  const evaluate = makeRemoteEvaluator(fakeGh(), 'o/r', 'main', { tracked, truncated: false });
  assert.deepEqual(await evaluate(node), { verdict: true, why: null });
  assert.deepEqual(await evaluate(githubActions), { verdict: true, why: null });
});
