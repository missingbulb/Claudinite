import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSheepdogConfig } from '../../packs/sheepdog/fleet-config.mjs';

// The pack's ONE reader of the enforcer repo's sheepdog pack entry — shared by both
// sweeps, which is why it sits at the pack root rather than inside either task. Its
// tests are here for the same reason: they cover the shared module, not a task.
// (Legacy top-level packConfig.sheepdog stays readable until the pack-entry-config
// baseline migration retires.)

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

test('parseSheepdogConfig: canonRepo and staleDays default, so an existing config keeps working', () => {
  const bare = parseSheepdogConfig({ packs: [{ id: 'sheepdog', config: { owner: 'MissingBulb' } }] }, 'missingbulb/sheepdog');
  assert.equal(bare.canonRepo, 'missingbulb/Claudinite');
  assert.equal(bare.staleDays, 14);
  const set = parseSheepdogConfig({ packs: [{ id: 'sheepdog', config: { owner: 'acme', canonRepo: 'acme/Fork', staleDays: 3 } }] }, 'acme/fleet');
  assert.equal(set.canonRepo, 'acme/Fork');
  assert.equal(set.staleDays, 3);
  // a nonsense window falls back rather than disabling the sweep (0 would flag everything)
  for (const staleDays of [0, -5, 'soon', null]) {
    assert.equal(parseSheepdogConfig({ packs: [{ id: 'sheepdog', config: { owner: 'a', staleDays } }] }, 'a/f').staleDays, 14, String(staleDays));
  }
});
