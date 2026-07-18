import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSheepdogConfig } from './check-fleet-coverage.mjs';

// The sheepdog census reads its fleet scope from the enforcer repo's sheepdog
// pack entry (legacy top-level packConfig.sheepdog still readable), and does ONE
// thing — coverage/adoption. (The work plan is the CORE planner's job —
// routines/fleet/plan.test.mjs. Migration application and retirement are the
// migrations flow's own passes — checks/test/fleet-retire.test.mjs and
// checks/test/fleet-apply.test.mjs — and no longer live here.)
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

// isCovered (fleet-api): the structural membership probe, dual-shape during the
// vendored-mount transition (mount/DESIGN.md) — the tracked declaration file is
// the one probe both shapes share; the legacy mount markers stay recognized
// until phase 3 so a half-adopted repo is never silently orphaned.
import { isCovered } from './fleet-api.mjs';

const ghWith = (paths200) => async (path) =>
  ({ status: paths200.some((p) => path.endsWith(`/contents/${p}`)) ? 200 : 404, json: {} });

test('isCovered: the tracked declaration file alone covers (vendored member); legacy mount markers still recognized; neither → not covered', async () => {
  assert.equal(await isCovered(ghWith(['.claudinite-checks.json']), 'o/vendored'), true);
  assert.equal(await isCovered(ghWith(['.claudinite/mount/sync-claudinite.sh']), 'o/legacy'), true);
  assert.equal(await isCovered(ghWith([]), 'o/vanilla'), false);
});
