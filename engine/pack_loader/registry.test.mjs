import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveDeclaredPacks, packEntryId, isActive, discoverPacks, loadPacks,
  LOCAL_DECL_PREFIX, declTokenFor,
} from './registry.mjs';

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

test('packEntryId/isActive: a local-pack declaration may be namespaced local_packs/<name>', () => {
  // The namespaced form is the canonical way to declare a local pack; the bare
  // id stays accepted while the fleet migrates (both resolve to the bare id).
  assert.equal(packEntryId('local_packs/proj'), 'proj');
  assert.equal(packEntryId({ id: 'local_packs/proj', config: {} }), 'proj');
  assert.ok(isActive({ id: 'proj', local: true }, { packs: ['local_packs/proj'] }));
  assert.ok(isActive({ id: 'proj', local: true }, { packs: [{ id: 'local_packs/proj', config: {} }] }));
  assert.ok(isActive({ id: 'proj', local: true }, { packs: ['proj'] })); // migration window
  assert.ok(!isActive({ id: 'other' }, { packs: ['local_packs/proj'] }));
});

test('declTokenFor: the writer-side token — namespaced for a local pack, bare for a canon one', () => {
  assert.equal(LOCAL_DECL_PREFIX, 'local_packs/');
  assert.equal(declTokenFor({ id: 'proj', local: true }), 'local_packs/proj');
  assert.equal(declTokenFor({ id: 'basics', local: false }), 'basics');
  assert.equal(packEntryId(declTokenFor({ id: 'proj', local: true })), 'proj'); // round-trips
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

test('resolveDeclaredPacks: keeps a namespaced local-pack entry verbatim — the backfill never rewrites the token', () => {
  // A local pack is never a canon `requires` target, so the entry just rides
  // through — in its declared (namespaced) form, not re-derived.
  const declared = ['basics', 'local_packs/proj'];
  assert.deepEqual(resolveDeclaredPacks(declared, PACKS), declared);
});

test('resolveDeclaredPacks: preserves an entry it cannot interpret rather than dropping it', () => {
  // The writer must never destroy what settings validation will flag.
  assert.deepEqual(
    resolveDeclaredPacks(['basics', { config: {} }], PACKS),
    ['basics', { config: {} }],
  );
});

// --- local-pack discovery ---------------------------------------------------

// Build a throwaway consumer checkout with local packs at
// <root>/.claudinite/local_packs/<name>/pack.mjs and return its root.
function makeLocalRoot(packs) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-localpacks-'));
  for (const [name, source] of Object.entries(packs)) {
    const dir = join(root, '.claudinite', 'local_packs', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pack.mjs'), source);
  }
  return root;
}

test('discoverPacks: with no localRoot, finds only the canon packs (all non-local)', async () => {
  const { packs, errors } = await discoverPacks();
  assert.equal(errors.length, 0);
  assert.ok(packs.some((p) => p.id === 'basics'));
  assert.ok(packs.every((p) => p.local === false));
  // every canon pack is stamped with its own directory
  assert.ok(packs.every((p) => typeof p.dir === 'string' && p.dir.includes('/packs/')));
});

test('discoverPacks: finds a consumer local pack, stamped local with its own dir', async () => {
  const root = makeLocalRoot({
    proj: `export default { id: 'proj', prose: 'RULES.md', rules: [], skills: [] };`,
  });
  try {
    const { packs, errors } = await discoverPacks({ localRoot: root });
    assert.equal(errors.length, 0);
    const local = packs.find((p) => p.id === 'proj');
    assert.ok(local, 'the local pack is discovered');
    assert.equal(local.local, true);
    assert.equal(local.dir, join(root, '.claudinite', 'local_packs', 'proj'));
    // canon packs are still present and marked non-local
    assert.ok(packs.some((p) => p.id === 'basics' && p.local === false));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('discoverPacks: a broken local pack.mjs is isolated — an error, not a thrown loop', async () => {
  const root = makeLocalRoot({
    ok: `export default { id: 'ok', rules: [] };`,
    broken: `export default { id: 'broken', rules: [] } ; this is not valid javascript(`,
  });
  try {
    const { packs, errors } = await discoverPacks({ localRoot: root });
    assert.ok(packs.some((p) => p.id === 'ok'), 'the good local pack still loads');
    assert.ok(packs.some((p) => p.id === 'basics'), 'canon packs still load');
    assert.ok(errors.some((e) => /local_packs\/broken/.test(e.fix) || /broken/.test(e.what)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('discoverPacks: a non-directory at the local_packs path is a reported fault, not a throw', async () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-nondir-'));
  mkdirSync(join(root, '.claudinite'), { recursive: true });
  // a FILE where local_packs/ should be a directory
  writeFileSync(join(root, '.claudinite', 'local_packs'), 'not a directory\n');
  try {
    const { packs, errors } = await discoverPacks({ localRoot: root });
    assert.ok(packs.some((p) => p.id === 'basics'), 'canon packs still load');
    assert.ok(errors.some((e) => /not a readable directory/.test(e.what)), 'the fault is reported');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('discoverPacks: a local pack whose id differs from its directory name is reported', async () => {
  const root = makeLocalRoot({
    myproj: `export default { id: 'other-id', rules: [] };`,
  });
  try {
    const { packs, errors } = await discoverPacks({ localRoot: root });
    assert.ok(!packs.some((p) => p.id === 'other-id'), 'the mismatched pack is dropped');
    assert.ok(errors.some((e) => /exports id "other-id" but its directory is "myproj"/.test(e.what)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('discoverPacks: a local pack may not shadow a canon id — collision reported, local dropped', async () => {
  const root = makeLocalRoot({
    basics: `export default { id: 'basics', rules: [] };`,
  });
  try {
    const { packs, errors } = await discoverPacks({ localRoot: root });
    const basicsPacks = packs.filter((p) => p.id === 'basics');
    assert.equal(basicsPacks.length, 1, 'only one pack keeps the id');
    assert.equal(basicsPacks[0].local, false, 'the canon pack wins');
    assert.ok(errors.some((e) => /declared twice/.test(e.what)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('discoverPacks: gathers a local pack\'s bundled skill-owned checks', async () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-localskill-'));
  const packDir = join(root, '.claudinite', 'local_packs', 'proj');
  mkdirSync(join(packDir, 'skills', 'thing'), { recursive: true });
  writeFileSync(join(packDir, 'pack.mjs'), `export default { id: 'proj', rules: [], skills: ['thing'] };`);
  writeFileSync(join(packDir, 'skills', 'thing', 'checks.mjs'),
    `export default [{ id: 'proj-thing', severity: 'advisory', description: 'x', doc: 'd', why: 'w', run: () => [] }];`);
  try {
    const { packs } = await discoverPacks({ localRoot: root });
    const local = packs.find((p) => p.id === 'proj');
    assert.equal(local.skillChecks.length, 1);
    assert.equal(local.skillChecks[0].id, 'proj-thing');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('loadPacks: thin array wrapper over discoverPacks', async () => {
  const packs = await loadPacks();
  assert.ok(Array.isArray(packs));
  assert.ok(packs.some((p) => p.id === 'basics'));
});
