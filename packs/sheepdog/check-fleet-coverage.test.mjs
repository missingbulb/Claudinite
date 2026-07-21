import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSheepdogConfig } from './check-fleet-coverage.mjs';

// The sheepdog census reads its fleet scope from the enforcer repo's sheepdog
// pack entry (legacy top-level packConfig.sheepdog still readable), and does ONE
// thing — coverage/adoption. (The work plan is the CORE planner's job —
// routines/fleet/plan.test.mjs. Migration application and retirement are the
// migrations flow's own passes — engine/test/fleet-retire.test.mjs and
// engine/test/fleet-apply.test.mjs — and no longer live here.)
test('parseSheepdogConfig: reads owner + exclude; defaults owner to the home owner; throws when absent', () => {
  const cfg = { packs: [{ id: 'sheepdog', config: { owner: 'MissingBulb', exclude: ['Owner/Repo-A', 'owner/repo-b'] } }] };
  const { owner, exclude } = parseSheepdogConfig(cfg, 'missingbulb/sheepdog');
  assert.equal(owner, 'missingbulb');
  assert.ok(exclude.has('owner/repo-a') && exclude.has('owner/repo-b'));
  // owner defaults to the home repo's owner
  assert.equal(parseSheepdogConfig({ packs: [{ id: 'sheepdog', config: {} }] }, 'acme/fleet').owner, 'acme');
  // the legacy top-level packConfig.sheepdog stays readable
  assert.equal(parseSheepdogConfig({ packConfig: { sheepdog: { owner: 'Legacy' } } }, 'acme/fleet').owner, 'legacy');
  // absent config aborts (absence is not "cover everything")
  assert.throws(() => parseSheepdogConfig({}, 'acme/fleet'), /declares no sheepdog config/);
});

// isCovered (fleet-api): membership is the tracked declaration file, the ONE
// probe every member carries whatever its mount shape (engine/vendoring/DESIGN.md) — and
// the only shape the planner can plan for (activePacks is read from it). A
// mount marker WITHOUT a declaration is a half-adoption that must classify
// uncovered, so the census opens an adoption issue and it heals loudly.
import { isCovered } from './fleet-api.mjs';

const ghWith = (paths200) => async (path) =>
  ({ status: paths200.some((p) => path.endsWith(`/contents/${p}`)) ? 200 : 404, json: {} });

test('isCovered: the tracked declaration file is the single membership probe; a bare mount marker no longer covers', async () => {
  assert.equal(await isCovered(ghWith(['.claudinite-checks.json']), 'o/vendored-or-legacy-member'), true);
  assert.equal(await isCovered(ghWith(['.claudinite/mount/sync-claudinite.sh']), 'o/half-adopted'), false);
  assert.equal(await isCovered(ghWith([]), 'o/vanilla'), false);
});
