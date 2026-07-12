import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeclaredPacks } from './registry.mjs';

// The import closure the declaration is written through (bootstrap `--init` and
// the baselining backfill): declaring a pack materializes its `requires`.
const PACKS = [
  { id: 'basics' },
  { id: 'chrome-extension' },
  { id: 'chrome-extension-release', requires: ['chrome-extension'] },
  { id: 'a', requires: ['b'] },
  { id: 'b', requires: ['c'] },
  { id: 'c' },
];

test('resolveDeclaredPacks: pulls a required pack in right after its dependent', () => {
  assert.deepEqual(
    resolveDeclaredPacks(['basics', 'chrome-extension-release'], PACKS),
    ['basics', 'chrome-extension-release', 'chrome-extension'],
  );
});

test('resolveDeclaredPacks: transitive — one declared pack pulls the whole chain', () => {
  assert.deepEqual(resolveDeclaredPacks(['a'], PACKS), ['a', 'b', 'c']);
});

test('resolveDeclaredPacks: idempotent — an already-complete declaration is unchanged', () => {
  const complete = ['chrome-extension', 'chrome-extension-release'];
  assert.deepEqual(resolveDeclaredPacks(complete, PACKS), complete);
});

test('resolveDeclaredPacks: no duplicates when a dependency is also declared', () => {
  // chrome-extension appears once even though it's both declared and required.
  assert.deepEqual(
    resolveDeclaredPacks(['chrome-extension-release', 'chrome-extension'], PACKS),
    ['chrome-extension-release', 'chrome-extension'],
  );
});

test('resolveDeclaredPacks: keeps an unknown declared id verbatim, never materializes a phantom dep', () => {
  // A declared id survives even if no pack defines it (settings validation flags it);
  // a `requires` naming a non-existent pack is not written into the declaration.
  assert.deepEqual(resolveDeclaredPacks(['ghost'], PACKS), ['ghost']);
  const withPhantom = [{ id: 'x', requires: ['nope'] }];
  assert.deepEqual(resolveDeclaredPacks(['x'], withPhantom), ['x']);
});
