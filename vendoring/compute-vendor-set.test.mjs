import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

// This test lives at <repo>/vendoring/compute-vendor-set.test.mjs.
const MOUNT_DIR = dirname(fileURLToPath(import.meta.url)); // <canon>/vendoring/
const REPO_ROOT = dirname(MOUNT_DIR);

function writeAt(root, rel, content) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

// A hermetic canon mirroring the real layout: the REAL vendor.mjs with the
// REAL modules it imports (engine/pack_loader/pack-registry.mjs, engine/checks/helpers/module-imports.mjs — all
// self-locate relative to their own file), a small engine tree with the things
// that must be EXCLUDED present (tests, engine-root docs, an undeclared top-level
// tree), and
// fixture packs/skills — so the tests exercise the structural-discovery
// contract, not the live corpus's contents.
function makeCanon({ packs = [], skills = [], packDirectory = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-vendor-'));
  mkdirSync(join(root, 'vendoring'), { recursive: true });
  mkdirSync(join(root, 'engine', 'pack_loader'), { recursive: true });
  mkdirSync(join(root, 'engine', 'checks', 'helpers'), { recursive: true });
  mkdirSync(join(root, 'packs'), { recursive: true });
  copyFileSync(join(MOUNT_DIR, 'compute-vendor-set.mjs'), join(root, 'vendoring', 'compute-vendor-set.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'pack_loader', 'pack-registry.mjs'), join(root, 'engine', 'pack_loader', 'pack-registry.mjs'));
  // The registry validates every manifest against the spec, so the fake corpus
  // needs the spec module too — it is part of the loader, not an optional extra.
  copyFileSync(join(REPO_ROOT, 'engine', 'pack_loader', 'pack-schema.mjs'), join(root, 'engine', 'pack_loader', 'pack-schema.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'pack_loader', 'pack-conventions.mjs'), join(root, 'engine', 'pack_loader', 'pack-conventions.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'pack_loader', 'renamed-packs.mjs'), join(root, 'engine', 'pack_loader', 'renamed-packs.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'checks', 'helpers', 'module-imports.mjs'), join(root, 'engine', 'checks', 'helpers', 'module-imports.mjs'));
  // The recency predicate the migrations walk shares with check-tolerance.
  copyFileSync(join(REPO_ROOT, 'engine', 'checks', 'helpers', 'active-migrations.mjs'), join(root, 'engine', 'checks', 'helpers', 'active-migrations.mjs'));
  // The engine version the set reports beside the files — the real module, so the
  // fixture cannot disagree with the canon about what version this engine is.
  copyFileSync(join(REPO_ROOT, 'engine', 'version.mjs'), join(root, 'engine', 'version.mjs'));
  // Where a member's settings live and what shape the versions in them take — real
  // modules, because the import closure walks them out of active-migrations.
  copyFileSync(join(REPO_ROOT, 'engine', 'settings-file.mjs'), join(root, 'engine', 'settings-file.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'installed-versions.mjs'), join(root, 'engine', 'installed-versions.mjs'));
  // engine roots: real-shaped content plus everything that must stay out
  writeAt(root, 'engine/checks/check_the_world.mjs', 'stub\n');
  writeAt(root, 'engine/checks/helpers/repo-context.mjs', 'stub\n');
  // The pattern-check engine the registry reaches for when a pack carries
  // declared-checks.json — a stub here: the fixture packs declare none, but the
  // set's import-closure guard still resolves the registry's reference to it.
  writeAt(root, 'engine/checks/helpers/pattern-rules.mjs', 'stub\n');
  writeAt(root, 'engine/checks/README.md', 'canon doc\n');
  // engine/scheduler: an OPERATIONAL doc the consumer reads at runtime (vendored,
  // despite .md) beside a maintainer doc (excluded like every other engine .md).
  writeAt(root, 'engine/scheduler/executor.md', 'executor instructions\n');
  writeAt(root, 'engine/scheduler/DESIGN.md', 'canon doc\n');
  writeAt(root, 'engine/test/runner.test.mjs', 'stub\n');
  writeAt(root, 'engine/hooks/session-start-command.sh', 'stub\n');
  writeAt(root, 'vendoring/DESIGN.md', 'canon doc\n');
  // machinery roots: top-level .mjs picked up, tests and dirs' docs not
  writeAt(root, 'engine/pack_loader/generate-rules-index.mjs', 'stub\n');
  writeAt(root, 'engine/pack_loader/env-requirements.mjs', 'stub\n');
  writeAt(root, 'packs/env.test.mjs', 'stub\n');
  writeAt(root, 'packs/README.md', 'canon doc\n');
  writeAt(root, 'engine/pack_loader/mount-skills.mjs', 'stub\n');
  // the full pack directory: generated catalog, vendored unconditionally
  if (packDirectory) writeAt(root, 'packs/directory.GENERATED.md', 'stub catalog\n');
  // a top-level tree no engine root and no pack names: the set is what the
  // declaration reaches, never "everything that happens to be in the canon"
  writeAt(root, 'canon-only/notes.md', 'canon-side\n');
  // migrations: the applier + registry + the RECENT record folders vendor
  // (task-code-work §7); aged records, the README and tests do not. Records sit
  // under the flow that owns them — the engine's own here, and a pack's below —
  // so both walks are exercised. Stubs: structural inclusion, recency by
  // folder-name date prefix.
  writeAt(root, 'engine/migrations/apply.mjs', 'export const apply = 1;\n');
  writeAt(root, 'engine/migrations/registry.mjs', 'export const registry = 1;\n');
  writeAt(root, 'engine/migrations/2026-01-01-seed/migration.mjs', 'export default {\n  id: "seed",\n  version: 2,\n};\n');
  writeAt(root, 'engine/migrations/2026-01-01-seed/note.test.mjs', 'stub\n'); // a test — excluded
  writeAt(root, 'engine/migrations/2025-06-01-ancient/migration.mjs', 'export default {\n  id: "ancient",\n  version: 1,\n};\n'); // aged out — excluded
  writeAt(root, 'engine/migrations/README.md', 'canon doc\n'); // doc — excluded
  for (const { id, requires = [], skills: skl = [], extraFiles = [], version } of packs) {
    const declaredVersion = version === undefined ? '' : `, version: ${JSON.stringify(version)}`;
    writeAt(root, `packs/${id}/pack.mjs`,
      `export default { id: ${JSON.stringify(id)}, requires: ${JSON.stringify(requires)}${declaredVersion} };\n`);
    // A pack's skills are bundled in its own tree — the one shape (#385).
    for (const name of skl) writeAt(root, `packs/${id}/skills/${name}/SKILL.md`, 'stub\n');
    for (const file of extraFiles) {
      const [name, content] = typeof file === 'string' ? [file, `stub ${file}\n`] : [file.file, file.content];
      writeAt(root, `packs/${id}/${name}`, content);
    }
  }
  return root;
}

const vendorAt = async (root, declared, opts) =>
  (await import(pathToFileURL(join(root, 'vendoring', 'compute-vendor-set.mjs')).href))
    .computeVendorSet(declared, opts);

const FIXTURE = {
  packs: [
    { id: 'alpha', version: 4, skills: ['s1'], extraFiles: [
      'RULES.md', 'check.mjs', 'stubs/wf.yml', 'skills/s1/helper.test.mjs',
      // the pack's own test/ directory: a test, and the non-test material a test needs
      'test/pack.test.mjs', 'test/fixtures/sample.json',
      // a pack's own migration records: one in the window, one aged out
      { file: 'migrations/2026-01-02-alpha-seed/migration.mjs', content: 'export default {\n  id: "alpha-seed",\n  version: 5,\n};\n' },
      { file: 'migrations/2025-06-02-alpha-ancient/migration.mjs', content: 'export default {\n  id: "alpha-ancient",\n  version: 1,\n};\n' },
    ] },
    { id: 'beta', version: 7, requires: ['gamma'] },
    { id: 'gamma', skills: ['s2'] },   // versionless — the shape a member's own local pack has
  ],
};

test('structural set: engine roots + machinery + declared pack + its skills, exact; tests, engine docs, undeclared trees all out', async () => {
  const root = makeCanon(FIXTURE);
  // entry-object form must work like a bare id (packEntryId handles both)
  const { files, errors } = await vendorAt(root, [{ id: 'alpha', config: { k: 1 } }], { today: '2026-01-05' });
  assert.deepEqual(errors, []);
  const expected = [
    'engine/checks/helpers/repo-context.mjs',
    'engine/checks/helpers/module-imports.mjs',
    'engine/checks/helpers/pattern-rules.mjs',
    'engine/checks/helpers/active-migrations.mjs',
    'engine/checks/check_the_world.mjs',
    'engine/hooks/session-start-command.sh',
    'engine/scheduler/executor.md',
    'engine/pack_loader/env-requirements.mjs',
    'engine/pack_loader/generate-rules-index.mjs',
    'engine/pack_loader/pack-registry.mjs',
    'engine/pack_loader/pack-schema.mjs',
    'engine/pack_loader/pack-conventions.mjs',
    'engine/pack_loader/renamed-packs.mjs',
    'engine/pack_loader/mount-skills.mjs',
    'engine/version.mjs',
    'engine/settings-file.mjs',
    'engine/installed-versions.mjs',
    'packs/alpha/RULES.md',
    'packs/alpha/check.mjs',
    'packs/alpha/pack.mjs',
    'packs/alpha/stubs/wf.yml',
    'packs/alpha/skills/s1/SKILL.md',
    'packs/directory.GENERATED.md',
    'engine/migrations/apply.mjs',
    'engine/migrations/registry.mjs',
    'engine/migrations/2026-01-01-seed/migration.mjs',
    'packs/alpha/migrations/2026-01-02-alpha-seed/migration.mjs',
  ].sort();
  assert.deepEqual(files, expected);
  // The owner-decided exclusions, asserted by name so a regression reads clearly:
  assert.ok(!files.some((f) => f.startsWith('canon-only/')), 'a tree nothing declares never vendors');
  assert.ok(!files.some((f) => f.endsWith('README.md') || f.endsWith('DESIGN.md')), 'engine-root docs stay canon-side');
  assert.ok(!files.some((f) => f.includes('.test.mjs') || f.startsWith('engine/test/')), 'tests stay canon-side');
});

test('the set reports the versions it is made of — engine, and each declared pack that has one', async () => {
  const root = makeCanon(FIXTURE);
  const { engineVersion, packVersions } = await vendorAt(root, ['alpha', 'beta', 'gamma'], { today: '2026-01-05' });
  // The engine version comes from the module the set itself vendors, so the number
  // stamped on a member and the code it received can never be from two snapshots.
  const { ENGINE_VERSION } = await import(pathToFileURL(join(root, 'engine', 'version.mjs')).href);
  assert.equal(engineVersion, ENGINE_VERSION);
  // gamma declares no version and gets no entry: absent is how "versionless" is
  // recorded, never a 0 a reader would take for a real version.
  assert.deepEqual(packVersions, { alpha: 4, beta: 7 });
});

test('the operational engine .md whitelist vendors — consumer sessions read them from the mount', async () => {
  const root = makeCanon(FIXTURE);
  const { files } = await vendorAt(root, ['alpha']);
  assert.ok(files.includes('engine/scheduler/executor.md'), 'executor.md must ship — the label-wired routine points at it in the mount');
  assert.ok(!files.includes('engine/scheduler/DESIGN.md'), 'other engine .md (maintainer docs) stay canon-side');
});

test('regression (fleet executor-broken): the REAL canon tree vendors the operational scheduler docs', async () => {
  const { computeVendorSet } = await import('./compute-vendor-set.mjs');
  const { files, errors } = await computeVendorSet(['basics']);
  assert.deepEqual(errors, []);
  assert.ok(files.includes('engine/scheduler/executor.md'), 'the live executor.md must be in the vendor set');
  assert.ok(files.includes('engine/scheduler/deliver-pr.md'),
    'the live deliver-pr.md must be in the vendor set — merged-pr task workers link to it from the mount');
  assert.ok(files.includes('engine/scheduler/queue/instructions.md'),
    'the live queue instructions.md must be in the vendor set — the routine\'s stored prompt points a queue session at it in the mount');
});

// The queue engine is runtime-only: every file under it is read by a scheduler run, an
// executor or the agent session those hand off to, and none of it is
// maintainer reference. So the blanket engine-.md drop must never take anything
// here, whatever a future file is called.
test('regression: the REAL canon tree vendors the WHOLE queue engine, .md included', async () => {
  const { readdirSync } = await import('node:fs');
  const { computeVendorSet } = await import('./compute-vendor-set.mjs');
  const { files } = await computeVendorSet(['basics']);
  // WALKED, not listed: the queue engine has subdirectories now (the engine's own
  // built-in tasks), and a top-level listing would assert the directory name and
  // never look inside it — which is how the request task's `task.md` was dropped by
  // the blanket engine-.md rule while this test stayed green.
  const walk = (url, prefix) => readdirSync(url, { withFileTypes: true }).flatMap((e) => (
    e.isDirectory()
      ? walk(new URL(`${e.name}/`, url), `${prefix}${e.name}/`)
      : (e.name.endsWith('.test.mjs') ? [] : [`${prefix}${e.name}`])));
  const onDisk = walk(new URL('../engine/scheduler/queue/', import.meta.url), '');
  assert.ok(onDisk.length > 0, 'the queue engine directory must exist and be non-empty');
  assert.ok(onDisk.some((n) => n.includes('/')), 'the walk reaches inside the queue engine, not just its top level');
  for (const name of onDisk) {
    assert.ok(files.includes(`engine/scheduler/queue/${name}`),
      `engine/scheduler/queue/${name} is runtime-operational and must vendor — a mount missing it breaks the queue on every member`);
  }
});

test('the full pack directory vendors regardless of declaration — a member sees what it could adopt', async () => {
  const root = makeCanon(FIXTURE);
  const { files, errors } = await vendorAt(root, []);
  assert.deepEqual(errors, []);
  assert.ok(files.includes('packs/directory.GENERATED.md'), 'the pack directory must ship with every mount, declared packs or none');
});

test('a canon tree missing the pack directory is an error, before any write', async () => {
  const root = makeCanon({ ...FIXTURE, packDirectory: false });
  const { errors } = await vendorAt(root, ['alpha']);
  assert.ok(errors.some((e) => e.what.includes('directory.GENERATED.md')),
    'a mount silently missing the catalog would blind every member to what it could adopt — this must abort the converge');
});

test('regression: the REAL canon tree carries the pack directory in every vendor set', async () => {
  const { computeVendorSet } = await import('./compute-vendor-set.mjs');
  const { files, errors } = await computeVendorSet([]);
  assert.deepEqual(errors, []);
  assert.ok(files.includes('packs/directory.GENERATED.md'), 'the live packs/directory.GENERATED.md must be in the vendor set');
});

test('migrations: the applier + registry + RECENT record folders vendor; aged records, README, tests do not', async () => {
  const root = makeCanon(FIXTURE);
  const { files, errors } = await vendorAt(root, ['alpha'], { today: '2026-01-05' });
  assert.deepEqual(errors, []);
  assert.ok(files.includes('engine/migrations/apply.mjs'));
  assert.ok(files.includes('engine/migrations/registry.mjs'));
  assert.ok(files.includes('engine/migrations/2026-01-01-seed/migration.mjs'), 'a record within the window ships');
  assert.ok(files.includes('packs/alpha/migrations/2026-01-02-alpha-seed/migration.mjs'), 'a declared pack\'s own record ships too');
  assert.ok(!files.some((f) => f.startsWith('engine/migrations/2025-06-01-ancient/')), 'a record past the window stays canon-side — fetching decides relevance');
  assert.ok(!files.some((f) => f.startsWith('packs/alpha/migrations/2025-06-02-alpha-ancient/')), 'the window governs a pack\'s records identically');
  assert.ok(!files.includes('engine/migrations/README.md'), 'the migrations README stays canon-side');
  assert.ok(!files.some((f) => f.includes('/migrations/') && f.includes('.test.mjs')), 'migration tests stay canon-side');
});

test('migrations recency is a moving window: the same record ships at first and ages out later', async () => {
  const root = makeCanon(FIXTURE);
  const early = await vendorAt(root, ['alpha'], { today: '2026-01-01' });
  assert.ok(early.files.includes('engine/migrations/2026-01-01-seed/migration.mjs'), 'ships the day it lands');
  const late = await vendorAt(root, ['alpha'], { today: '2026-01-08' });
  assert.ok(!late.files.some((f) => f.startsWith('engine/migrations/2026-01-01-seed/')), 'aged out exactly a window later');
  assert.ok(late.files.includes('engine/migrations/apply.mjs'), 'the machinery still ships regardless');
});

test('a pack .md is payload and vendors even though engine-root .md does not', async () => {
  const root = makeCanon(FIXTURE);
  const { files } = await vendorAt(root, ['alpha']);
  assert.ok(files.includes('packs/alpha/RULES.md'));
  assert.ok(!files.includes('packs/README.md'));
});

test('requires closure pulls the dependency pack (bundled skills included) in', async () => {
  const root = makeCanon(FIXTURE);
  const { files, errors } = await vendorAt(root, ['beta']);
  assert.deepEqual(errors, []);
  assert.ok(files.includes('packs/beta/pack.mjs'));
  assert.ok(files.includes('packs/gamma/pack.mjs'));
  assert.ok(files.includes('packs/gamma/skills/s2/SKILL.md'));
  assert.ok(!files.some((f) => f.startsWith('packs/alpha/')));
});

test('ids naming no canon pack (local packs, typos) are skipped without error', async () => {
  const root = makeCanon(FIXTURE);
  const { files, errors } = await vendorAt(root, ['alpha', 'my-local-pack']);
  assert.deepEqual(errors, []);
  assert.ok(!files.some((f) => f.includes('my-local-pack')));
});

test('a bundled skill\'s tests stay canon-side like any other test', async () => {
  const root = makeCanon(FIXTURE);
  const { files, errors } = await vendorAt(root, ['alpha']);
  assert.deepEqual(errors, []);
  assert.ok(files.includes('packs/alpha/skills/s1/SKILL.md'));
  assert.ok(!files.includes('packs/alpha/skills/s1/helper.test.mjs'));
});

// A pack's whole `test/` directory is dropped, not just the `*.test.mjs` files in it.
// The name is the rule precisely so a fixture, a helper or a golden file a test needs
// stops shipping with it, instead of riding into every member's mount for being one
// filename suffix short of the exclusion.
test('a pack\'s test/ directory is dropped whole — its non-test files included', async () => {
  const root = makeCanon(FIXTURE);
  const { files, errors } = await vendorAt(root, ['alpha']);
  assert.deepEqual(errors, []);
  assert.ok(files.includes('packs/alpha/skills/s1/SKILL.md'));
  assert.deepEqual(files.filter((f) => f.startsWith('packs/alpha/test/')), []);
});

// The same exclusion, asked of the REAL corpus rather than a fixture. A fixture
// spelling the rule cannot notice the day it stops selecting the real tree. Both
// halves are load-bearing: the second asserts the scope is non-empty, so a corpus
// with no pack tests left can never read as "the exclusion works".
test('no canon pack ships its tests — over the real corpus, not a fixture', async () => {
  const { computeVendorSet } = await import(pathToFileURL(join(MOUNT_DIR, 'compute-vendor-set.mjs')));
  const { loadPacks } = await import(pathToFileURL(join(REPO_ROOT, 'engine/pack_loader/pack-registry.mjs')));
  const ids = (await loadPacks()).map((p) => p.id);
  const { files } = await computeVendorSet(ids, { today: '2026-01-01' });
  assert.deepEqual(files.filter((f) => f.endsWith('.test.mjs')), []);
  assert.deepEqual(files.filter((f) => f.split('/').includes('test')), []);

  const packTests = execFileSync('git', ['ls-files', ':(glob)packs/*/test/**'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  assert.ok(packTests.length > 50, `only ${packTests.length} pack test files tracked — this assertion has lost its subject`);
});

// --- the coherence guard: the set must be import-closed ----------------------

test('a vendored module importing a pack the set does not carry is an error, before any write', async () => {
  const root = makeCanon({
    packs: [
      { id: 'consumer', extraFiles: [{ file: 'check.mjs', content: "import { x } from '../undeclared/engine.mjs';\nexport default x;\n" }] },
      { id: 'undeclared', extraFiles: [{ file: 'engine.mjs', content: 'export const x = 1;\n' }] },
    ],
  });
  const { errors } = await vendorAt(root, ['consumer']);
  assert.equal(errors.length, 1);
  assert.match(errors[0].what, /packs\/undeclared\/engine\.mjs/);
  assert.match(errors[0].what, /pack-independence/);
  // Declaring the target pack closes the set and clears the error.
  const declared = await vendorAt(root, ['consumer', 'undeclared']);
  assert.deepEqual(declared.errors, []);
});

test('requires closure keeps a dependency\'s composed set coherent without the consumer naming it', async () => {
  const root = makeCanon({
    packs: [
      { id: 'consumer', requires: ['mechanism'], extraFiles: [{ file: 'check.mjs', content: "import { x } from './data.mjs';\nexport default x;\n" }, { file: 'data.mjs', content: 'export const x = 1;\n' }] },
      { id: 'mechanism', extraFiles: [{ file: 'engine.mjs', content: "import { own } from './support.mjs';\nexport const x = own;\n" }, { file: 'support.mjs', content: 'export const own = 1;\n' }] },
    ],
  });
  const { files, errors } = await vendorAt(root, ['consumer']);
  assert.deepEqual(errors, []);
  assert.ok(files.includes('packs/mechanism/engine.mjs'));
  assert.ok(files.includes('packs/mechanism/support.mjs'));
});

test('an import resolving to no canon file at all is an error (the tree itself is broken)', async () => {
  const root = makeCanon({
    packs: [{ id: 'consumer', extraFiles: [{ file: 'check.mjs', content: "import x from '../ghost/missing.mjs';\nexport default x;\n" }] }],
  });
  const { errors } = await vendorAt(root, ['consumer']);
  assert.equal(errors.length, 1);
  assert.match(errors[0].what, /resolves to no file/);
});

// Regression for the nightly failure that motivated the guard (#349): the
// baseline and product-wiki compose the barriers mechanism, and their vendor
// sets must carry it — now via the requires closure — and be import-closed.
test('real corpus: the composing packs\' vendor sets carry the barriers pack and are import-closed', async () => {
  const { computeVendorSet } = await import('./compute-vendor-set.mjs');
  for (const pack of ['basics', 'product-wiki']) {
    const { files, errors } = await computeVendorSet([pack]);
    assert.deepEqual(errors, [], `${pack}: the vendor set must be coherent`);
    for (const carried of ['packs/barriers/pack.mjs', 'engine/checks/helpers/reference-scanning.mjs', 'packs/barriers/contributed.mjs']) {
      assert.ok(files.includes(carried), `${pack} must vendor ${carried}`);
    }
  }
});

test('fetching is version-gated: an up-to-date repo carries no records, a lagging one carries its gap', async () => {
  const root = makeCanon(FIXTURE);
  const records = (files) => files.filter((f) => /\/migrations\/\d{4}-/.test(f));
  const at = (installed) => vendorAt(root, ['alpha'], { today: '2026-01-05', installed });

  // The engine record takes effect at version 2, alpha's at 5.
  const upToDate = await at({ engineVersion: 2, packVersions: { alpha: 5 } });
  assert.deepEqual(records(upToDate.files), [], 'nothing above what this repo has installed');

  const lagging = await at({ engineVersion: 1, packVersions: { alpha: 4 } });
  assert.deepEqual(records(lagging.files).sort(), [
    'engine/migrations/2026-01-01-seed/migration.mjs',
    'packs/alpha/migrations/2026-01-02-alpha-seed/migration.mjs',
  ], 'exactly the gap — and the aged-out records too, which the date window would have dropped');

  // One flow behind, the other current: each is ranged on its own number.
  const engineOnly = await at({ engineVersion: 1, packVersions: { alpha: 5 } });
  assert.deepEqual(records(engineOnly.files), ['engine/migrations/2026-01-01-seed/migration.mjs']);

  // A record OLDER than the window still ships to a repo below its version — the
  // thing a date window structurally cannot do, and why a dormant member was
  // previously served only by the canon clone.
  const dormant = await at({ engineVersion: 0, packVersions: {} });
  assert.ok(records(dormant.files).includes('engine/migrations/2025-06-01-ancient/migration.mjs'));
});

test('a repo with no version stamp keeps the date window — unknown is answered as unknown', async () => {
  const root = makeCanon(FIXTURE);
  const { files } = await vendorAt(root, ['alpha'], { today: '2026-01-05' });
  const records = files.filter((f) => /\/migrations\/\d{4}-/.test(f)).sort();
  assert.deepEqual(records, [
    'engine/migrations/2026-01-01-seed/migration.mjs',
    'packs/alpha/migrations/2026-01-02-alpha-seed/migration.mjs',
  ], 'the in-window records, exactly as before versions existed');
  // A stamp that carries a date but no versions is the same unknown.
  const pre = await vendorAt(root, ['alpha'], { today: '2026-01-05', installed: { updated: '2026-01-05T00:00:00Z' } });
  assert.deepEqual(pre.files.filter((f) => /\/migrations\/\d{4}-/.test(f)).sort(), records);
});
