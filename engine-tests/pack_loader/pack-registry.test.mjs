import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
import {
  resolveDeclaredPacks, packEntryId, isActive, discoverPacks, loadPacks,
  LOCAL_DECL_PREFIX, declTokenFor,
} from '../../engine/pack_loader/pack-registry.mjs';
import { canonicalPackVersions, RENAMED_PACKS } from '../../engine/pack_loader/renamed-packs.mjs';

// The import closure the declaration is written through (bootstrap `--init` and
// the baselining backfill): declaring a pack materializes its `requires`.
const PACKS = [
  { id: 'basics' },
  { id: 'executable-requirements' },
  { id: 'spec-driven-product', requires: ['executable-requirements'] },
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

test('packEntryId/isActive: a local-pack declaration may be namespaced local/<name>', () => {
  // The namespaced `local/` form is the canonical way to declare a local pack;
  // the pre-rename `local_packs/` form and the bare id both stay accepted while
  // the fleet migrates (all three resolve to the bare id).
  assert.equal(packEntryId('local/proj'), 'proj');
  assert.equal(packEntryId({ id: 'local/proj', config: {} }), 'proj');
  assert.equal(packEntryId('local_packs/proj'), 'proj'); // legacy form still resolves
  assert.ok(isActive({ id: 'proj', local: true }, { packs: ['local/proj'] }));
  assert.ok(isActive({ id: 'proj', local: true }, { packs: [{ id: 'local/proj', config: {} }] }));
  assert.ok(isActive({ id: 'proj', local: true }, { packs: ['local_packs/proj'] })); // legacy window
  assert.ok(isActive({ id: 'proj', local: true }, { packs: ['proj'] })); // migration window
  assert.ok(!isActive({ id: 'other' }, { packs: ['local/proj'] }));
});

test('declTokenFor: the writer-side token — canonical namespaced for a local pack, bare for a canon one', () => {
  assert.equal(LOCAL_DECL_PREFIX, 'local/');
  assert.equal(declTokenFor({ id: 'proj', local: true }), 'local/proj');
  assert.equal(declTokenFor({ id: 'basics', local: false }), 'basics');
  assert.equal(packEntryId(declTokenFor({ id: 'proj', local: true })), 'proj'); // round-trips
});

test('resolveDeclaredPacks: materializes a required pack right after its dependent, with via provenance', () => {
  assert.deepEqual(
    resolveDeclaredPacks(['basics', 'spec-driven-product'], PACKS),
    ['basics', 'spec-driven-product', { id: 'executable-requirements', via: ['spec-driven-product'] }],
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
  const complete = ['executable-requirements', 'spec-driven-product'];
  assert.deepEqual(resolveDeclaredPacks(complete, PACKS), complete);
  const materialized = ['spec-driven-product', { id: 'executable-requirements', via: ['spec-driven-product'] }];
  assert.deepEqual(resolveDeclaredPacks(materialized, PACKS), materialized);
});

test('resolveDeclaredPacks: no duplicates when a dependency is also declared; a user-authored entry stays verbatim', () => {
  // executable-requirements appears once even though it's both declared and required —
  // and because the project declared it itself (no `via`), it gets none added.
  assert.deepEqual(
    resolveDeclaredPacks(['spec-driven-product', 'executable-requirements'], PACKS),
    ['spec-driven-product', 'executable-requirements'],
  );
  const configured = ['spec-driven-product', { id: 'executable-requirements', config: { x: 1 } }];
  assert.deepEqual(resolveDeclaredPacks(configured, PACKS), configured);
});

test('resolveDeclaredPacks: a via entry is recomputed as dependents come and go', () => {
  // The dependent was dropped: the materialized entry stays (droppable, the
  // project's call) but its via empties, marking the orphan.
  assert.deepEqual(
    resolveDeclaredPacks([{ id: 'executable-requirements', via: ['spec-driven-product'] }], PACKS),
    [{ id: 'executable-requirements', via: [] }],
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
    proj: `export default { id: 'proj', prose: 'RULES.md', worldRules: [], ruleRoutingGuidance: { belongs: 'this demo local pack', excludes: 'anything a canon pack owns' } };`,
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

test('discoverPacks: a pack\'s declared-checks.json rides its world rules, a skill\'s its skill checks', async () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-declared-'));
  const packDir = join(root, '.claudinite', 'local_packs', 'proj');
  mkdirSync(join(packDir, 'skills', 'thing'), { recursive: true });
  writeFileSync(join(packDir, 'pack.mjs'), `export default { id: 'proj', worldRules: [], skills: ['thing'], ruleRoutingGuidance: { belongs: 'whatever proj owns', excludes: 'whatever proj does not' } };`);
  writeFileSync(join(packDir, 'declared-checks.json'), JSON.stringify([
    { id: 'proj-declared', severity: 'blocking', failureMessage: 'it matters', scanFiles: '/\\.txt$/', matchLines: [{ match: '/bad/', what: 'w', fix: 'f' }] },
  ]));
  writeFileSync(join(packDir, 'skills', 'thing', 'declared-checks.json'), JSON.stringify([
    { id: 'proj-thing-declared', severity: 'advisory', failureMessage: 'it matters too', scanFiles: '/\\.txt$/', matchLines: [{ match: '/bad/', what: 'w', fix: 'f' }] },
  ]));
  try {
    const { packs, errors } = await discoverPacks({ localRoot: root });
    const local = packs.find((p) => p.id === 'proj');
    assert.deepEqual(errors, []);
    // The declaration is discovered structurally — nothing in the manifest names
    // it — and lands in the pack's rules stamped world scope, like a listed one.
    assert.deepEqual(local.rules.map((r) => [r.id, r.scope]), [['proj-declared', 'world']]);
    assert.equal(local.rules[0].why, 'it matters');
    assert.deepEqual(local.skillChecks.map((r) => r.id), ['proj-thing-declared']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('discoverPacks: a broken declared-checks.json is reported, and the pack still loads', async () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-declared-broken-'));
  const packDir = join(root, '.claudinite', 'local_packs', 'proj');
  mkdirSync(packDir, { recursive: true });
  writeFileSync(join(packDir, 'pack.mjs'), `export default { id: 'proj', worldRules: [], ruleRoutingGuidance: { belongs: 'whatever proj owns', excludes: 'whatever proj does not' } };`);
  writeFileSync(join(packDir, 'declared-checks.json'), '{ not json');
  try {
    const { packs, errors } = await discoverPacks({ localRoot: root });
    assert.ok(packs.some((p) => p.id === 'proj'), 'the pack loads without its declarations');
    assert.ok(errors.some((e) => /declared checks in .*proj failed to load/.test(e.what)), JSON.stringify(errors));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('loadPacks: thin array wrapper over discoverPacks', async () => {
  const packs = await loadPacks();
  assert.ok(Array.isArray(packs));
  assert.ok(packs.some((p) => p.id === 'basics'));
});

// --- renamed packs ---------------------------------------------------------
// The rename tolerance is what keeps a member from going dark for a cycle: its
// declaration and its mount are renamed by different halves of one converge, and
// nothing may depend on which half landed first. These assertions are ABOUT the
// legacy spellings, so a repo-wide rename sweep must never "fix" them into the new
// ones — that leaves the test asserting today's id maps to itself, which is green
// and vacuous.
test('packEntryId: a renamed pack resolves to its current id from either spelling', () => {
  assert.equal(packEntryId('core'), 'claudinite-lifecycle');
  assert.equal(packEntryId({ id: 'grow_with_claudinite', config: {} }), 'claudinite-growth');
  assert.equal(packEntryId('claudinite-lifecycle'), 'claudinite-lifecycle');
});

test('packEntryId: a local pack keeps its own namespace', () => {
  assert.equal(packEntryId(`${LOCAL_DECL_PREFIX}core`), 'core');
});

test('isActive: a declaration still carrying the old spelling activates the renamed pack', () => {
  const config = { packs: ['core', { id: 'grow_with_claudinite' }] };
  assert.equal(isActive({ id: 'claudinite-lifecycle' }, config), true);
  assert.equal(isActive({ id: 'claudinite-growth' }, config), true);
});

test('resolveDeclaredPacks: the old spelling pulls in the renamed pack requires', () => {
  const packs = [{ id: 'claudinite-lifecycle', requires: ['barriers'] }, { id: 'barriers' }];
  const ids = resolveDeclaredPacks(['core'], packs).map(packEntryId);
  assert.deepEqual(ids, ['claudinite-lifecycle', 'barriers']);
});

test('canonicalPackVersions: a version stamped under the old key is not read as absent', () => {
  assert.deepEqual(canonicalPackVersions({ core: 6, basics: 3 }), { 'claudinite-lifecycle': 6, basics: 3 });
  // Mid-converge a declaration can carry both; today's spelling is the one the
  // flows wrote, so it wins rather than being clobbered by the residue.
  assert.deepEqual(canonicalPackVersions({ core: 5, 'claudinite-lifecycle': 6 }), { 'claudinite-lifecycle': 6 });
});

// Every legacy spelling maps STRAIGHT to a live pack id, never to another legacy
// one: a chain would need as many normalization passes as there have been renames.
test('RENAMED_PACKS: no legacy spelling points at another legacy spelling', () => {
  for (const to of Object.values(RENAMED_PACKS)) {
    assert.ok(!Object.hasOwn(RENAMED_PACKS, to), `${to} is itself renamed — map the older spelling straight to today's`);
  }
});

// A mount can hold a pack directory the rename record already moved while the
// pack.mjs inside it still carries the old id — the tree is replaced only once the
// canon ships a version above the one that repo has. The pack must still activate,
// or it goes inert taking its checks, prose and tasks with it, silently.
test('discoverPacks: a mounted pack still announcing its old id activates under its current one', async () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-corpus-'));
  try {
    // A real corpus: the loader resolves packs/ relative to its own location, so the
    // fixture copies the loader in rather than passing a root it does not take.
    cpSync(join(REPO_ROOT, 'engine', 'pack_loader'), join(root, 'engine', 'pack_loader'), { recursive: true });
    // pack-schema validates a version against the engine's version module, which sits
    // beside pack_loader in the real tree.
    cpSync(join(REPO_ROOT, 'engine', 'version.mjs'), join(root, 'engine', 'version.mjs'));
    mkdirSync(join(root, 'packs', 'claudinite-lifecycle'), { recursive: true });
    writeFileSync(join(root, 'packs', 'claudinite-lifecycle', 'pack.mjs'),
      "export default { id: 'core', detect: null, worldRules: [], ruleRoutingGuidance: { belongs: 'x', excludes: 'y' } };\n");
    const registry = await import(pathToFileURL(join(root, 'engine', 'pack_loader', 'pack-registry.mjs')).href);
    const { packs } = await registry.discoverPacks({});
    assert.deepEqual(packs.map((p) => p.id), ['claudinite-lifecycle'],
      'the stale id resolves to the pack it has become');
    assert.equal(registry.isActive(packs[0], { packs: ['claudinite-lifecycle'] }), true);
    assert.equal(registry.isActive(packs[0], { packs: ['core'] }), true,
      'and a declaration not yet converged still activates it');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
