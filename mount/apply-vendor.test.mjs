import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// This test lives at <repo>/mount/apply-vendor.test.mjs.
const MOUNT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(MOUNT_DIR);

function writeAt(root, rel, content) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

// A hermetic canon (the REAL apply-vendor/vendor/registry modules + a tiny
// engine tree and one fixture pack) and a hermetic consumer target — so the
// tests exercise the writer's contract: whole-set convergence under
// .claudinite/shared/, the stamp, and the touch-nothing-else guarantee.
function makeCanon() {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-canon-'));
  mkdirSync(join(root, 'mount'), { recursive: true });
  mkdirSync(join(root, 'packs'), { recursive: true });
  for (const f of ['apply-vendor.mjs', 'vendor.mjs']) {
    copyFileSync(join(MOUNT_DIR, f), join(root, 'mount', f));
  }
  copyFileSync(join(REPO_ROOT, 'packs', 'registry.mjs'), join(root, 'packs', 'registry.mjs'));
  writeAt(root, 'CLAUDE.md', 'index\n');
  writeAt(root, 'checks/run.mjs', 'engine v2\n');
  writeAt(root, 'skills/s1/SKILL.md', 'skill\n');
  writeAt(root, 'packs/alpha/pack.mjs', 'export default { id: "alpha", skills: ["s1"] };\n');
  writeAt(root, 'packs/alpha/RULES.md', 'rules\n');
  return root;
}

function makeTarget(declaration = { packs: ['alpha'] }) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-target-'));
  writeAt(root, '.claudinite-checks.json', JSON.stringify(declaration, null, 2) + '\n');
  writeAt(root, 'src/app.js', 'project code\n');
  writeAt(root, '.claudinite/local_packs/mine/pack.mjs', 'export default { id: "mine" };\n');
  return root;
}

const applyAt = async (canon, target, opts) =>
  (await import(pathToFileURL(join(canon, 'mount', 'apply-vendor.mjs')).href))
    .applyVendor(target, opts);

test('fresh target: the set lands under .claudinite/shared/ at canon-relative paths; the stamp is written', async () => {
  const canon = makeCanon();
  const target = makeTarget();
  const r = await applyAt(canon, target, { ref: 'abc123' });
  assert.deepEqual(r.errors, []);
  for (const f of ['CLAUDE.md', 'checks/run.mjs', 'packs/alpha/RULES.md', 'skills/s1/SKILL.md', 'mount/vendor.mjs']) {
    assert.ok(existsSync(join(target, '.claudinite', 'shared', f)), `missing vendored ${f}`);
  }
  const settings = JSON.parse(readFileSync(join(target, '.claudinite-checks.json'), 'utf8'));
  assert.match(settings.claudinite.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(settings.claudinite.ref, 'abc123');
  assert.deepEqual(settings.packs, ['alpha']); // the declaration itself is untouched
});

test('convergence is whole-set: stale files vanish, drift reverts, everything outside shared/ is untouched', async () => {
  const canon = makeCanon();
  const target = makeTarget();
  writeAt(target, '.claudinite/shared/zzz-stale.txt', 'left over from an older snapshot\n');
  writeAt(target, '.claudinite/shared/checks/run.mjs', 'locally edited\n');
  const r = await applyAt(canon, target);
  assert.deepEqual(r.errors, []);
  assert.ok(!existsSync(join(target, '.claudinite', 'shared', 'zzz-stale.txt')), 'stale file must vanish');
  assert.equal(readFileSync(join(target, '.claudinite', 'shared', 'checks', 'run.mjs'), 'utf8'), 'engine v2\n');
  assert.ok(existsSync(join(target, '.claudinite', 'local_packs', 'mine', 'pack.mjs')), 'local_packs untouched');
  assert.equal(readFileSync(join(target, 'src', 'app.js'), 'utf8'), 'project code\n');
});

test('a local pack pulling a canon skill vendors it via extraSkills; local-only skill names are ignored', async () => {
  const canon = makeCanon();
  const target = makeTarget({ packs: [] }); // no canon pack declared at all
  writeAt(target, '.claudinite/local_packs/mine/pack.mjs',
    'export default { id: "mine", skills: ["s1", "only-local-skill"] };\n');
  const r = await applyAt(canon, target);
  assert.deepEqual(r.errors, []);
  assert.ok(existsSync(join(target, '.claudinite', 'shared', 'skills', 's1', 'SKILL.md')));
});

test('transactional: errors abort before any write', async () => {
  const canon = makeCanon();
  const noDecl = mkdtempSync(join(tmpdir(), 'claudinite-target-'));
  const r1 = await applyAt(canon, noDecl);
  assert.equal(r1.errors.length, 1);
  assert.match(r1.errors[0].what, /no \.claudinite-checks\.json/);
  assert.ok(!existsSync(join(noDecl, '.claudinite')), 'nothing may be written on error');

  const badJson = mkdtempSync(join(tmpdir(), 'claudinite-target-'));
  writeAt(badJson, '.claudinite-checks.json', '{ not json\n');
  const r2 = await applyAt(canon, badJson);
  assert.equal(r2.errors.length, 1);
  assert.ok(!existsSync(join(badJson, '.claudinite', 'shared')), 'nothing may be written on error');
});
