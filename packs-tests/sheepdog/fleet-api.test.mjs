import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCovered } from '../../packs/sheepdog/fleet-api.mjs';

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
