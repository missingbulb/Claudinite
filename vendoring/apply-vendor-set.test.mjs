import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ENGINE_VERSION } from '../engine/version.mjs';

// This test lives at <repo>/vendoring/apply-vendor.test.mjs.
const MOUNT_DIR = dirname(fileURLToPath(import.meta.url)); // <canon>/vendoring/
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
  mkdirSync(join(root, 'vendoring'), { recursive: true });
  mkdirSync(join(root, 'engine', 'pack_loader'), { recursive: true });
  mkdirSync(join(root, 'engine', 'checks', 'helpers'), { recursive: true });
  mkdirSync(join(root, 'packs'), { recursive: true });
  for (const f of ['apply-vendor-set.mjs', 'compute-vendor-set.mjs']) {
    copyFileSync(join(MOUNT_DIR, f), join(root, 'vendoring', f));
  }
  copyFileSync(join(REPO_ROOT, 'engine', 'pack_loader', 'pack-registry.mjs'), join(root, 'engine', 'pack_loader', 'pack-registry.mjs'));
  // The registry validates every manifest against the spec, so the fake corpus
  // needs the spec module too — it is part of the loader, not an optional extra.
  copyFileSync(join(REPO_ROOT, 'engine', 'pack_loader', 'pack-schema.mjs'), join(root, 'engine', 'pack_loader', 'pack-schema.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'pack_loader', 'pack-conventions.mjs'), join(root, 'engine', 'pack_loader', 'pack-conventions.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'pack_loader', 'renamed-packs.mjs'), join(root, 'engine', 'pack_loader', 'renamed-packs.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'checks', 'helpers', 'module-imports.mjs'), join(root, 'engine', 'checks', 'helpers', 'module-imports.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'checks', 'helpers', 'active-migrations.mjs'), join(root, 'engine', 'checks', 'helpers', 'active-migrations.mjs'));
  // The pattern-check engine the registry reaches for when a pack carries
  // declared-checks.json — a stub here: the fixture packs declare none, but the
  // set's import-closure guard still resolves the registry's reference to it.
  writeAt(root, 'engine/checks/helpers/pattern-rules.mjs', 'stub\n');
  copyFileSync(join(REPO_ROOT, 'engine', 'version.mjs'), join(root, 'engine', 'version.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'remove-tree.mjs'), join(root, 'engine', 'remove-tree.mjs'));
  // Where a member's settings live, and the shape of the versions in them.
  copyFileSync(join(REPO_ROOT, 'engine', 'settings-file.mjs'), join(root, 'engine', 'settings-file.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'installed-versions.mjs'), join(root, 'engine', 'installed-versions.mjs'));
  writeAt(root, 'engine/checks/check_the_world.mjs', 'engine v2\n');
  writeAt(root, 'engine/pack_loader/mount-skills.mjs', 'machinery\n');
  writeAt(root, 'packs/directory.GENERATED.md', 'stub catalog\n');
  writeAt(root, 'packs/alpha/pack.mjs', 'export default { id: "alpha", version: 4 };\n');
  writeAt(root, 'packs/alpha/RULES.md', 'rules\n');
  writeAt(root, 'packs/alpha/skills/s1/SKILL.md', 'skill\n');
  // migrations vendor into the mount (task-code-work §7): applier + registry
  // + records. Stubs — this suite exercises the apply/converge, not the content.
  writeAt(root, 'engine/migrations/apply.mjs', 'export const apply = 1;\n');
  writeAt(root, 'engine/migrations/registry.mjs', 'export const registry = 1;\n');
  writeAt(root, 'engine/migrations/2026-01-01-seed/migration.mjs', 'export default {\n  id: "seed",\n  version: 2,\n};\n');
  return root;
}

function makeTarget(declaration = { packs: ['alpha'] }) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-target-'));
  writeAt(root, '.claudinite-settings.json', JSON.stringify(declaration, null, 2) + '\n');
  writeAt(root, 'src/app.js', 'project code\n');
  writeAt(root, '.claudinite/local_packs/mine/pack.mjs', 'export default { id: "mine" };\n');
  return root;
}

const applyAt = async (canon, target, opts) =>
  (await import(pathToFileURL(join(canon, 'vendoring', 'apply-vendor-set.mjs')).href))
    .applyVendor(target, opts);

test('fresh target: the set lands under .claudinite/shared/ at canon-relative paths; the stamp is written', async () => {
  const canon = makeCanon();
  const target = makeTarget();
  const r = await applyAt(canon, target, { ref: 'abc123' });
  assert.deepEqual(r.errors, []);
  for (const f of ['engine/checks/check_the_world.mjs', 'packs/alpha/RULES.md', 'packs/alpha/skills/s1/SKILL.md']) {
    assert.ok(existsSync(join(target, '.claudinite', 'shared', f)), `missing vendored ${f}`);
  }
  // The versions this mount is made of, and NOTHING about when it was taken: the
  // datetime and the ref that used to sit beside them recorded the last full
  // re-vendor, so both were stale on every nightly-converging member (#1252).
  const settings = JSON.parse(readFileSync(join(target, '.claudinite-settings.json'), 'utf8'));
  assert.equal(settings.claudinite, undefined, 'the retired stamp block must not be written back');
  assert.equal(settings.engineVersion, ENGINE_VERSION);
  assert.deepEqual(settings.packs, [{ id: 'alpha', version: 4 }]); // the version rides on the pack's own entry
});

test('convergence is whole-set: stale files vanish, drift reverts, everything outside shared/ is untouched', async () => {
  const canon = makeCanon();
  const target = makeTarget();
  writeAt(target, '.claudinite/shared/zzz-stale.txt', 'left over from an older snapshot\n');
  writeAt(target, '.claudinite/shared/engine/checks/check_the_world.mjs', 'locally edited\n');
  const r = await applyAt(canon, target);
  assert.deepEqual(r.errors, []);
  assert.ok(!existsSync(join(target, '.claudinite', 'shared', 'zzz-stale.txt')), 'stale file must vanish');
  assert.equal(readFileSync(join(target, '.claudinite', 'shared', 'engine', 'checks', 'check_the_world.mjs'), 'utf8'), 'engine v2\n');
  assert.ok(existsSync(join(target, '.claudinite', 'local_packs', 'mine', 'pack.mjs')), 'local_packs untouched');
  assert.equal(readFileSync(join(target, 'src', 'app.js'), 'utf8'), 'project code\n');
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
  writeFileSync(join(canon, 'engine', 'checks', 'check_the_world.mjs'), 'engine v3\n');
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

// The rewind the guard exists for, named directly rather than through a ref's
// ancestry (#1252): a member holding a pack version this checkout cannot supply.
// Git is not involved at all, which is why the guard now also holds on a rootless
// canon tree — the bootstrap snapshot, where there was never any history to walk.
test('#328: a target holding a version above the checkout is refused (converging would rewind)', async () => {
  const canon = makeCanon();
  const target = makeTarget({ packs: [{ id: 'alpha', version: 9 }] }); // canon carries alpha 4
  const r = await applyAt(canon, target);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].what, /behind what the target already has .* would rewind/);
  assert.ok(!existsSync(join(target, '.claudinite', 'shared')), 'nothing may be written on error');
});

test('#328: a target at or below the checkout converges normally', async () => {
  const canon = makeCanon();
  const target = makeTarget({ packs: [{ id: 'alpha', version: 3 }] });
  const r = await applyAt(canon, target);
  assert.deepEqual(r.errors, []);
  const settings = JSON.parse(readFileSync(join(target, '.claudinite-settings.json'), 'utf8'));
  assert.deepEqual(settings.packs, [{ id: 'alpha', version: 4 }], 'the entry is advanced to what this checkout gave it');
});

test('#328: a canon tree nested in a FOREIGN git repo is rootless — upward .git discovery must not speak for the canon', async () => {
  // A stray copy of apply-vendor-set.mjs running inside a consumer's repo,
  // inside the CONSUMER's repo: git found by upward walk would answer with the
  // consumer's HEAD. The guards must treat that as no-checkout, not as canon truth.
  const outer = mkdtempSync(join(tmpdir(), 'claudinite-outer-'));
  const g = (...args) => execFileSync('git', args, { cwd: outer, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  g('init', '-q');
  g('config', 'user.email', 'test@test');
  g('config', 'user.name', 'test');
  const canon = join(outer, 'nested-canon');
  mkdirSync(join(canon, 'vendoring'), { recursive: true });
  mkdirSync(join(canon, 'engine', 'pack_loader'), { recursive: true });
  mkdirSync(join(canon, 'engine', 'checks', 'helpers'), { recursive: true });
  mkdirSync(join(canon, 'packs'), { recursive: true });
  for (const f of ['apply-vendor-set.mjs', 'compute-vendor-set.mjs']) copyFileSync(join(MOUNT_DIR, f), join(canon, 'vendoring', f));
  copyFileSync(join(REPO_ROOT, 'engine', 'pack_loader', 'pack-registry.mjs'), join(canon, 'engine', 'pack_loader', 'pack-registry.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'pack_loader', 'pack-schema.mjs'), join(canon, 'engine', 'pack_loader', 'pack-schema.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'pack_loader', 'pack-conventions.mjs'), join(canon, 'engine', 'pack_loader', 'pack-conventions.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'pack_loader', 'renamed-packs.mjs'), join(canon, 'engine', 'pack_loader', 'renamed-packs.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'checks', 'helpers', 'module-imports.mjs'), join(canon, 'engine', 'checks', 'helpers', 'module-imports.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'checks', 'helpers', 'active-migrations.mjs'), join(canon, 'engine', 'checks', 'helpers', 'active-migrations.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'version.mjs'), join(canon, 'engine', 'version.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'remove-tree.mjs'), join(canon, 'engine', 'remove-tree.mjs'));
  // Where a member's settings live, and the shape of the versions in them.
  copyFileSync(join(REPO_ROOT, 'engine', 'settings-file.mjs'), join(canon, 'engine', 'settings-file.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'installed-versions.mjs'), join(canon, 'engine', 'installed-versions.mjs'));
  writeAt(canon, 'engine/checks/helpers/pattern-rules.mjs', 'stub\n');
  writeAt(canon, 'engine/checks/check_the_world.mjs', 'engine v2\n');
  writeAt(canon, 'packs/directory.GENERATED.md', 'stub catalog\n');
  writeAt(canon, 'engine/migrations/apply.mjs', 'export const apply = 1;\n');
  writeAt(canon, 'engine/migrations/registry.mjs', 'export const registry = 1;\n');
  writeAt(canon, 'engine/migrations/2026-01-01-seed/migration.mjs', 'export default {\n  id: "seed",\n  version: 2,\n};\n');
  g('add', '-A');
  g('commit', '-q', '-m', 'consumer commit');
  const target = makeTarget({ packs: [] });
  const r = await applyAt(canon, target); // no --ref
  assert.deepEqual(r.errors, []);
  const settings = JSON.parse(readFileSync(join(target, '.claudinite-settings.json'), 'utf8'));
  assert.equal(settings.engineVersion, ENGINE_VERSION, 'a rootless canon still converges — nothing here reads git');
});

test('transactional: errors abort before any write', async () => {
  const canon = makeCanon();
  const noDecl = mkdtempSync(join(tmpdir(), 'claudinite-target-'));
  const r1 = await applyAt(canon, noDecl);
  assert.equal(r1.errors.length, 1);
  assert.match(r1.errors[0].what, /no \.claudinite-settings\.json/);
  assert.ok(!existsSync(join(noDecl, '.claudinite')), 'nothing may be written on error');

  const badJson = mkdtempSync(join(tmpdir(), 'claudinite-target-'));
  writeAt(badJson, '.claudinite-settings.json', '{ not json\n');
  const r2 = await applyAt(canon, badJson);
  assert.equal(r2.errors.length, 1);
  assert.ok(!existsSync(join(badJson, '.claudinite', 'shared')), 'nothing may be written on error');
});

test('the writer fetches records over the TARGET\'s stamp, not the canon\'s idea of recent', async () => {
  // The gate is only real if the writer hands the target's own installed versions
  // to the set. A target already at the record's version must receive none of it —
  // and the same canon, against a target below it, must ship it.
  const canon = makeCanon();
  const record = join('.claudinite', 'shared', 'engine', 'migrations', '2026-01-01-seed', 'migration.mjs');

  const current = makeTarget({ packs: ['alpha'], engineVersion: 2 });
  assert.deepEqual((await applyAt(canon, current)).errors, []);
  assert.ok(!existsSync(join(current, record)), 'an up-to-date target carries no records');

  const behind = makeTarget({ packs: ['alpha'], engineVersion: 1 });
  assert.deepEqual((await applyAt(canon, behind)).errors, []);
  assert.ok(existsSync(join(behind, record)), 'a lagging target carries exactly its gap');
});

test('#768: converging an ALREADY-STAMPED target advances every pack PAST records it never applied', async () => {
  // The hazard behind "an install runs no migrations", stated as a test because the
  // skills document it and documentation of a silent behaviour rots invisibly.
  //
  // `applyVendor` stamps every DECLARED pack at the version this canon ships,
  // unconditionally — it converges the mount, it does not run records. At version
  // zero that is exactly right: there is no older state, so nothing is skipped, and
  // it is why bootstrap may use this writer. Run it over a target that already has a
  // stamp and the same line burns that target's pending records, because
  // `migrationApplies` is `want > have` and the stamp has just been moved to `want`.
  //
  // The damage is PERMANENT, not a missed cycle: nothing ever lowers a stamp, so the
  // record can never apply again. The repo is left claiming a version whose shape it
  // was never migrated into, and the stamp is the only thing that remembers — which
  // is what makes this silent rather than merely wrong.
  const canon = makeCanon();
  const RECORD = 'packs/alpha/migrations/2026-08-13-alpha-shape';
  writeAt(canon, `${RECORD}/migration.mjs`,
    'export default {\n  id: "alpha-shape",\n  landed: "2026-08-13",\n  version: 4,\n};\n');
  // The canon's own predicate, not a reimplementation of it here: the point is that
  // the gate the update flow consults changes its answer across this call.
  const { migrationApplies } = await import(
    pathToFileURL(join(canon, 'engine', 'checks', 'helpers', 'active-migrations.mjs')).href);
  const { installedVersions } = await import(
    pathToFileURL(join(canon, 'engine', 'installed-versions.mjs')).href);
  const settingsOf = (target) => JSON.parse(readFileSync(join(target, '.claudinite-settings.json'), 'utf8'));
  const applies = (target) =>
    migrationApplies(RECORD, { installed: installedVersions(settingsOf(target)), today: '2026-08-14' });

  const target = makeTarget({ packs: [{ id: 'alpha', version: 1 }], engineVersion: ENGINE_VERSION });
  assert.equal(applies(target), true, 'precondition: a target at alpha 1 still needs a record that takes effect at 4');

  assert.deepEqual((await applyAt(canon, target)).errors, []);

  assert.equal(installedVersions(settingsOf(target)).packVersions.alpha, 4,
    'the writer stamps the newest version, records or no records');
  assert.equal(applies(target), false, 'and the record it never applied is now permanently out of range');
});
