import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCovered, readFile, readDeclaration, putFile, isDormant, preferencesLocation, DECLARATION,
} from '../../packs/sheepdog/fleet-api.mjs';
import {
  isDormant as engineIsDormant, preferencesLocation as enginePreferencesLocation,
} from '../../engine/checks/helpers/repo-context.mjs';

// The pack's shared cross-repo REST layer. Membership is the tracked declaration
// file, the ONE probe every member carries whatever its mount shape
// (vendoring/DESIGN.md) — and the only shape the planner can plan for (activePacks
// is read from it). A mount marker WITHOUT a declaration is a half-adoption that
// must classify uncovered, so the census opens an adoption issue and it heals loudly.

const ghWith = (paths200) => async (path) =>
  ({ status: paths200.some((p) => path.endsWith(`/contents/${p}`)) ? 200 : 404, json: {} });

test('isCovered: the tracked declaration file is the single membership probe; a bare mount marker no longer covers', async () => {
  assert.equal(await isCovered(ghWith(['.claudinite-checks.json']), 'o/vendored-or-legacy-member'), true);
  assert.equal(await isCovered(ghWith(['.claudinite/mount/sync-claudinite.sh']), 'o/half-adopted'), false);
  assert.equal(await isCovered(ghWith([]), 'o/vanilla'), false);
});

// --- the declaration read the sweeps share ------------------------------------

const ghServing = (body, status = 200) => async () =>
  (status === 200 ? { status, json: { content: Buffer.from(body).toString('base64') } } : { status, json: null });

test('readDeclaration: parses the member\'s declaration, null for uncovered, throws on anything indeterminate', async () => {
  assert.deepEqual(await readDeclaration(ghServing('{"packs":["basics"]}'), 'o/member'), { packs: ['basics'] });
  assert.equal(await readDeclaration(ghServing('', 404), 'o/vanilla'), null);
  // "I could not read it" must never become "it says nothing" — that is how a
  // dormant repo would get swept anyway, and an unreadable one silently dropped.
  await assert.rejects(() => readDeclaration(ghServing('', 500), 'o/flaky'), /returned 500/);
  await assert.rejects(() => readDeclaration(ghServing('{oops'), 'o/broken'), /unparsable/);
});

test('readDeclaration: withFile hands back the bytes and the write precondition from the ONE response', async () => {
  // A sweep that decides from one read and then writes must pass the sha THAT read
  // returned — a second read could see a different commit, and the write would silently
  // land on top of it.
  const gh = async () => ({ status: 200, json: { content: Buffer.from('{\n  "packs": []\n}\n').toString('base64'), sha: 'blob1' } });
  const read = await readDeclaration(gh, 'o/member', DECLARATION, { withFile: true });
  assert.deepEqual(read.config, { packs: [] });
  assert.equal(read.text, '{\n  "packs": []\n}\n', 'the exact bytes, not a re-serialization');
  assert.equal(read.sha, 'blob1');
  assert.equal(await readDeclaration(async () => ({ status: 404 }), 'o/vanilla', DECLARATION, { withFile: true }), null);
  // readFile is the same read without the parse — used for source files, not settings.
  assert.deepEqual(await readFile(gh, 'o/member', 'engine/x.mjs'), { text: '{\n  "packs": []\n}\n', sha: 'blob1' });
});

test('putFile: the ONE write, sha-guarded — a 403/404 names the missing scope, a 409 is not written', async () => {
  const seen = [];
  const responder = (status) => async (path, opts) => { seen.push({ path, ...opts }); return { status, json: { message: 'nope', commit: { sha: 'c1' } } }; };

  assert.equal(await putFile(responder(200), 'o/member', { path: DECLARATION, text: 'x', sha: 's1', message: 'm' }), 'c1');
  assert.equal(seen[0].method, 'PUT');
  assert.equal(seen[0].body.sha, 's1', 'the read\'s sha is the precondition');
  assert.equal(Buffer.from(seen[0].body.content, 'base64').toString('utf8'), 'x');

  // The token scope is the likely cause of both, and the message has to say so — the
  // sweeps ran read-only across the fleet before this write existed.
  for (const status of [403, 404]) {
    await assert.rejects(() => putFile(responder(status), 'o/m', { path: 'p', text: 'x', message: 'm' }), /Contents WRITE/);
  }
  // The file moved under the run: this run does not write, the next one re-decides.
  await assert.rejects(() => putFile(responder(409), 'o/m', { path: 'p', text: 'x', sha: 'stale', message: 'm' }), /changed under the sweep/);
  await assert.rejects(() => putFile(responder(500), 'o/m', { path: 'p', text: 'x', message: 'm' }), /returned 500/);
});

test('the sweeps decide dormancy with the ENGINE\'s predicate, not a private copy', async () => {
  // A sweep with its own notion of dormancy would nag exactly the repos that had
  // already opted out — the member's own scheduler and the enforcer must agree on
  // the one test, so the pack re-exports it rather than re-implementing it.
  assert.equal(isDormant, engineIsDormant);
  assert.equal(DECLARATION, '.claudinite-checks.json');
  assert.equal(isDormant(await readDeclaration(ghServing('{"dormant":true}'), 'o/asleep')), true);
  assert.equal(isDormant(await readDeclaration(ghServing('{"packs":[]}'), 'o/awake')), false);
});

test('the preferences pointer is read with the ENGINE\'s resolver too — same reason', async () => {
  // The sweep must resolve a member's pointer exactly as the session-start step does,
  // or it would "fix" pointers that already work and leave broken ones alone.
  assert.equal(preferencesLocation, enginePreferencesLocation);
  const cfg = await readDeclaration(ghServing('{"preferences":{"repo":"o/fleet"}}'), 'o/member');
  assert.deepEqual(preferencesLocation(cfg), { repo: 'o/fleet', path: 'preferences' });
});
