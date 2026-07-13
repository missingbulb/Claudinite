import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSheepdogConfig } from './check-fleet-coverage.mjs';

// The sheepdog census reads its fleet scope from the enforcer repo's
// packConfig.sheepdog, and does ONE thing — coverage/adoption. (The work plan is
// the CORE planner's job — routines/fleet/plan.test.mjs. Migration application and
// retirement are the migrations flow's own passes — checks/test/fleet-retire.test.mjs
// and checks/test/fleet-apply.test.mjs — and no longer live here.)
test('parseSheepdogConfig: reads owner + exclude; defaults owner to the home owner; throws when absent', () => {
  const cfg = { packConfig: { sheepdog: { owner: 'MissingBulb', exclude: ['Owner/Repo-A', 'owner/repo-b'] } } };
  const { owner, exclude } = parseSheepdogConfig(cfg, 'missingbulb/sheepdog');
  assert.equal(owner, 'missingbulb');
  assert.ok(exclude.has('owner/repo-a') && exclude.has('owner/repo-b'));
  // owner defaults to the home repo's owner
  assert.equal(parseSheepdogConfig({ packConfig: { sheepdog: {} } }, 'acme/fleet').owner, 'acme');
  // absent packConfig.sheepdog aborts (absence is not "cover everything")
  assert.throws(() => parseSheepdogConfig({}, 'acme/fleet'), /no packConfig\.sheepdog/);
});
