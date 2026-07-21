import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
// that must be EXCLUDED present (tests, engine-root docs, preferences), and
// fixture packs/skills — so the tests exercise the structural-discovery
// contract, not the live corpus's contents.
function makeCanon({ packs = [], skills = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-vendor-'));
  mkdirSync(join(root, 'vendoring'), { recursive: true });
  mkdirSync(join(root, 'engine', 'pack_loader'), { recursive: true });
  mkdirSync(join(root, 'engine', 'checks', 'helpers'), { recursive: true });
  mkdirSync(join(root, 'packs'), { recursive: true });
  copyFileSync(join(MOUNT_DIR, 'compute-vendor-set.mjs'), join(root, 'vendoring', 'compute-vendor-set.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'pack_loader', 'pack-registry.mjs'), join(root, 'engine', 'pack_loader', 'pack-registry.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'checks', 'helpers', 'module-imports.mjs'), join(root, 'engine', 'checks', 'helpers', 'module-imports.mjs'));
  // engine roots: real-shaped content plus everything that must stay out
  writeAt(root, 'engine/checks/check_the_world.mjs', 'stub\n');
  writeAt(root, 'engine/checks/helpers/repo-context.mjs', 'stub\n');
  writeAt(root, 'engine/checks/README.md', 'canon doc\n');
  writeAt(root, 'engine/test/runner.test.mjs', 'stub\n');
  writeAt(root, 'engine/hooks/session-start-command.sh', 'stub\n');
  writeAt(root, 'vendoring/DESIGN.md', 'canon doc\n');
  // machinery roots: top-level .mjs picked up, tests and dirs' docs not
  writeAt(root, 'engine/pack_loader/inject-pack-prose.mjs', 'stub\n');
  writeAt(root, 'engine/pack_loader/env-requirements.mjs', 'stub\n');
  writeAt(root, 'packs/env.test.mjs', 'stub\n');
  writeAt(root, 'packs/README.md', 'canon doc\n');
  writeAt(root, 'engine/pack_loader/mount-skills.mjs', 'stub\n');
  writeAt(root, 'skills/README.md', 'canon doc\n');
  // per-user content: must never appear in any vendor set
  writeAt(root, 'preferences/owner@example.com.md', 'prefs\n');
  for (const { id, requires = [], skills: skl = [], extraFiles = [] } of packs) {
    writeAt(root, `packs/${id}/pack.mjs`,
      `export default { id: ${JSON.stringify(id)}, requires: ${JSON.stringify(requires)} };\n`);
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
    { id: 'alpha', skills: ['s1'], extraFiles: ['RULES.md', 'check.mjs', 'pack.test.mjs', 'stubs/wf.yml', 'skills/s1/helper.test.mjs'] },
    { id: 'beta', requires: ['gamma'] },
    { id: 'gamma', skills: ['s2'] },
  ],
};

test('structural set: engine roots + machinery + declared pack + its skills, exact; tests, engine docs, preferences all out', async () => {
  const root = makeCanon(FIXTURE);
  // entry-object form must work like a bare id (packEntryId handles both)
  const { files, errors } = await vendorAt(root, [{ id: 'alpha', config: { k: 1 } }]);
  assert.deepEqual(errors, []);
  const expected = [
    'engine/checks/helpers/repo-context.mjs',
    'engine/checks/helpers/module-imports.mjs',
    'engine/checks/check_the_world.mjs',
    'engine/hooks/session-start-command.sh',
    'engine/pack_loader/env-requirements.mjs',
    'engine/pack_loader/inject-pack-prose.mjs',
    'engine/pack_loader/pack-registry.mjs',
    'engine/pack_loader/mount-skills.mjs',
    'packs/alpha/RULES.md',
    'packs/alpha/check.mjs',
    'packs/alpha/pack.mjs',
    'packs/alpha/stubs/wf.yml',
    'packs/alpha/skills/s1/SKILL.md',
  ].sort();
  assert.deepEqual(files, expected);
  // The owner-decided exclusions, asserted by name so a regression reads clearly:
  assert.ok(!files.some((f) => f.startsWith('preferences/')), 'per-user preferences must never vendor');
  assert.ok(!files.some((f) => f.endsWith('README.md') || f.endsWith('DESIGN.md')), 'engine-root docs stay canon-side');
  assert.ok(!files.some((f) => f.includes('.test.mjs') || f.startsWith('engine/test/')), 'tests stay canon-side');
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
    for (const carried of ['packs/barriers/pack.mjs', 'packs/barriers/engine.mjs', 'packs/barriers/contributed.mjs']) {
      assert.ok(files.includes(carried), `${pack} must vendor ${carried}`);
    }
  }
});
