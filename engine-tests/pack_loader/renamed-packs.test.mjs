import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RENAMED_PACKS, canonicalPackId, canonicalPackIdAmong,
} from '../../engine/pack_loader/renamed-packs.mjs';

// The two shapes the map holds are distinguished by what the TREE still carries,
// never by the map itself — an entry looks identical either way.
const RENAMED = 'core';                        // -> claudinite-lifecycle
const ABSORBED = 'github-actions';             // -> git-github, whose directory lives on

test('canonicalPackIdAmong: a renamed directory still carrying the old id is canonicalized', () => {
  // The rename left ONE directory. Nothing else claims the new id, so the stale
  // `pack.mjs` id maps forward and the pack stays live.
  const present = new Set([RENAMED, 'basics']);
  assert.equal(canonicalPackIdAmong(RENAMED, present), RENAMED_PACKS[RENAMED]);
  assert.equal(canonicalPackIdAmong(RENAMED, present), canonicalPackId(RENAMED));
});

test('canonicalPackIdAmong: an absorbed leftover beside its survivor keeps its own id', () => {
  // Both directories are real and live in the same mount. Mapping the absorbed
  // one onto the survivor would put two packs on one id — the collision that
  // dropped both and failed the converged tree's self-test (#1186).
  const survivor = RENAMED_PACKS[ABSORBED];
  const present = new Set([ABSORBED, survivor]);
  assert.equal(canonicalPackIdAmong(ABSORBED, present), ABSORBED);
  assert.equal(canonicalPackIdAmong(survivor, present), survivor);
});

test('canonicalPackIdAmong: an id no entry renames is returned untouched', () => {
  assert.equal(canonicalPackIdAmong('basics', new Set(['basics'])), 'basics');
});

test('canonicalPackIdAmong: resolving every id in a tree yields no duplicates', () => {
  // The property the collision guard actually needs: distinct directories keep
  // distinct ids, whatever mix of renamed and absorbed leftovers a mount holds.
  const tree = ['basics', 'chrome-extension', 'chrome-extension-release', 'git-github', ABSORBED, RENAMED];
  const present = new Set(tree);
  const resolved = tree.map((id) => canonicalPackIdAmong(id, present));
  assert.equal(new Set(resolved).size, tree.length, `collided: ${resolved.join(', ')}`);
});
