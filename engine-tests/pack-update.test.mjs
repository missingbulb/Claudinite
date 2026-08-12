import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packUpdate, planPackUpdates, packRecordsInGap, isPackFile } from '../updates/pack-update.mjs';
import { NEEDS_HUMAN } from '../updates/engine-update.mjs';
import { ENGINE_VERSION } from '../engine/version.mjs';
import { applyVendor } from '../vendoring/apply-vendor-set.mjs';
import { loadPacks } from '../engine/pack_loader/pack-registry.mjs';

// Driven against real member trees and the real pack set, like the engine flow's
// suite: the question a member has is whether THIS canon's packs can be laid down
// on it, and a fixture corpus cannot answer that.
const MOUNT = join('.claudinite', 'shared');

function makeMember(declaration = { packs: ['basics'] }) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-pkgmember-'));
  writeFileSync(join(root, '.claudinite-checks.json'), `${JSON.stringify(declaration, null, 2)}\n`);
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'app.js'), 'project code\n');
  return root;
}
const stampOf = (root) => JSON.parse(readFileSync(join(root, '.claudinite-checks.json'), 'utf8')).claudinite;
const setStamp = (root, patch) => {
  const p = join(root, '.claudinite-checks.json');
  const raw = JSON.parse(readFileSync(p, 'utf8'));
  raw.claudinite = { ...(raw.claudinite ?? {}), ...patch };
  writeFileSync(p, `${JSON.stringify(raw, null, 2)}\n`);
};

test('a pack owns its own directory and nothing else', () => {
  assert.equal(isPackFile('packs/basics/RULES.md', 'basics'), true);
  assert.equal(isPackFile('packs/basics/migrations/2026-01-01-x/migration.mjs', 'basics'), true);
  assert.equal(isPackFile('packs/sheepdog/RULES.md', 'basics'), false);
  assert.equal(isPackFile('engine/selftest.mjs', 'basics'), false, 'the engine tree is the engine flow\'s');
  assert.equal(isPackFile('packs/directory.GENERATED.md', 'basics'), false, 'the catalog is no pack\'s');
});

test('the plan names each declared pack\'s gap, and skips what is not a canon pack', async () => {
  const packs = await loadPacks();
  const plan = planPackUpdates(packs, ['basics', 'local/mine', 'no-such-pack'], { packVersions: { basics: 0 } });
  const ids = plan.map((p) => p.id);
  assert.ok(ids.includes('basics'), 'the declared pack is planned');
  assert.ok(!ids.includes('mine') && !ids.includes('local/mine'), 'a local pack has no version and no update flow');
  assert.ok(!ids.includes('no-such-pack'), 'an id naming no canon pack is skipped, not an error');
  // The requires closure comes with it — resolveDeclaredPacks is what decides that,
  // and the plan must cover every pack the repo will actually be running.
  assert.deepEqual(ids, [...new Set(ids)], 'no pack is planned twice');
  for (const id of ids) assert.ok(packs.some((p) => p.id === id), `${id} is not a canon pack`);
  const basics = plan.find((p) => p.id === 'basics');
  assert.equal(basics.from, 0);
  assert.equal(basics.to, packs.find((p) => p.id === 'basics').version);
  assert.equal(basics.blocked, null);
});

test('an unstamped pack plans from null, not from zero', async () => {
  const packs = await loadPacks();
  const [first] = planPackUpdates(packs, ['basics'], null);
  assert.equal(first.from, null, 'never converged under the versioned scheme is unknown, not version 0');
});

test('minEngineVersion is enforced against the TARGET\'s engine, and names both numbers', async () => {
  const packs = await loadPacks().then((ps) => ps.map((p) => (p.id === 'basics' ? { ...p, minEngineVersion: 99 } : p)));
  const plan = planPackUpdates(packs, ['basics'], { engineVersion: 3, packVersions: {} }, { engineVersion: 3 });
  const basics = plan.find((p) => p.id === 'basics');
  assert.match(basics.blocked, /needs engine 99/);
  assert.match(basics.blocked, /runs engine 3/);
});

test('a blocked pack stops the run before any write — never a guess, never a silent skip', async () => {
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);
  // A repo whose engine predates every pack's minimum: engine 0 against minimum 1.
  setStamp(root, { engineVersion: 0 });
  const before = readFileSync(join(root, MOUNT, 'packs', 'basics', 'RULES.md'), 'utf8');

  const r = await packUpdate(root, { fullName: 'o/r' });
  assert.equal(r.status, NEEDS_HUMAN);
  assert.match(r.detail, /needs engine 1/);
  assert.equal(readFileSync(join(root, MOUNT, 'packs', 'basics', 'RULES.md'), 'utf8'), before);
  rmSync(root, { recursive: true, force: true });
});

test('a real member\'s packs are replaced wholesale and stamped per pack', async () => {
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);
  setStamp(root, { engineVersion: ENGINE_VERSION, packVersions: { basics: 0 } });
  const rules = join(root, MOUNT, 'packs', 'basics', 'RULES.md');
  writeFileSync(rules, 'locally mangled\n');
  writeFileSync(join(root, MOUNT, 'packs', 'basics', 'zzz-stale.mjs'), 'from a pack version that no longer exists\n');

  const r = await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' });
  assert.equal(r.status, 'ok', r.detail);
  assert.notEqual(readFileSync(rules, 'utf8'), 'locally mangled\n', 'drift reverts');
  assert.ok(!existsSync(join(root, MOUNT, 'packs', 'basics', 'zzz-stale.mjs')), 'a dropped file must not survive');
  assert.equal(stampOf(root).packVersions.basics, 1);
  assert.equal(stampOf(root).engineVersion, ENGINE_VERSION, 'the engine\'s stamp is not this flow\'s to move');
  rmSync(root, { recursive: true, force: true });
});

test('the engine half of the mount is left alone — it belongs to the engine flow', async () => {
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);
  setStamp(root, { engineVersion: ENGINE_VERSION, packVersions: { basics: 0 } });
  const engineFile = join(root, MOUNT, 'engine', 'selftest.mjs');
  writeFileSync(engineFile, 'an engine version this flow has no business replacing\n');

  assert.equal((await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' })).status, 'ok');
  assert.equal(readFileSync(engineFile, 'utf8'), 'an engine version this flow has no business replacing\n');
  rmSync(root, { recursive: true, force: true });
});

test('the apply stage is asked for only when a pack version actually moved', async () => {
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);

  // Already current: nothing moved, so no session is spent.
  const current = await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' });
  assert.equal(current.applyStage.needed, false);

  // Rolled back: the pack's rules move over content the canon has never seen.
  setStamp(root, { packVersions: { basics: 0 } });
  const moved = await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' });
  assert.equal(moved.applyStage.needed, true);
  assert.ok(moved.applyStage.packs.includes('basics'));
  rmSync(root, { recursive: true, force: true });
});

test('a red self-test is the same needs-human terminal the engine flow has', async () => {
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);
  setStamp(root, { packVersions: { basics: 0 } });
  const r = await packUpdate(root, { fullName: 'o/r', selfTestRun: () => { throw new Error('broken'); } });
  assert.equal(r.status, NEEDS_HUMAN);
  assert.equal(r.decision.action, 'needs-human');
  rmSync(root, { recursive: true, force: true });
});

test('dry run judges the whole plan and writes nothing', async () => {
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);
  setStamp(root, { packVersions: { basics: 0 } });
  const rules = join(root, MOUNT, 'packs', 'basics', 'RULES.md');
  writeFileSync(rules, 'mangled\n');

  const r = await packUpdate(root, { fullName: 'o/r', dryRun: true });
  assert.equal(r.status, 'ok');
  assert.equal(r.dryRun, true);
  assert.ok(r.files > 0);
  assert.equal(readFileSync(rules, 'utf8'), 'mangled\n');
  assert.equal(stampOf(root).packVersions.basics, 0);
  rmSync(root, { recursive: true, force: true });
});

test('packRecordsInGap is that pack\'s records only', () => {
  const behind = packRecordsInGap('sheepdog', { packVersions: { sheepdog: 0 } });
  assert.ok(behind.every((d) => d.startsWith('packs/sheepdog/migrations/')), behind.join(', '));
  assert.deepEqual(packRecordsInGap('sheepdog', { packVersions: { sheepdog: 99 } }), []);
});
