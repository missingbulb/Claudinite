import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// This test lives at <repo>/mount/vendor.test.mjs.
const MOUNT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(MOUNT_DIR);

function writeAt(root, rel, content) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

// A hermetic canon mirroring the real layout: the REAL vendor.mjs and the REAL
// packs/registry.mjs it imports (both self-locate relative to their own file),
// a small engine tree with the things that must be EXCLUDED present (tests,
// engine-root docs, preferences), and fixture packs/skills — so the tests
// exercise the structural-discovery contract, not the live corpus's contents.
function makeCanon({ packs = [], skills = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-vendor-'));
  mkdirSync(join(root, 'mount'), { recursive: true });
  mkdirSync(join(root, 'packs'), { recursive: true });
  copyFileSync(join(MOUNT_DIR, 'vendor.mjs'), join(root, 'mount', 'vendor.mjs'));
  copyFileSync(join(REPO_ROOT, 'packs', 'registry.mjs'), join(root, 'packs', 'registry.mjs'));
  writeAt(root, 'CLAUDE.md', 'index\n');
  // engine roots: real-shaped content plus everything that must stay out
  writeAt(root, 'checks/run.mjs', 'stub\n');
  writeAt(root, 'checks/lib/context.mjs', 'stub\n');
  writeAt(root, 'checks/README.md', 'canon doc\n');
  writeAt(root, 'checks/test/runner.test.mjs', 'stub\n');
  writeAt(root, 'mount/session-start.sh', 'stub\n');
  writeAt(root, 'mount/DESIGN.md', 'canon doc\n');
  // machinery roots: top-level .mjs picked up, tests and dirs' docs not
  writeAt(root, 'packs/load-active-prose.mjs', 'stub\n');
  writeAt(root, 'packs/env.mjs', 'stub\n');
  writeAt(root, 'packs/env.test.mjs', 'stub\n');
  writeAt(root, 'packs/README.md', 'canon doc\n');
  writeAt(root, 'skills/registry.mjs', 'stub\n');
  writeAt(root, 'skills/mount-skills.mjs', 'stub\n');
  writeAt(root, 'skills/README.md', 'canon doc\n');
  // per-user content: must never appear in any vendor set
  writeAt(root, 'preferences/owner@example.com.md', 'prefs\n');
  for (const { id, requires = [], skills: skl = [], extraFiles = [] } of packs) {
    writeAt(root, `packs/${id}/pack.mjs`,
      `export default { id: ${JSON.stringify(id)}, requires: ${JSON.stringify(requires)}, skills: ${JSON.stringify(skl)} };\n`);
    for (const file of extraFiles) writeAt(root, `packs/${id}/${file}`, `stub ${file}\n`);
  }
  for (const { name, files = ['SKILL.md'] } of skills) {
    for (const file of files) writeAt(root, `skills/${name}/${file}`, 'stub\n');
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

test('structural set: engine roots + machinery + declared pack + its skills, exact; tests, engine docs, preferences all out', async () => {
  const root = makeCanon(FIXTURE);
  // entry-object form must work like a bare id (packEntryId handles both)
  const { files, errors } = await vendorAt(root, [{ id: 'alpha', config: { k: 1 } }]);
  assert.deepEqual(errors, []);
  const expected = [
    'CLAUDE.md',
    'checks/lib/context.mjs',
    'checks/run.mjs',
    'mount/session-start.sh',
    'mount/vendor.mjs',
    'packs/env.mjs',
    'packs/load-active-prose.mjs',
    'packs/registry.mjs',
    'skills/mount-skills.mjs',
    'skills/registry.mjs',
    'packs/alpha/RULES.md',
    'packs/alpha/check.mjs',
    'packs/alpha/pack.mjs',
    'packs/alpha/stubs/wf.yml',
    'skills/s1/SKILL.md',
  ].sort();
  assert.deepEqual(files, expected);
  // The owner-decided exclusions, asserted by name so a regression reads clearly:
  assert.ok(!files.some((f) => f.startsWith('preferences/')), 'per-user preferences must never vendor');
  assert.ok(!files.some((f) => f.endsWith('README.md') || f.endsWith('DESIGN.md')), 'engine-root docs stay canon-side');
  assert.ok(!files.some((f) => f.includes('.test.mjs') || f.startsWith('checks/test/')), 'tests stay canon-side');
});

test('a pack .md is payload and vendors even though engine-root .md does not', async () => {
  const root = makeCanon(FIXTURE);
  const { files } = await vendorAt(root, ['alpha']);
  assert.ok(files.includes('packs/alpha/RULES.md'));
  assert.ok(!files.includes('packs/README.md'));
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
