import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCovered, readDeclaration, isDormant, DECLARATION } from '../../packs/sheepdog/fleet-api.mjs';
import { isDormant as engineIsDormant } from '../../engine/checks/helpers/repo-context.mjs';

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

test('the sweeps decide dormancy with the ENGINE\'s predicate, not a private copy', async () => {
  // A sweep with its own notion of dormancy would nag exactly the repos that had
  // already opted out — the member's own scheduler and the enforcer must agree on
  // the one test, so the pack re-exports it rather than re-implementing it.
  assert.equal(isDormant, engineIsDormant);
  assert.equal(DECLARATION, '.claudinite-checks.json');
  assert.equal(isDormant(await readDeclaration(ghServing('{"dormant":true}'), 'o/asleep')), true);
  assert.equal(isDormant(await readDeclaration(ghServing('{"packs":[]}'), 'o/awake')), false);
});
