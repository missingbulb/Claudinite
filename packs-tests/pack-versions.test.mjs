import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverPacks } from '../engine/pack_loader/pack-registry.mjs';
import { ENGINE_VERSION } from '../engine/version.mjs';

// Every canon pack declares both version fields. The manifest spec cannot require
// them — a member's own local packs are repo-owned, carry no version, and nothing
// would carry a fix if the loader started rejecting them (DESIGN §8) — so the
// "canon packs are versioned" half is asserted here, over the canon tree, where it
// is the only tree the claim is about.
//
// Runs against the REAL pack set rather than a fixture: a fixture would keep proving
// that a manifest CAN carry a version while a newly added pack silently shipped
// without one. Discovered with no `localRoot`, so the home's own local packs — which
// are exactly the unversioned kind — stay out of scope.
test('every canon pack declares a version and the engine version it needs', async () => {
  const { packs } = await discoverPacks();
  assert.ok(packs.length > 20, `only ${packs.length} packs discovered — this test is asserting over the wrong tree`);

  for (const pack of packs) {
    assert.ok(Number.isInteger(pack.version) && pack.version > 0,
      `pack "${pack.id}" declares no version — add "version: 1" to packs/${pack.id}/pack.mjs`);
    assert.ok(Number.isInteger(pack.minEngineVersion) && pack.minEngineVersion > 0,
      `pack "${pack.id}" declares no minEngineVersion — add "minEngineVersion: 1" to packs/${pack.id}/pack.mjs`);
    // A pack that asks for an engine newer than the one it ships beside could never
    // apply anywhere: the canon is the newest engine that exists.
    assert.ok(pack.minEngineVersion <= ENGINE_VERSION,
      `pack "${pack.id}" requires engine version ${pack.minEngineVersion}, above the canon's own ${ENGINE_VERSION}`);
  }
});
