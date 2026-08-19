import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSheepdogConfig } from '../../packs/claudinite-fleet-sheepdog/fleet-config.mjs';

// The pack's ONE reader of the enforcer repo's claudinite-fleet-sheepdog pack entry — shared by both
// sweeps, which is why it sits at the pack root rather than inside either task. Its
// tests are here for the same reason: they cover the shared module, not a task.
// (Legacy top-level packConfig.claudinite-fleet-sheepdog stays readable until the pack-entry-config
// baseline migration retires.)

test('parseSheepdogConfig: reads owner + exclude; defaults owner to the home owner; throws when absent', () => {
  const cfg = { packs: [{ id: 'claudinite-fleet-sheepdog', config: { owner: 'MissingBulb', exclude: ['Owner/Repo-A', 'owner/repo-b'] } }] };
  const { owner, exclude } = parseSheepdogConfig(cfg, 'missingbulb/shepherd');
  assert.equal(owner, 'missingbulb');
  assert.ok(exclude.has('owner/repo-a') && exclude.has('owner/repo-b'));
  // owner defaults to the home repo's owner
  assert.equal(parseSheepdogConfig({ packs: [{ id: 'claudinite-fleet-sheepdog', config: {} }] }, 'acme/fleet').owner, 'acme');
  // the legacy top-level packConfig key stays readable, under the spelling it was written with
  assert.equal(parseSheepdogConfig({ packConfig: { sheepdog: { owner: 'Legacy' } } }, 'acme/fleet').owner, 'legacy');
  // and so does an entry an enforcer wrote before the pack was renamed
  assert.equal(parseSheepdogConfig({ packs: [{ id: 'sheepdog', config: { owner: 'Old' } }] }, 'acme/fleet').owner, 'old');
  // absent config aborts (absence is not "cover everything")
  assert.throws(() => parseSheepdogConfig({}, 'acme/fleet'), /declares no claudinite-fleet-sheepdog config/);
});

test('parseSheepdogConfig: packSeeds is the fleet\'s own vocabulary, and defaults to none', () => {
  // The enforcer names no pack: this list is where every seeded id comes from, supplied
  // by the fleet that declares the pack. A fleet asking its members to declare nothing
  // in particular is an ordinary fleet, so absent is an empty list, not an error.
  assert.deepEqual(parseSheepdogConfig({ packs: [{ id: 'claudinite-fleet-sheepdog', config: { owner: 'acme' } }] }, 'acme/Fleet').packSeeds, []);
  const seeds = parseSheepdogConfig({
    packs: [{ id: 'claudinite-fleet-sheepdog', config: { packSeeds: [{ id: 'a-pack', config: { repo: 'acme/People' } }, { id: 'b-pack' }] } }],
  }, 'acme/Fleet').packSeeds;
  assert.deepEqual(seeds, [{ id: 'a-pack', config: { repo: 'acme/People' } }, { id: 'b-pack' }]);

  // Ids are NOT lowercased, unlike owner/exclude: an id is written verbatim into every
  // member's settings and matched against a pack directory, so the case the fleet typed
  // is the case that lands.
  assert.deepEqual(parseSheepdogConfig({ packs: [{ id: 'claudinite-fleet-sheepdog', config: { packSeeds: [{ id: 'MixedCase' }] } }] }, 'a/f').packSeeds,
    [{ id: 'MixedCase' }]);

  // Junk in the list is dropped rather than written: a seed with no id names nothing,
  // and a non-object config is not parameters.
  assert.deepEqual(parseSheepdogConfig({
    packs: [{ id: 'claudinite-fleet-sheepdog', config: { packSeeds: [null, 'a-pack', { id: '  ' }, { id: 'ok', config: 'nope' }] } }],
  }, 'a/f').packSeeds, [{ id: 'ok' }]);
  assert.deepEqual(parseSheepdogConfig({ packs: [{ id: 'claudinite-fleet-sheepdog', config: { packSeeds: 'a-pack' } }] }, 'a/f').packSeeds, []);
});

test('parseSheepdogConfig: canonRepo defaults, so an existing config keeps working', () => {
  const bare = parseSheepdogConfig({ packs: [{ id: 'claudinite-fleet-sheepdog', config: { owner: 'MissingBulb' } }] }, 'missingbulb/shepherd');
  assert.equal(bare.canonRepo, 'missingbulb/Claudinite');
  const set = parseSheepdogConfig({ packs: [{ id: 'claudinite-fleet-sheepdog', config: { owner: 'acme', canonRepo: 'acme/Fork' } }] }, 'acme/fleet');
  assert.equal(set.canonRepo, 'acme/Fork');
  // `staleDays` was the retired date window (#1025). A config still carrying it is
  // read, not rejected — the enforcer's own file is not rewritten by this change.
  assert.equal(parseSheepdogConfig({ packs: [{ id: 'claudinite-fleet-sheepdog', config: { owner: 'a', staleDays: 3 } }] }, 'a/f').staleDays, undefined);
});
