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
  const { owner, exclude } = parseSheepdogConfig(cfg, 'missingbulb/shepherd');
  assert.equal(owner, 'missingbulb');
  assert.ok(exclude.has('owner/repo-a') && exclude.has('owner/repo-b'));
  // owner defaults to the home repo's owner
  assert.equal(parseSheepdogConfig({ packs: [{ id: 'sheepdog', config: {} }] }, 'acme/fleet').owner, 'acme');
  // the legacy top-level packConfig.sheepdog stays readable
  assert.equal(parseSheepdogConfig({ packConfig: { sheepdog: { owner: 'Legacy' } } }, 'acme/fleet').owner, 'legacy');
  // absent config aborts (absence is not "cover everything")
  assert.throws(() => parseSheepdogConfig({}, 'acme/fleet'), /declares no sheepdog config/);
});

test('parseSheepdogConfig: packSeeds is the fleet\'s own vocabulary, and defaults to none', () => {
  // The enforcer names no pack: this list is where every seeded id comes from, supplied
  // by the fleet that declares the pack. A fleet asking its members to declare nothing
  // in particular is an ordinary fleet, so absent is an empty list, not an error.
  assert.deepEqual(parseSheepdogConfig({ packs: [{ id: 'sheepdog', config: { owner: 'acme' } }] }, 'acme/Fleet').packSeeds, []);
  const seeds = parseSheepdogConfig({
    packs: [{ id: 'sheepdog', config: { packSeeds: [{ id: 'a-pack', config: { repo: 'acme/People' } }, { id: 'b-pack' }] } }],
  }, 'acme/Fleet').packSeeds;
  assert.deepEqual(seeds, [{ id: 'a-pack', config: { repo: 'acme/People' } }, { id: 'b-pack' }]);

  // Ids are NOT lowercased, unlike owner/exclude: an id is written verbatim into every
  // member's settings and matched against a pack directory, so the case the fleet typed
  // is the case that lands.
  assert.deepEqual(parseSheepdogConfig({ packs: [{ id: 'sheepdog', config: { packSeeds: [{ id: 'MixedCase' }] } }] }, 'a/f').packSeeds,
    [{ id: 'MixedCase' }]);

  // Junk in the list is dropped rather than written: a seed with no id names nothing,
  // and a non-object config is not parameters.
  assert.deepEqual(parseSheepdogConfig({
    packs: [{ id: 'sheepdog', config: { packSeeds: [null, 'a-pack', { id: '  ' }, { id: 'ok', config: 'nope' }] } }],
  }, 'a/f').packSeeds, [{ id: 'ok' }]);
  assert.deepEqual(parseSheepdogConfig({ packs: [{ id: 'sheepdog', config: { packSeeds: 'a-pack' } }] }, 'a/f').packSeeds, []);
});

test('parseSheepdogConfig: canonRepo and staleDays default, so an existing config keeps working', () => {
  const bare = parseSheepdogConfig({ packs: [{ id: 'sheepdog', config: { owner: 'MissingBulb' } }] }, 'missingbulb/shepherd');
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
