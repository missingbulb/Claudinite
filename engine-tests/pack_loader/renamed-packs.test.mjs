import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RENAMED_PACKS, canonicalPackId, canonicalPackIdAmong,
} from '../../engine/pack_loader/renamed-packs.mjs';

// The two shapes the map holds are distinguished by what the TREE still carries,
// never by the map itself — an entry looks identical either way, so the cases below
// read whichever entry the map happens to carry and vary the tree around it. Naming
// a spelling instead makes each retirement (#1641) a test edit that says nothing.
const [LEGACY, SURVIVOR] = Object.entries(RENAMED_PACKS)[0];

test('canonicalPackIdAmong: a renamed directory still carrying the old id is canonicalized', () => {
  // The rename left ONE directory. Nothing else claims the new id, so the stale
  // `pack.mjs` id maps forward and the pack stays live.
  const present = new Set([LEGACY]);
  assert.equal(canonicalPackIdAmong(LEGACY, present), SURVIVOR);
  assert.equal(canonicalPackIdAmong(LEGACY, present), canonicalPackId(LEGACY));
});

test('canonicalPackIdAmong: an absorbed leftover beside its survivor keeps its own id', () => {
  // Both directories are real and live in the same mount. Mapping the absorbed
  // one onto the survivor would put two packs on one id — the collision that
  // dropped both and failed the converged tree's self-test (#1186).
  const present = new Set([LEGACY, SURVIVOR]);
  assert.equal(canonicalPackIdAmong(LEGACY, present), LEGACY);
  assert.equal(canonicalPackIdAmong(SURVIVOR, present), SURVIVOR);
});

test('canonicalPackIdAmong: an id no entry renames is returned untouched', () => {
  assert.equal(canonicalPackIdAmong('git-github', new Set(['git-github'])), 'git-github');
});

test('canonicalPackIdAmong: resolving every id in a tree yields no duplicates', () => {
  // The property the collision guard actually needs: distinct directories keep
  // distinct ids, whatever mix of renamed and absorbed leftovers a mount holds.
  const tree = [...new Set([...Object.keys(RENAMED_PACKS), ...Object.values(RENAMED_PACKS)])];
  const present = new Set(tree);
  const resolved = tree.map((id) => canonicalPackIdAmong(id, present));
  assert.equal(new Set(resolved).size, tree.length, `collided: ${resolved.join(', ')}`);
});
