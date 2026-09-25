import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
import {
  resolveDeclaredPacks, packEntryId, isActive, discoverPacks, loadPacks,
  LOCAL_DECL_PREFIX, declTokenFor,
} from '../../engine/pack_loader/pack-registry.mjs';
import { canonicalPackVersions, RENAMED_PACKS } from '../../engine/pack_loader/renamed-packs.mjs';
import { removeTree } from '../../engine/remove-tree.mjs';
import { A_CANON_PACK } from '../helpers.mjs';

// The import closure the declaration is written through (bootstrap `--init` and
// the update's backfill): declaring a pack materializes its `requires`.
const PACKS = [
  { id: 'acme-pack' },
  { id: 'acme-pack-b' },
  { id: 'acme-pack-c', requires: ['acme-pack-b'] },
  { id: 'a', requires: ['b'] },
  { id: 'b', requires: ['c'] },
  { id: 'c' },
];

test('packEntryId: reads a string entry, an object entry, and rejects malformed ones', () => {
  assert.equal(packEntryId('acme-pack'), 'acme-pack');
  assert.equal(packEntryId({ id: 'acme-pack-d', config: {} }), 'acme-pack-d');
  assert.equal(packEntryId({ config: {} }), undefined);
  assert.equal(packEntryId(null), undefined);
  assert.equal(packEntryId(42), undefined);
});

test('isActive: activation matches both entry forms', () => {
  assert.ok(isActive({ id: 'acme-pack' }, { packs: ['acme-pack'] }));
  assert.ok(isActive({ id: 'acme-pack-d' }, { packs: ['acme-pack', { id: 'acme-pack-d', config: {} }] }));
  assert.ok(!isActive({ id: 'acme-pack-e' }, { packs: ['acme-pack'] }));
  assert.ok(!isActive({ id: 'acme-pack-e' }, {}));
});

test('packEntryId/isActive: a local-pack declaration may be namespaced local/<name>', () => {
  // The namespaced `local/` form is the canonical way to declare a local pack, and
  // the bare id stays accepted — a declaration is text a member wrote once. The
  // pre-rename `local_packs/` token stopped resolving on #1640, so it now names a
  // pack nothing has.
  assert.equal(packEntryId('local/proj'), 'proj');
  assert.equal(packEntryId({ id: 'local/proj', config: {} }), 'proj');
  assert.equal(packEntryId('local_packs/proj'), 'local_packs/proj'); // retired token: no longer stripped
  assert.ok(isActive({ id: 'proj', local: true }, { packs: ['local/proj'] }));
  assert.ok(isActive({ id: 'proj', local: true }, { packs: [{ id: 'local/proj', config: {} }] }));
  assert.ok(!isActive({ id: 'proj', local: true }, { packs: ['local_packs/proj'] })); // retired token
  assert.ok(isActive({ id: 'proj', local: true }, { packs: ['proj'] })); // bare id
  assert.ok(!isActive({ id: 'other' }, { packs: ['local/proj'] }));
});

test('declTokenFor: the writer-side token — canonical namespaced for a local pack, bare for a canon one', () => {
  assert.equal(declTokenFor({ id: 'proj', local: true }), 'local/proj');
  assert.equal(declTokenFor({ id: 'acme-pack', local: false }), 'acme-pack');
  assert.equal(packEntryId(declTokenFor({ id: 'proj', local: true })), 'proj'); // round-trips
});

test('resolveDeclaredPacks: materializes a required pack right after its dependent, with via provenance', () => {
  assert.deepEqual(
    resolveDeclaredPacks(['acme-pack', 'acme-pack-c'], PACKS),
    ['acme-pack', 'acme-pack-c', { id: 'acme-pack-b', via: ['acme-pack-c'] }],
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
  const complete = ['acme-pack-b', 'acme-pack-c'];
  assert.deepEqual(resolveDeclaredPacks(complete, PACKS), complete);
  const materialized = ['acme-pack-c', { id: 'acme-pack-b', via: ['acme-pack-c'] }];
  assert.deepEqual(resolveDeclaredPacks(materialized, PACKS), materialized);
});

test('resolveDeclaredPacks: no duplicates when a dependency is also declared; a user-authored entry stays verbatim', () => {
  // executable-requirements appears once even though it's both declared and required —
  // and because the project declared it itself (no `via`), it gets none added.
  assert.deepEqual(
    resolveDeclaredPacks(['acme-pack-c', 'acme-pack-b'], PACKS),
    ['acme-pack-c', 'acme-pack-b'],
  );
  const configured = ['acme-pack-c', { id: 'acme-pack-b', config: { x: 1 } }];
  assert.deepEqual(resolveDeclaredPacks(configured, PACKS), configured);
});

test('resolveDeclaredPacks: a via entry is recomputed as dependents come and go', () => {
  // The dependent was dropped: the materialized entry stays (droppable, the
  // project's call) but its via empties, marking the orphan.
  assert.deepEqual(
    resolveDeclaredPacks([{ id: 'acme-pack-b', via: ['acme-pack-c'] }], PACKS),
    [{ id: 'acme-pack-b', via: [] }],
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
  const declared = ['acme-pack', 'local_packs/proj'];
  assert.deepEqual(resolveDeclaredPacks(declared, PACKS), declared);
});

test('resolveDeclaredPacks: preserves an entry it cannot interpret rather than dropping it', () => {
  // The writer must never destroy what settings validation will flag.
  assert.deepEqual(
    resolveDeclaredPacks(['acme-pack', { config: {} }], PACKS),
    ['acme-pack', { config: {} }],
  );
});

// --- local-pack discovery ---------------------------------------------------

// Build a throwaway consumer checkout with local packs at
// <root>/.claudinite/local/packs/<name>/pack.mjs and return its root.
function makeLocalRoot(packs) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-localpacks-'));
  for (const [name, source] of Object.entries(packs)) {
    const dir = join(root, '.claudinite', 'local', 'packs', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pack.mjs'), source);
  }
  return root;
}

test('discoverPacks: with no localRoot, finds only the canon packs (all non-local)', async () => {
  const { packs, errors } = await discoverPacks();
  assert.equal(errors.length, 0);
  assert.ok(packs.some((p) => p.id === A_CANON_PACK));
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
    assert.equal(local.dir, join(root, '.claudinite', 'local', 'packs', 'proj'));
    // canon packs are still present and marked non-local
    assert.ok(packs.some((p) => p.id === A_CANON_PACK && p.local === false));
  } finally {
    removeTree(root);
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
    assert.ok(packs.some((p) => p.id === A_CANON_PACK), 'canon packs still load');
    assert.ok(errors.some((e) => /local_packs\/broken/.test(e.fix) || /broken/.test(e.what)));
  } finally {
    removeTree(root);
  }
});

test('discoverPacks: a non-directory at the local-packs path is a reported fault, not a throw', async () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-nondir-'));
  mkdirSync(join(root, '.claudinite', 'local'), { recursive: true });
  // a FILE where local/packs/ should be a directory
  writeFileSync(join(root, '.claudinite', 'local', 'packs'), 'not a directory\n');
  try {
    const { packs, errors } = await discoverPacks({ localRoot: root });
    assert.ok(packs.some((p) => p.id === A_CANON_PACK), 'canon packs still load');
    assert.ok(errors.some((e) => /not a readable directory/.test(e.what)), 'the fault is reported');
  } finally {
    removeTree(root);
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
    removeTree(root);
  }
});

test('discoverPacks: a local pack may not shadow a canon id — collision reported, local dropped', async () => {
  const root = makeLocalRoot({
    basics: `export default { id: 'basics', rules: [] };`,
  });
  try {
    const { packs, errors } = await discoverPacks({ localRoot: root });
    const basicsPacks = packs.filter((p) => p.id === A_CANON_PACK);
    assert.equal(basicsPacks.length, 1, 'only one pack keeps the id');
    assert.equal(basicsPacks[0].local, false, 'the canon pack wins');
    assert.ok(errors.some((e) => /declared twice/.test(e.what)));
  } finally {
    removeTree(root);
  }
});

test('discoverPacks: gathers a local pack\'s bundled skill-owned checks', async () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-localskill-'));
  const packDir = join(root, '.claudinite', 'local', 'packs', 'proj');
  mkdirSync(join(packDir, 'skills', 'thing'), { recursive: true });
  writeFileSync(join(packDir, 'pack.mjs'), `export default { id: 'proj', rules: [], skills: ['thing'] };`);
  writeFileSync(join(packDir, 'skills', 'thing', 'checks.mjs'),
    `export default [{ id: 'proj-thing', on_fail: 'advise', description: 'x', doc: 'd', why: 'w', run: () => [] }];`);
  try {
    const { packs } = await discoverPacks({ localRoot: root });
    const local = packs.find((p) => p.id === 'proj');
    assert.equal(local.skillChecks.length, 1);
    assert.equal(local.skillChecks[0].id, 'proj-thing');
  } finally {
    removeTree(root);
  }
});

test('discoverPacks: a pack\'s declared-checks.json rides its world rules, a skill\'s its skill checks', async () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-declared-'));
  const packDir = join(root, '.claudinite', 'local', 'packs', 'proj');
  mkdirSync(join(packDir, 'skills', 'thing'), { recursive: true });
  writeFileSync(join(packDir, 'pack.mjs'), `export default { id: 'proj', worldRules: [], skills: ['thing'], ruleRoutingGuidance: { belongs: 'whatever proj owns', excludes: 'whatever proj does not' } };`);
  writeFileSync(join(packDir, 'declared-checks.json'), JSON.stringify([
    { id: 'proj-declared', on_fail: 'block', failureMessage: 'it matters', scanFiles: '/\\.txt$/', matchLines: [{ match: '/bad/', what: 'w', fix: 'f' }] },
  ]));
  writeFileSync(join(packDir, 'skills', 'thing', 'declared-checks.json'), JSON.stringify([
    { id: 'proj-thing-declared', on_fail: 'advise', failureMessage: 'it matters too', scanFiles: '/\\.txt$/', matchLines: [{ match: '/bad/', what: 'w', fix: 'f' }] },
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
    removeTree(root);
  }
});

test('discoverPacks: a broken declared-checks.json is reported, and the pack still loads', async () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-declared-broken-'));
  const packDir = join(root, '.claudinite', 'local', 'packs', 'proj');
  mkdirSync(packDir, { recursive: true });
  writeFileSync(join(packDir, 'pack.mjs'), `export default { id: 'proj', worldRules: [], ruleRoutingGuidance: { belongs: 'whatever proj owns', excludes: 'whatever proj does not' } };`);
  writeFileSync(join(packDir, 'declared-checks.json'), '{ not json');
  try {
    const { packs, errors } = await discoverPacks({ localRoot: root });
    assert.ok(packs.some((p) => p.id === 'proj'), 'the pack loads without its declarations');
    assert.ok(errors.some((e) => /declared checks in .*proj failed to load/.test(e.what)), JSON.stringify(errors));
  } finally {
    removeTree(root);
  }
});

test('loadPacks: thin array wrapper over discoverPacks', async () => {
  const packs = await loadPacks();
  assert.ok(Array.isArray(packs));
  assert.ok(packs.some((p) => p.id === A_CANON_PACK));
});

// --- renamed packs ---------------------------------------------------------
// The rename tolerance is what keeps a member from going dark for a cycle: its
// declaration and its mount are renamed by different halves of one converge, and
// nothing may depend on which half landed first. These assertions are ABOUT the
// legacy spellings, so a repo-wide rename sweep must never "fix" them into the new
// ones — that leaves the test asserting today's id maps to itself, which is green
// and vacuous.
test('packEntryId: a renamed pack resolves to its current id from either spelling', () => {
  assert.equal(packEntryId('tidy-repo'), 'basics'); // @real-entity the rename map under test carries these ids
  assert.equal(packEntryId({ id: 'barriers', config: {} }), 'basics'); // @real-entity the rename map under test carries these ids
  assert.equal(packEntryId('basics'), 'basics'); // @real-entity the rename map under test carries these ids
});

test('packEntryId: a local pack keeps its own namespace', () => {
  assert.equal(packEntryId(`${LOCAL_DECL_PREFIX}barriers`), 'barriers');
});

test('isActive: a declaration still carrying the old spelling activates the renamed pack', () => {
  assert.equal(isActive({ id: 'basics' }, { packs: ['tidy-repo'] }), true); // @real-entity the rename map under test carries these ids
  assert.equal(isActive({ id: 'basics' }, { packs: [{ id: 'barriers' }] }), true); // @real-entity the rename map under test carries these ids
});

test('resolveDeclaredPacks: the old spelling pulls in the renamed pack requires', () => {
  const packs = [{ id: 'basics', requires: ['product-wiki'] }, { id: 'product-wiki' }]; // @real-entity the rename map under test resolves this id
  const ids = resolveDeclaredPacks(['tidy-repo'], packs).map(packEntryId);
  assert.deepEqual(ids, ['basics', 'product-wiki']); // @real-entity the rename map under test resolves this id
});

test('canonicalPackVersions: a version stamped under the old key is not read as absent', () => {
  assert.deepEqual(canonicalPackVersions({ 'tidy-repo': 6, 'git-github': 3 }), { basics: 6, 'git-github': 3 }); // @real-entity the rename map under test carries these ids
  // Mid-converge a declaration can carry both; today's spelling is the one the
  // flows wrote, so it wins rather than being clobbered by the residue.
  assert.deepEqual(canonicalPackVersions({ 'tidy-repo': 5, basics: 6 }), { basics: 6 });
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
  // Where a member's settings live: the loader resolves the declaration through it.
  for (const f of ['settings-file.mjs', 'settings-file-names.mjs']) cpSync(join(REPO_ROOT, 'engine', f), join(root, 'engine', f));
    mkdirSync(join(root, 'packs', 'basics'), { recursive: true }); // @real-entity the rename map under test carries these ids
    writeFileSync(join(root, 'packs', 'basics', 'pack.mjs'), // @real-entity the rename map under test carries these ids
      "export default { id: 'tidy-repo', detect: null, worldRules: [], ruleRoutingGuidance: { belongs: 'x', excludes: 'y' } };\n");
    const registry = await import(pathToFileURL(join(root, 'engine', 'pack_loader', 'pack-registry.mjs')).href);
    const { packs } = await registry.discoverPacks({});
    assert.deepEqual(packs.map((p) => p.id), ['basics'], // @real-entity the rename map under test carries these ids
      'the stale id resolves to the pack it has become');
    assert.equal(registry.isActive(packs[0], { packs: ['basics'] }), true); // @real-entity the rename map under test carries these ids
    assert.equal(registry.isActive(packs[0], { packs: ['tidy-repo'] }), true,
      'and a declaration not yet converged still activates it');
  } finally { removeTree(root); }
});

// THE COPIED ROOT — `.claudinite/temp/packs/`, written at session start by some pack's
// prepare step and gone with the container. It is where content belonging to the PERSON in
// front of the session lives, which no tracked tree can carry, and it is a pack root rather
// than a bespoke channel so that everything a pack already gets — prose, skills, checks, an
// `env` — is what that content gets.
function makeTempRoot(packs, { local = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-copied-'));
  for (const [name, files] of Object.entries(packs)) {
    for (const [rel, body] of Object.entries(files)) {
      const target = join(root, '.claudinite', 'temp', 'packs', name, rel);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, body);
    }
  }
  for (const [name, source] of Object.entries(local)) {
    const dir = join(root, '.claudinite', 'local', 'packs', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pack.mjs'), source);
  }
  return root;
}

const MANIFEST = 'export default { ruleRoutingGuidance: { belongs: "a person", excludes: "a project" } };\n';

test('discoverPacks: a copied pack is found, stamped temp, with its own prose and skills', async () => {
  const root = makeTempRoot({
    current_user: {
      'pack.mjs': MANIFEST,
      'RULES.md': '# Mine\n',
      'skills/pep-talk/SKILL.md': '---\nname: pep-talk\ndescription: Encourage.\n---\nx\n',
    },
  });
  try {
    const { packs, errors } = await discoverPacks({ localRoot: root, session: true });
    assert.deepEqual(errors.filter((e) => String(e.dir).includes('temp')), []);
    const copied = packs.find((p) => p.temp);
    assert.equal(copied.id, 'current_user');
    assert.equal(copied.local, false);
    assert.equal(copied.prose, 'RULES.md');
    assert.deepEqual(copied.skills, ['pep-talk']);
    assert.equal(copied.dir, join(root, '.claudinite', 'temp', 'packs', 'current_user'));
    // Every tracked pack is stamped false, so nothing else is swept up by the flag.
    assert.ok(packs.filter((p) => p.id !== 'current_user').every((p) => p.temp === false));
  } finally { removeTree(root); }
});

test('isActive: a copied pack is active by being there, and needs no declaration', async () => {
  // Nothing about it is the repository's to declare: the step that copied it already
  // decided, for this session and this person, and a declaration naming a person would put
  // one session's identity in a file every other person reads.
  const root = makeTempRoot({ current_user: { 'pack.mjs': MANIFEST, 'RULES.md': '# Mine\n' } });
  try {
    const packs = await loadPacks({ localRoot: root, session: true });
    const copied = packs.find((p) => p.temp);
    assert.ok(isActive(copied, { packs: [] }));
    assert.ok(isActive(copied, {}));
    // and the flag alone carries it — no declaration of that id is what does the work
    assert.ok(!isActive({ id: 'current_user' }, { packs: [] }));
  } finally { removeTree(root); }
});

test('discoverPacks: a copied pack may not shadow a pack the repository tracks', async () => {
  // What a session copies extends the repository, exactly as a local pack extends the
  // canon, and may not silently replace either.
  const root = makeTempRoot(
    { basics: { 'pack.mjs': MANIFEST }, mine: { 'pack.mjs': MANIFEST } },
    { local: { mine: 'export default { ruleRoutingGuidance: { belongs: "the repo", excludes: "a person" } };\n' } },
  );
  try {
    const { packs, errors } = await discoverPacks({ localRoot: root, session: true });
    assert.equal(packs.filter((p) => p.id === 'basics' && p.temp).length, 0, 'the canon keeps its name'); // @real-entity the rename map under test carries these ids
    assert.equal(packs.find((p) => p.id === 'mine').local, true, 'the repo keeps its name');
    assert.equal(errors.filter((e) => /copied pack/.test(e.what)).length, 2);
  } finally { removeTree(root); }
});

test('discoverPacks: a copied pack declaring tasks is reported, since nothing can ever run them', async () => {
  // A task is scheduled work over a repository, picked up by a runner reading the repo's
  // tracked packs. A copied pack is neither tracked nor there tomorrow.
  const root = makeTempRoot({
    current_user: { 'pack.mjs': MANIFEST, 'tasks/nightly/task.json': '{}\n' },
  });
  try {
    const { errors } = await discoverPacks({ localRoot: root, session: true });
    assert.equal(errors.filter((e) => /ships tasks\//.test(e.what)).length, 1);
  } finally { removeTree(root); }
});

test('discoverPacks: a copied pack claiming an id other than its directory is reported', async () => {
  // The directory is the session's, not the store's: the address the rules index imports
  // is fixed, so a pack that renamed itself is a pack nothing would find.
  const root = makeTempRoot({
    current_user: { 'pack.mjs': 'export default { id: "ariels-pack", ruleRoutingGuidance: { belongs: "a", excludes: "b" } };\n' },
  });
  try {
    const { packs, errors } = await discoverPacks({ localRoot: root, session: true });
    assert.equal(packs.filter((p) => p.temp).length, 0);
    assert.equal(errors.filter((e) => /exports id "ariels-pack"/.test(e.what)).length, 1);
  } finally { removeTree(root); }
});

test('discoverPacks: the copied root is opt-in — a reader that did not ask never sees it', async () => {
  // A copied pack governs the SESSION and says nothing about the repository, so a
  // conformance sweep over the shelf, a vendoring pass or a catalog generator must be
  // answered as if the directory were not there.
  const root = makeTempRoot({ current_user: { 'pack.mjs': MANIFEST, 'RULES.md': '# Mine\n' } });
  try {
    assert.equal((await loadPacks({ localRoot: root })).filter((p) => p.temp).length, 0);
    assert.equal((await loadPacks({ localRoot: root, session: true })).filter((p) => p.temp).length, 1);
  } finally { removeTree(root); }
});
