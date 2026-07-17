import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ENGINE_FILES, ENGINE_DIRS } from './vendor.mjs';

// This test lives at <repo>/mount/vendor.test.mjs.
const MOUNT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(MOUNT_DIR);

// A hermetic canon mirroring the real layout: the REAL vendor.mjs and the REAL
// packs/registry.mjs it imports (both self-locate relative to their own file),
// stub engine files, and fixture packs/skills — so the test exercises the set
// computation's contract without depending on the live corpus's contents.
function makeCanon({ packs = [], skills = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-vendor-'));
  mkdirSync(join(root, 'mount'), { recursive: true });
  mkdirSync(join(root, 'packs'), { recursive: true });
  copyFileSync(join(MOUNT_DIR, 'vendor.mjs'), join(root, 'mount', 'vendor.mjs'));
  copyFileSync(join(REPO_ROOT, 'packs', 'registry.mjs'), join(root, 'packs', 'registry.mjs'));
  for (const file of ENGINE_FILES) {
    const abs = join(root, file);
    mkdirSync(dirname(abs), { recursive: true });
    if (!existsSync(abs)) writeFileSync(abs, `stub ${file}\n`);
  }
  for (const dir of ENGINE_DIRS) mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, 'checks', 'lib', 'context.mjs'), 'stub\n');
  writeFileSync(join(root, 'preferences', 'inject-preferences.sh'), 'stub\n');
  writeFileSync(join(root, 'preferences', 'owner@example.com.md'), 'stub\n');
  for (const { id, requires = [], skills: skl = [], extraFiles = [] } of packs) {
    const dir = join(root, 'packs', id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pack.mjs'),
      `export default { id: ${JSON.stringify(id)}, requires: ${JSON.stringify(requires)}, skills: ${JSON.stringify(skl)} };\n`);
    for (const file of extraFiles) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), `stub ${file}\n`);
    }
  }
  for (const { name, files = ['SKILL.md'] } of skills) {
    const dir = join(root, 'skills', name);
    mkdirSync(dir, { recursive: true });
    for (const file of files) writeFileSync(join(dir, file), 'stub\n');
  }
  return root;
}

const vendorAt = async (root, declared, opts) =>
  (await import(pathToFileURL(join(root, 'mount', 'vendor.mjs')).href))
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

test('declared pack: engine + pack files + its skills + preferences, tests excluded, exact set', async () => {
  const root = makeCanon(FIXTURE);
  // entry-object form must work like a bare id (packEntryId handles both)
  const { files, errors } = await vendorAt(root, [{ id: 'alpha', config: { k: 1 } }]);
  assert.deepEqual(errors, []);
  const expected = [
    ...ENGINE_FILES,
    'checks/lib/context.mjs',
    'preferences/inject-preferences.sh',
    'preferences/owner@example.com.md',
    'packs/alpha/pack.mjs',
    'packs/alpha/RULES.md',
    'packs/alpha/check.mjs',
    'packs/alpha/stubs/wf.yml',
    'skills/s1/SKILL.md',
  ].sort();
  assert.deepEqual(files, expected);
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
