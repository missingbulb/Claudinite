import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverPacks } from '../engine/pack_loader/pack-registry.mjs';

// Every pack the canon OFFERS carries a pitch: the paragraph a repo that does not run
// Claudinite reads when a dashboard says the pack would fit it. The spec cannot require
// the field — a member's own local packs are offered to nobody — so the canon half is
// asserted here, over the real tree, where a newly added pack without one fails.
// A hidden pack is offered to nobody either, so it owes none.
test('every offered canon pack declares a pitch', async () => {
  const { packs } = await discoverPacks();
  assert.ok(packs.length > 20, `only ${packs.length} packs discovered — this test is asserting over the wrong tree`);
  const missing = packs.filter((p) => !p.hidden && typeof p.pitch !== 'string').map((p) => p.id);
  assert.deepEqual(missing, [], `these packs declare no pitch — add one to each pack.mjs: ${missing.join(', ')}`);
});
