import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeclaredPacks, packEntryId, isActive } from './registry.mjs';

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

test('packEntryId: reads a string entry, an object entry, and rejects malformed ones', () => {
  assert.equal(packEntryId('basics'), 'basics');
  assert.equal(packEntryId({ id: 'barriers', config: {} }), 'barriers');
  assert.equal(packEntryId({ config: {} }), undefined);
  assert.equal(packEntryId(null), undefined);
  assert.equal(packEntryId(42), undefined);
});

test('isActive: activation matches both entry forms', () => {
  assert.ok(isActive({ id: 'basics' }, { packs: ['basics'] }));
  assert.ok(isActive({ id: 'barriers' }, { packs: ['basics', { id: 'barriers', config: {} }] }));
  assert.ok(!isActive({ id: 'node' }, { packs: ['basics'] }));
  assert.ok(!isActive({ id: 'node' }, {}));
});

test('resolveDeclaredPacks: materializes a required pack right after its dependent, with via provenance', () => {
  assert.deepEqual(
    resolveDeclaredPacks(['basics', 'chrome-extension-release'], PACKS),
    ['basics', 'chrome-extension-release', { id: 'chrome-extension', via: ['chrome-extension-release'] }],
  );
});

test('resolveDeclaredPacks: transitive — one declared pack pulls the whole chain, each dep naming its requirer', () => {
  assert.deepEqual(resolveDeclaredPacks(['a'], PACKS), [
    'a',
    { id: 'b', via: ['a'] },
    { id: 'c', via: ['b'] },
  ]);
});

test('resolveDeclaredPacks: idempotent — an already-complete declaration is unchanged', () => {
  const complete = ['chrome-extension', 'chrome-extension-release'];
  assert.deepEqual(resolveDeclaredPacks(complete, PACKS), complete);
  const materialized = ['chrome-extension-release', { id: 'chrome-extension', via: ['chrome-extension-release'] }];
  assert.deepEqual(resolveDeclaredPacks(materialized, PACKS), materialized);
});

test('resolveDeclaredPacks: no duplicates when a dependency is also declared; a user-authored entry stays verbatim', () => {
  // chrome-extension appears once even though it's both declared and required —
  // and because the project declared it itself (no `via`), it gets none added.
  assert.deepEqual(
    resolveDeclaredPacks(['chrome-extension-release', 'chrome-extension'], PACKS),
    ['chrome-extension-release', 'chrome-extension'],
  );
  const configured = ['chrome-extension-release', { id: 'chrome-extension', config: { x: 1 } }];
  assert.deepEqual(resolveDeclaredPacks(configured, PACKS), configured);
});

test('resolveDeclaredPacks: a via entry is recomputed as dependents come and go', () => {
  // The dependent was dropped: the materialized entry stays (droppable, the
  // project's call) but its via empties, marking the orphan.
  assert.deepEqual(
    resolveDeclaredPacks([{ id: 'chrome-extension', via: ['chrome-extension-release'] }], PACKS),
    [{ id: 'chrome-extension', via: [] }],
  );
});

test('resolveDeclaredPacks: keeps an unknown declared id verbatim, never materializes a phantom dep', () => {
  // A declared id survives even if no pack defines it (settings validation flags it);
  // a `requires` naming a non-existent pack is not written into the declaration.
  assert.deepEqual(resolveDeclaredPacks(['ghost'], PACKS), ['ghost']);
  const withPhantom = [{ id: 'x', requires: ['nope'] }];
  assert.deepEqual(resolveDeclaredPacks(['x'], withPhantom), ['x']);
});

test('resolveDeclaredPacks: preserves an entry it cannot interpret rather than dropping it', () => {
  // The writer must never destroy what settings validation will flag.
  assert.deepEqual(
    resolveDeclaredPacks(['basics', { config: {} }], PACKS),
    ['basics', { config: {} }],
  );
});
