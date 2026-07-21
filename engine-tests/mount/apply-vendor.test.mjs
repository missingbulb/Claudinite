import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// This test lives at <repo>/engine-tests/mount/apply-vendor.test.mjs; the
// modules under test live at <repo>/engine/mount/.
const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(dirname(TESTS_DIR));
const ENGINE_MOUNT = join(REPO_ROOT, 'engine', 'mount');

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
  mkdirSync(join(root, 'engine', 'mount'), { recursive: true });
  mkdirSync(join(root, 'engine', 'packs'), { recursive: true });
  for (const f of ['apply-vendor.mjs', 'vendor.mjs']) {
    copyFileSync(join(ENGINE_MOUNT, f), join(root, 'engine', 'mount', f));
  }
  copyFileSync(join(REPO_ROOT, 'engine', 'packs', 'registry.mjs'), join(root, 'engine', 'packs', 'registry.mjs'));
  mkdirSync(join(root, 'engine', 'checks', 'lib'), { recursive: true });
  copyFileSync(join(REPO_ROOT, 'engine', 'checks', 'lib', 'imports.mjs'), join(root, 'engine', 'checks', 'lib', 'imports.mjs'));
  writeAt(root, 'CLAUDE.md', 'index\n');
  writeAt(root, 'engine/checks/run.mjs', 'engine v2\n');
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
  (await import(pathToFileURL(join(canon, 'engine', 'mount', 'apply-vendor.mjs')).href))
    .applyVendor(target, opts);

test('fresh target: the set lands under .claudinite/shared/ at canon-relative paths; the stamp is written', async () => {
  const canon = makeCanon();
  const target = makeTarget();
  const r = await applyAt(canon, target, { ref: 'abc123' });
  assert.deepEqual(r.errors, []);
  for (const f of ['CLAUDE.md', 'engine/checks/run.mjs', 'packs/alpha/RULES.md', 'skills/s1/SKILL.md', 'engine/mount/vendor.mjs']) {
    assert.ok(existsSync(join(target, '.claudinite', 'shared', f)), `missing vendored ${f}`);
  }
  const settings = JSON.parse(readFileSync(join(target, '.claudinite-checks.json'), 'utf8'));
  assert.match(settings.claudinite.updated, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  assert.equal(settings.claudinite.ref, 'abc123');
  assert.deepEqual(settings.packs, ['alpha']); // the declaration itself is untouched
});

test('convergence is whole-set: stale files vanish, drift reverts, everything outside shared/ is untouched', async () => {
  const canon = makeCanon();
  const target = makeTarget();
  writeAt(target, '.claudinite/shared/zzz-stale.txt', 'left over from an older snapshot\n');
  writeAt(target, '.claudinite/shared/engine/checks/run.mjs', 'locally edited\n');
  const r = await applyAt(canon, target);
  assert.deepEqual(r.errors, []);
  assert.ok(!existsSync(join(target, '.claudinite', 'shared', 'zzz-stale.txt')), 'stale file must vanish');
  assert.equal(readFileSync(join(target, '.claudinite', 'shared', 'engine', 'checks', 'run.mjs'), 'utf8'), 'engine v2\n');
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

// Turn a canon fixture into a git checkout with two commits; returns their shas
// (oldest first). Used by the #328 rewind-guard tests — a canon root WITHOUT git
// metadata (the fixtures above) skips the guards, which the earlier tests
// already exercise by passing an arbitrary --ref.
function gitify(canon) {
  const g = (...args) => execFileSync('git', args, { cwd: canon, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  g('init', '-q');
  g('config', 'user.email', 'test@test');
  g('config', 'user.name', 'test');
  g('add', '-A');
  g('commit', '-q', '-m', 'c1');
  const c1 = g('rev-parse', 'HEAD');
  writeFileSync(join(canon, 'engine', 'checks', 'run.mjs'), 'engine v3\n');
  g('add', '-A');
  g('commit', '-q', '-m', 'c2');
  const c2 = g('rev-parse', 'HEAD');
  return [c1, c2];
}

test('#328: a --ref that mismatches the checkout HEAD is refused before any write', async () => {
  const canon = makeCanon();
  const [c1] = gitify(canon);
  const target = makeTarget();
  const r = await applyAt(canon, target, { ref: c1 }); // HEAD is c2
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].what, /does not match this canon checkout's HEAD/);
  assert.ok(!existsSync(join(target, '.claudinite', 'shared')), 'nothing may be written on error');
});

test('#328: a target stamped ahead of the checkout is refused (converging would rewind)', async () => {
  const canon = makeCanon();
  const [c1, c2] = gitify(canon);
  execFileSync('git', ['checkout', '-q', c1], { cwd: canon }); // a stale checkout
  const target = makeTarget({ packs: ['alpha'], claudinite: { updated: '2026-01-01T00:00:00Z', ref: c2 } });
  const r = await applyAt(canon, target);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].what, /not an ancestor .* would rewind/);
  assert.ok(!existsSync(join(target, '.claudinite', 'shared')), 'nothing may be written on error');
});

test('#328: an ancestor stamp converges normally, and the stamp ref defaults to the checkout HEAD', async () => {
  const canon = makeCanon();
  const [c1, c2] = gitify(canon);
  const target = makeTarget({ packs: ['alpha'], claudinite: { updated: '2026-01-01T00:00:00Z', ref: c1 } });
  const r = await applyAt(canon, target); // no --ref: derived from HEAD
  assert.deepEqual(r.errors, []);
  const settings = JSON.parse(readFileSync(join(target, '.claudinite-checks.json'), 'utf8'));
  assert.equal(settings.claudinite.ref, c2);
});

test('#328: a canon tree nested in a FOREIGN git repo is rootless — upward .git discovery must not speak for the canon', async () => {
  // The vendored copy of apply-vendor.mjs runs at <consumer>/.claudinite/shared/engine/mount/,
  // inside the CONSUMER's repo: git found by upward walk would answer with the
  // consumer's HEAD. The guards must treat that as no-checkout, not as canon truth.
  const outer = mkdtempSync(join(tmpdir(), 'claudinite-outer-'));
  const g = (...args) => execFileSync('git', args, { cwd: outer, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  g('init', '-q');
  g('config', 'user.email', 'test@test');
  g('config', 'user.name', 'test');
  const canon = join(outer, 'nested-canon');
  mkdirSync(join(canon, 'engine', 'mount'), { recursive: true });
  mkdirSync(join(canon, 'engine', 'packs'), { recursive: true });
  for (const f of ['apply-vendor.mjs', 'vendor.mjs']) copyFileSync(join(ENGINE_MOUNT, f), join(canon, 'engine', 'mount', f));
  copyFileSync(join(REPO_ROOT, 'engine', 'packs', 'registry.mjs'), join(canon, 'engine', 'packs', 'registry.mjs'));
  mkdirSync(join(canon, 'engine', 'checks', 'lib'), { recursive: true });
  copyFileSync(join(REPO_ROOT, 'engine', 'checks', 'lib', 'imports.mjs'), join(canon, 'engine', 'checks', 'lib', 'imports.mjs'));
  writeAt(canon, 'CLAUDE.md', 'index\n');
  writeAt(canon, 'engine/checks/run.mjs', 'engine v2\n');
  writeAt(canon, 'skills/s1/SKILL.md', 'skill\n');
  g('add', '-A');
  g('commit', '-q', '-m', 'consumer commit');
  const target = makeTarget({ packs: [] });
  const r = await applyAt(canon, target); // no --ref
  assert.deepEqual(r.errors, []);
  const settings = JSON.parse(readFileSync(join(target, '.claudinite-checks.json'), 'utf8'));
  assert.equal(settings.claudinite.ref, undefined, 'the outer repo’s HEAD must never be stamped as canon provenance');
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
