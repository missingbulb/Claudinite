import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// This test lives at <repo>/engine-tests/mount/vendor.test.mjs; the modules
// under test live at <repo>/engine/.
const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(dirname(TESTS_DIR));

function writeAt(root, rel, content) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

// A hermetic canon mirroring the real layout: the REAL vendor.mjs with the
// REAL modules it imports (engine/packs/registry.mjs,
// engine/checks/lib/imports.mjs — all self-locate relative to their own file),
// a small engine tree with the things that must be EXCLUDED present (a stray
// in-tree test, engine docs, preferences), and fixture packs/skills — so the
// tests exercise the structural-discovery contract, not the live corpus's
// contents.
function makeCanon({ packs = [], skills = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-vendor-'));
  mkdirSync(join(root, 'engine', 'mount'), { recursive: true });
  mkdirSync(join(root, 'engine', 'packs'), { recursive: true });
  mkdirSync(join(root, 'engine', 'checks', 'lib'), { recursive: true });
  copyFileSync(join(REPO_ROOT, 'engine', 'mount', 'vendor.mjs'), join(root, 'engine', 'mount', 'vendor.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'packs', 'registry.mjs'), join(root, 'engine', 'packs', 'registry.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'checks', 'lib', 'imports.mjs'), join(root, 'engine', 'checks', 'lib', 'imports.mjs'));
  writeAt(root, 'CLAUDE.md', 'index\n');
  // the engine root: real-shaped content plus everything that must stay out
  writeAt(root, 'engine/checks/run.mjs', 'stub\n');
  writeAt(root, 'engine/checks/lib/context.mjs', 'stub\n');
  writeAt(root, 'engine/checks/README.md', 'canon doc\n');
  writeAt(root, 'engine/checks/stray.test.mjs', 'stub\n');
  writeAt(root, 'engine/mount/session-start.sh', 'stub\n');
  writeAt(root, 'engine/mount/DESIGN.md', 'canon doc\n');
  writeAt(root, 'engine/packs/load-active-prose.mjs', 'stub\n');
  writeAt(root, 'engine/packs/env.mjs', 'stub\n');
  writeAt(root, 'engine/packs/README.md', 'canon doc\n');
  writeAt(root, 'engine/skills/registry.mjs', 'stub\n');
  writeAt(root, 'engine/skills/mount-skills.mjs', 'stub\n');
  // content-tree roots and tests: never part of the engine walk
  writeAt(root, 'skills/README.md', 'canon doc\n');
  writeAt(root, 'engine-tests/checks/runner.test.mjs', 'stub\n');
  // per-user content: must never appear in any vendor set
  writeAt(root, 'preferences/owner@example.com.md', 'prefs\n');
  for (const { id, requires = [], skills: skl = [], extraFiles = [] } of packs) {
    writeAt(root, `packs/${id}/pack.mjs`,
      `export default { id: ${JSON.stringify(id)}, requires: ${JSON.stringify(requires)}, skills: ${JSON.stringify(skl)} };\n`);
    for (const file of extraFiles) {
      const [name, content] = typeof file === 'string' ? [file, `stub ${file}\n`] : [file.file, file.content];
      writeAt(root, `packs/${id}/${name}`, content);
    }
  }
  for (const { name, files = ['SKILL.md'] } of skills) {
    for (const file of files) writeAt(root, `skills/${name}/${file}`, 'stub\n');
  }
  return root;
}

const vendorAt = async (root, declared, opts) =>
  (await import(pathToFileURL(join(root, 'engine', 'mount', 'vendor.mjs')).href))
    .computeVendorSet(declared, opts);

const FIXTURE = {
  packs: [
    { id: 'alpha', skills: ['s1'], extraFiles: ['RULES.md', 'check.mjs', 'pack.test.mjs', 'stubs/wf.yml'] },
    { id: 'beta', requires: ['gamma'] },
    { id: 'gamma', skills: ['s2'] },
  ],
  skills: [
    { name: 's1', files: ['SKILL.md', 'helper.test.mjs'] },
    { name: 's2' },
  ],
};

test('structural set: the engine root + declared pack + its skills, exact; tests, engine docs, preferences all out', async () => {
  const root = makeCanon(FIXTURE);
  // entry-object form must work like a bare id (packEntryId handles both)
  const { files, errors } = await vendorAt(root, [{ id: 'alpha', config: { k: 1 } }]);
  assert.deepEqual(errors, []);
  const expected = [
    'CLAUDE.md',
    'engine/checks/lib/context.mjs',
    'engine/checks/lib/imports.mjs',
    'engine/checks/run.mjs',
    'engine/mount/session-start.sh',
    'engine/mount/vendor.mjs',
    'engine/packs/env.mjs',
    'engine/packs/load-active-prose.mjs',
    'engine/packs/registry.mjs',
    'engine/skills/mount-skills.mjs',
    'engine/skills/registry.mjs',
    'packs/alpha/RULES.md',
    'packs/alpha/check.mjs',
    'packs/alpha/pack.mjs',
    'packs/alpha/stubs/wf.yml',
    'skills/s1/SKILL.md',
  ].sort();
  assert.deepEqual(files, expected);
  // The owner-decided exclusions, asserted by name so a regression reads clearly:
  assert.ok(!files.some((f) => f.startsWith('preferences/')), 'per-user preferences must never vendor');
  assert.ok(!files.some((f) => f.endsWith('README.md') || f.endsWith('DESIGN.md')), 'engine docs stay canon-side');
  assert.ok(!files.some((f) => f.includes('.test.mjs') || f.startsWith('engine-tests/')), 'tests stay canon-side');
});

test('a pack .md is payload and vendors even though engine .md does not', async () => {
  const root = makeCanon(FIXTURE);
  const { files } = await vendorAt(root, ['alpha']);
  assert.ok(files.includes('packs/alpha/RULES.md'));
  assert.ok(!files.includes('engine/packs/README.md'));
});

test('requires closure pulls the dependency pack and its skills in', async () => {
  const root = makeCanon(FIXTURE);
  const { files, errors } = await vendorAt(root, ['beta']);
  assert.deepEqual(errors, []);
  assert.ok(files.includes('packs/beta/pack.mjs'));
  assert.ok(files.includes('packs/gamma/pack.mjs'));
  assert.ok(files.includes('skills/s2/SKILL.md'));
  assert.ok(!files.some((f) => f.startsWith('packs/alpha/')));
});

test('ids naming no canon pack (local packs, typos) are skipped without error', async () => {
  const root = makeCanon(FIXTURE);
  const { files, errors } = await vendorAt(root, ['alpha', 'my-local-pack']);
  assert.deepEqual(errors, []);
  assert.ok(!files.some((f) => f.includes('my-local-pack')));
});

test('a pack-required skill missing from the tree is an error; the set still computes', async () => {
  const root = makeCanon({ packs: [{ id: 'delta', skills: ['ghost'] }] });
  const { files, errors } = await vendorAt(root, ['delta']);
  assert.equal(errors.length, 1);
  assert.match(errors[0].what, /"ghost"/);
  assert.match(errors[0].what, /delta/);
  assert.ok(files.includes('packs/delta/pack.mjs'));
});

test('extraSkills adds skills the canon cannot derive (a local pack\'s requirements)', async () => {
  const root = makeCanon(FIXTURE);
  const { files, errors } = await vendorAt(root, ['beta'], { extraSkills: ['s1'] });
  assert.deepEqual(errors, []);
  assert.ok(files.includes('skills/s1/SKILL.md'));
  assert.ok(!files.includes('skills/s1/helper.test.mjs'));
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
  const { computeVendorSet } = await import('../../engine/mount/vendor.mjs');
  for (const pack of ['basics', 'product-wiki']) {
    const { files, errors } = await computeVendorSet([pack]);
    assert.deepEqual(errors, [], `${pack}: the vendor set must be coherent`);
    for (const carried of ['packs/barriers/pack.mjs', 'packs/barriers/engine.mjs', 'packs/barriers/contributed.mjs']) {
      assert.ok(files.includes(carried), `${pack} must vendor ${carried}`);
    }
  }
});
