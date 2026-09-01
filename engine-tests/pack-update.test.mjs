import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, renameSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packUpdate, planPackUpdates, packRecordsInGap, isPackFile, applyStageFor, pendingSchedulerWorkflow, pendingExecutorWorkflow, PENDING_DIR } from '../packs/claudinite-lifecycle/updates/pack-update.mjs';
import { terminalFor } from '../packs/claudinite-lifecycle/updates/terminals.mjs';
import { SCHEDULER_WORKFLOW, EXECUTOR_WORKFLOW } from '../packs/claudinite-tasks/converge-workflows.mjs';
import { NEEDS_HUMAN } from '../packs/claudinite-lifecycle/updates/engine-update.mjs';
import { ENGINE_VERSION } from '../engine/version.mjs';
import { applyVendor } from '../vendoring/apply-vendor-set.mjs';
import { loadPacks } from '../engine/pack_loader/pack-registry.mjs';
import { loadMigrations, applyMaterializations } from '../engine/migrations/registry.mjs';
import { removeTree } from '../engine/remove-tree.mjs';
import { installedVersions, withInstalledVersions } from '../engine/installed-versions.mjs';

// Driven against real member trees and the real pack set, like the engine flow's
// suite: the question a member has is whether THIS canon's packs can be laid down
// on it, and a fixture corpus cannot answer that.
const MOUNT = join('.claudinite', 'shared');

function makeMember(declaration = { packs: ['basics'] }) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-pkgmember-'));
  writeFileSync(join(root, '.claudinite-settings.json'), `${JSON.stringify(declaration, null, 2)}\n`);
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'app.js'), 'project code\n');
  return root;
}
const stampOf = (root) => installedVersions(JSON.parse(readFileSync(join(root, '.claudinite-settings.json'), 'utf8')));
const setStamp = (root, patch) => {
  const p = join(root, '.claudinite-settings.json');
  const raw = JSON.parse(readFileSync(p, 'utf8'));
  Object.assign(raw, withInstalledVersions(raw, patch));
  writeFileSync(p, `${JSON.stringify(raw, null, 2)}\n`);
};

test('a pack owns its own directory and nothing else', () => {
  assert.equal(isPackFile('packs/basics/RULES.md', 'basics'), true);
  assert.equal(isPackFile('packs/basics/migrations/2026-01-01-x/migration.mjs', 'basics'), true);
  assert.equal(isPackFile('packs/claudinite-fleet-sheepdog/RULES.md', 'basics'), false);
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
  // A repo whose engine predates every pack's minimum: engine 0 against whatever
  // floor the packs actually declare, read off the corpus rather than restated
  // here — a floor rises with every engine release the packs are gated behind.
  setStamp(root, { engineVersion: 0 });
  const floor = (await loadPacks()).find((p) => p.id === 'basics').minEngineVersion;
  const before = readFileSync(join(root, MOUNT, 'packs', 'basics', 'RULES.md'), 'utf8');

  const r = await packUpdate(root, { fullName: 'o/r' });
  assert.equal(r.status, NEEDS_HUMAN);
  assert.ok(r.detail.includes(`needs engine ${floor}`), r.detail);
  assert.equal(readFileSync(join(root, MOUNT, 'packs', 'basics', 'RULES.md'), 'utf8'), before);
  removeTree(root);
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
  const latest = (await loadPacks()).find((p) => p.id === 'basics').version;
  assert.equal(stampOf(root).packVersions.basics, latest, 'the stamp is the manifest version, whatever it is now');
  assert.equal(stampOf(root).engineVersion, ENGINE_VERSION, 'the engine\'s stamp is not this flow\'s to move');
  removeTree(root);
});

test('the pack flow converges the CLAUDE.md index, because it is what changed the pack set (#807)', async () => {
  // The engine flow converges the index too, but it runs BEFORE the packs in a cycle
  // — so on the night a pack lands, its copy is already yesterday's. Without this the
  // member would carry a stale index (and fall back to injecting the whole corpus
  // through the hook that #807 showed truncates it) until some later cycle happened
  // to touch the engine.
  const root = makeMember({ packs: ['basics', 'claudinite-growth'] });
  assert.deepEqual((await applyVendor(root)).errors, []);
  setStamp(root, { engineVersion: ENGINE_VERSION, packVersions: { basics: 0, 'claudinite-growth': 0 } });

  assert.equal((await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' })).status, 'ok');
  const index = readFileSync(join(root, '.claudinite', 'claudinite-rules.GENERATED.md'), 'utf8');
  // Every declared pack imported, off the mount this flow just wrote.
  assert.match(index, /@shared\/packs\/basics\/RULES\.md/);
  assert.match(index, /@shared\/packs\/claudinite-growth\/RULES\.md/);
  // And the wiring that makes the file load for anyone.
  const claudeMd = readFileSync(join(root, 'CLAUDE.md'), 'utf8').split('\n');
  assert.ok(claudeMd.some((l) => !l.includes('`') && l.includes('@.claudinite/claudinite-rules.GENERATED.md')), claudeMd.join('\n'));
  assert.match(readFileSync(join(root, '.gitattributes'), 'utf8'), /claudinite-rules\.GENERATED\.md merge=ours/);
  removeTree(root);
});

test('the engine half of the mount is left alone — it belongs to the engine flow', async () => {
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);
  setStamp(root, { engineVersion: ENGINE_VERSION, packVersions: { basics: 0 } });
  const engineFile = join(root, MOUNT, 'engine', 'selftest.mjs');
  writeFileSync(engineFile, 'an engine version this flow has no business replacing\n');

  assert.equal((await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' })).status, 'ok');
  assert.equal(readFileSync(engineFile, 'utf8'), 'an engine version this flow has no business replacing\n');
  removeTree(root);
});

// --- no workflow lane at all (#1317) ------------------------------------------
//
// A member's two workflow files are static after adoption, so no flow computes,
// writes, or stages one. The staging lane that used to carry them is retired; these
// pin the three halves of that being true, because a lane that half-exists — an
// export still answering, a directory still filling — is how a member ends up waiting
// on delivery that nobody is doing.

test('the flow writes no workflow file, and reports none outstanding', async () => {
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);

  const r = await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' });
  assert.deepEqual(r.withheld, [], 'nothing is withheld — there is no lane to withhold into');
  assert.equal(r.wiringError, null, 'and no wiring answer to fail to compute');
  assert.ok(!existsSync(join(root, SCHEDULER_WORKFLOW)), 'the caller cannot push there, and nothing tries');
  assert.ok(!existsSync(join(root, EXECUTOR_WORKFLOW)));
  assert.ok(!existsSync(join(root, PENDING_DIR)), 'and nothing is staged for anyone to deliver');
  assert.equal(r.applyStage.needed, false, 'so the update merges instead of waiting on a session');
  removeTree(root);
});

test('the retired staging directory is swept, whatever an earlier cycle left in it', async () => {
  // A member that converged before the lane was retired still carries staged files.
  // Left alone they read forever as work nobody did, and the apply stage they were
  // waiting for no longer exists.
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);
  mkdirSync(join(root, PENDING_DIR), { recursive: true });
  writeFileSync(join(root, PENDING_DIR, 'claudinite-scheduler.yml'), 'name: stale\n');

  await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' });
  assert.ok(!existsSync(join(root, PENDING_DIR, 'claudinite-scheduler.yml')), 'swept');
  removeTree(root);
});

test('the emptied pending-workflow exports still answer, for a worker too old to know', async () => {
  // A member's update worker is copied once and stale forever, so a name it imports
  // may not vanish under it. `pending: null` is what "nothing to deliver" has always
  // meant to a caller, which is exactly the truth now.
  assert.deepEqual(await pendingSchedulerWorkflow(), { pending: null, error: null });
  assert.deepEqual(await pendingExecutorWorkflow(), { pending: null, error: null });
});

test('a workflow materialization is SKIPPED, never written, by a caller that cannot deliver it (#649)', async () => {
  // The other side of the same branch, and the one that was latent: the pack flow
  // announced `CLAUDINITE_CAN_WITHHOLD_WORKFLOWS` before it had the mechanism, so a
  // record materializing a workflow would have been WRITTEN, staged by `git add -A`,
  // and pushed into GitHub's refusal. Any other caller — an older vendored worker, a
  // hand-run apply, CI — must still refuse, and must SAY so rather than skip silently,
  // because a silent skip reads as "already current".
  const record = (await loadMigrations()).find((m) => m.id === 'workflow-probe-current');
  assert.ok(record, 'the claudinite-canary-repo record is what this test is about');
  const probe = '.github/workflows/claudinite-workflow-probe.yml';
  const writes = [];
  const io = {
    read: async (p) => (p === probe ? 'name: Claudinite workflow probe\n' : null),
    readTemplate: async () => 'fresh template\n',
    write: async (p, c) => writes.push([p, c]),
    env: {},
  };
  const done = await applyMaterializations(record, io);
  assert.deepEqual(writes, [], 'nothing may be written into a tree the caller is about to push');
  assert.equal(done.length, 1);
  assert.match(done[0], /^SKIPPED .*claudinite-workflow-probe\.yml \(workflow file/, 'and the skip is reported, not swallowed');
});

test('a pack version moving does NOT by itself buy a session (#798)', async () => {
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);
  // Start from a member already converged once, so what is measured below is the
  // version bump alone.
  await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' });

  // Already current: nothing to do at all.
  const current = await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' });
  assert.equal(current.applyStage.needed, false);

  // Rolled back to zero — the largest gap a member can have, every declared pack
  // moving at once. The old trigger (`moved.length > 0`) fired on the MOVE, and that
  // was the defect: a wholesale tree replacement is deterministic and idempotent, and
  // no session can improve on it.
  //
  // `basics` now carries a record that DOES ask for a session, so the stage is needed
  // here — which is the better evidence, because it lets the test assert WHY. What
  // must never appear is a stage justified by the version plan: the reason names the
  // record, and the packs in scope are the ones that raised records, not the ones
  // whose numbers moved. The "moved but nothing asked" case is covered purely by
  // `applyStageFor` below, where no live record can drift into the fixture.
  setStamp(root, { packVersions: { basics: 0 } });
  const moved = await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' });
  assert.ok(moved.plan.some((p) => p.from !== p.to), 'the fixture must actually move a version, or it proves nothing');
  if (moved.applyStage.needed) {
    assert.ok(moved.applyStage.records.length, 'a stage with no record behind it is the #798 defect returning');
    for (const dir of moved.applyStage.records) {
      assert.match(dir, /^packs\/[^/]+\/migrations\//, 'only a pack record may summon the stage');
    }
  }
  removeTree(root);
});

test('the records decide the apply stage, and what they say reaches the session', () => {
  // Driven over specs rather than a member tree: the fleet currently carries no pack
  // record declaring a stage, and a test that could only pass while one happened to
  // exist would go quietly vacuous the day it aged out — which is the failure mode
  // that made the canary rehearsal worthless for a day (#768 Phase 5).
  const mechanical = { dir: 'packs/basics/migrations/2026-08-13-rename', id: 'rename' };
  assert.deepEqual(applyStageFor([mechanical]), { needed: false },
    'a deterministic record must be deliverable without an agent');

  const asks = {
    dir: 'packs/claudinite-fleet-sheepdog/migrations/2026-08-13-roster',
    id: 'roster',
    applyStage: { why: 'the roster rules meet each member\'s own tasks', instructions: 'Re-home any task the new roster shape orphans.' },
  };
  const stage = applyStageFor([mechanical, asks]);
  assert.equal(stage.needed, true);
  assert.deepEqual(stage.packs, ['claudinite-fleet-sheepdog'], 'only the pack that RAISED the record is in scope');
  assert.deepEqual(stage.records, ['packs/claudinite-fleet-sheepdog/migrations/2026-08-13-roster']);

  // The record is NAMED, not quoted. Its instructions are on the branch, in the mount
  // the update just vendored; the reason carries an identifier so the session can find
  // them, because a request payload may not carry instructions (code-work.mjs).
  assert.match(stage.why, /packs\/claudinite-fleet-sheepdog\/migrations\/2026-08-13-roster/, 'the session must be able to find the record');
  assert.match(stage.why, /roster rules meet/);
  assert.ok(!stage.why.includes('Re-home any task'), 'the instructions travel through the repo, never the payload');
  assert.equal(terminalFor({ status: 'ok', applyStage: stage, decision: { action: 'merge', why: 'green' } }).why, stage.why);
});

test('two records asking together are one session, and both are named', () => {
  const stage = applyStageFor([
    { dir: 'packs/basics/migrations/2026-08-13-a', id: 'a', applyStage: { why: 'first', instructions: 'Do A.' } },
    { dir: 'packs/basics/migrations/2026-08-13-b', id: 'b', applyStage: { why: 'second' } },
  ]);
  assert.deepEqual(stage.packs, ['basics'], 'one pack, named once');
  assert.deepEqual(stage.records, ['packs/basics/migrations/2026-08-13-a', 'packs/basics/migrations/2026-08-13-b']);
  // Both reasons reach the issue — a session nobody can explain is one nobody trusts.
  assert.match(stage.why, /first/);
  assert.match(stage.why, /second/);
});

test('a red self-test is the same needs-human terminal the engine flow has', async () => {
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);
  setStamp(root, { packVersions: { basics: 0 } });
  const r = await packUpdate(root, { fullName: 'o/r', selfTestRun: () => { throw new Error('broken'); } });
  assert.equal(r.status, NEEDS_HUMAN);
  assert.equal(r.decision.action, 'needs-human');
  removeTree(root);
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
  removeTree(root);
});

test('packRecordsInGap is that pack\'s records only', () => {
  const behind = packRecordsInGap('claudinite-fleet-sheepdog', { packVersions: { 'claudinite-fleet-sheepdog': 0 } });
  assert.ok(behind.every((d) => d.startsWith('packs/claudinite-fleet-sheepdog/migrations/')), behind.join(', '));
  assert.deepEqual(packRecordsInGap('claudinite-fleet-sheepdog', { packVersions: { 'claudinite-fleet-sheepdog': 99 } }), []);
});

// The stamp is written as well as read, and both sides have to agree about a
// renamed pack. Measured on a real member (LaughCounter, #1041): the read side
// canonicalized, the write side spread the raw keys back, and the stamp ended up
// carrying `core: 6` beside `claudinite-lifecycle: 8` — the newer key
// authoritative, the older one permanent, and the rename never finishable.
test('the stamp write drops a legacy pack key rather than carrying it forward', async () => {
  const { canonicalPackVersions } = await import('../engine/pack_loader/renamed-packs.mjs');
  const raw = { basics: 7, core: 6, grow_with_claudinite: 6 };
  const plan = [{ id: 'claudinite-lifecycle', to: 8 }, { id: 'claudinite-growth', to: 7 }];
  // Exactly the expression the flow uses at its stamp step.
  const packVersions = { ...canonicalPackVersions(raw) };
  for (const p of plan) if (p.to !== null) packVersions[p.id] = p.to;
  assert.deepEqual(packVersions, { basics: 7, 'claudinite-lifecycle': 8, 'claudinite-growth': 7 });
  assert.ok(!Object.hasOwn(packVersions, 'core'), 'the old key must not survive the write');
  assert.ok(!Object.hasOwn(packVersions, 'grow_with_claudinite'), 'nor the other one');
});

test('a pack the canon renamed takes its old mount directory with it', async () => {
  // What the sweep is for. Vendoring replaces a tree PER DECLARED ID, and a rename
  // changes the id — so the directory the pack used to be vendored under matches
  // nothing and is never touched again. It does not lie there harmlessly: a mounted
  // pack's own id is canonicalized on load, so the abandoned copy announces the id the
  // live one has, and the member runs two packs of that name, one of them frozen at the
  // content it was renamed from.
  //
  // Driven through a REAL rename (core -> claudinite-lifecycle) rather than a fixture
  // map, because the property worth pinning is that the spellings this corpus actually
  // ships are the ones swept.
  const root = makeMember({ packs: ['basics', 'claudinite-lifecycle'] });
  assert.deepEqual((await applyVendor(root)).errors, []);
  const legacy = join(root, MOUNT, 'packs', 'core');
  mkdirSync(legacy, { recursive: true });
  writeFileSync(join(legacy, 'pack.mjs'), "export default { id: 'core', version: 1 };\n");

  // A gap on the renamed pack and nothing else: version 13 with no record above 1, so
  // this run is the vendor step and only the vendor step.
  setStamp(root, { engineVersion: ENGINE_VERSION, packVersions: { basics: 99, 'claudinite-lifecycle': 12 } });
  await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' });

  assert.ok(!existsSync(legacy), 'the abandoned directory is the second copy of a pack the member already has');
  assert.ok(existsSync(join(root, MOUNT, 'packs', 'claudinite-lifecycle', 'pack.mjs')), 'and the live one is laid down');
  removeTree(root);
});

// #1188: an ABSORBED pack (chrome-extension-release -> chrome-extension, #1057) is a
// different shape in the mount than a rename — the leftover directory sits BESIDE its
// survivor's rather than alone — but `legacySpellingsOf` reads both off the same
// `RENAMED_PACKS` map and sweeps them identically. This pins that the composed rules
// already produce the right answer for the shape that actually froze a fleet (#1186):
// no new migration-record delete op is needed, because a converge that lays down the
// survivor already takes the absorbed leftover with it, the same as a rename's.
test('an absorbed pack takes its own leftover mount directory with it, the same as a rename', async () => {
  // The declaration a member carried before the collapse: the absorbed pack declared
  // explicitly, and its survivor materialized alongside it as its own entry (`via`) —
  // exactly what `resolveDeclaredPacks` writes at adoption time, and what every
  // member still declaring the absorbed spelling actually has on disk.
  const root = makeMember({
    packs: [{ id: 'chrome-extension-release' }, { id: 'chrome-extension', via: ['chrome-extension-release'] }],
  });
  assert.deepEqual((await applyVendor(root)).errors, []);

  // The leftover: a complete, loadable copy of the retired pack, exactly what a
  // member frozen since before the collapse landed still carries (#1186).
  const legacy = join(root, MOUNT, 'packs', 'chrome-extension-release');
  mkdirSync(legacy, { recursive: true });
  writeFileSync(join(legacy, 'pack.mjs'), "export default { id: 'chrome-extension-release', version: 1 };\n");

  setStamp(root, { engineVersion: ENGINE_VERSION, packVersions: { basics: 99, 'chrome-extension': 0 } });
  const r = await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' });

  // The contrast case: the converged tree self-tests clean rather than failing on the
  // duplicate-id collision #1186 describes — the leftover is gone BEFORE discovery
  // ever sees both directories at once.
  assert.equal(r.status, 'ok', r.detail);
  assert.ok(!existsSync(legacy), 'the absorbed pack\'s leftover directory is swept, same as a renamed one');
  assert.ok(existsSync(join(root, MOUNT, 'packs', 'chrome-extension', 'pack.mjs')), 'and the surviving pack is laid down');
  removeTree(root);
});

// RE-OPENING THE WITHHOLD LANE (#1509). #1317 closed it on the premise that "a member's
// workflows are static after adoption"; #1494 falsified that — the executor's
// `CLAUDINITE_VARS` line is a workflow change every member needs. The flow must stage
// such a path rather than drop it, and must ANNOUNCE that it can, or every record
// targeting a workflow file skips itself.
test('the update flow announces it can withhold, and stages a workflow write instead of dropping it', async () => {
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);
  const executor = join(root, EXECUTOR_WORKFLOW);
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
  writeFileSync(executor, 'name: Claudinite executor\n# MARKER\n');

  const staged = join(root, PENDING_DIR, 'claudinite-executor.yml');
  const r = await packUpdate(root, {
    fullName: 'o/r',
    selfTestRun: () => 'ok',
    // The record shape this lane exists for, injected so the assertion is about the
    // FLOW rather than about whichever live record happens to carry a rewrite.
    extraRecords: [{
      id: 'test-workflow-rewrite',
      dir: 'claudinite-tasks/migrations/test-workflow-rewrite',
      rewrite: [{ file: EXECUTOR_WORKFLOW, replace: [{ from: '# MARKER', to: '# REWRITTEN' }] }],
      applyStage: { why: 'a workflow file was withheld and needs delivering' },
    }],
  });

  // The tree the caller is about to push is UNTOUCHED — GitHub rejects the whole ref
  // for a GITHUB_TOKEN push under .github/workflows/, so a write here fails everything.
  assert.equal(readFileSync(executor, 'utf8'), 'name: Claudinite executor\n# MARKER\n',
    'the pushed tree must not carry the workflow edit');
  // …and the content is staged where the apply stage collects it.
  assert.ok(existsSync(staged), `expected the withheld file at ${PENDING_DIR}`);
  assert.match(readFileSync(staged, 'utf8'), /# REWRITTEN/);
  assert.deepEqual(r.withheld, [EXECUTOR_WORKFLOW]);
  assert.equal(r.applyStage.needed, true);
  assert.match(r.applyStage.why, /withheld workflow file/);
});

// THE SWEEP HAZARD. #1317's sweep clears PENDING_DIR unconditionally, on the reasoning
// that nothing stages any more and so everything there is a leftover. Once this run
// stages again, an unscoped sweep deletes what it just wrote — the whole delivery, with
// no error and a green run to show for it.
test('the staging sweep clears stale files without deleting what this run staged', async () => {
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(root, EXECUTOR_WORKFLOW), 'name: Claudinite executor\n# MARKER\n');
  // A leftover from before the lane was retired, naming no workflow this run touches.
  mkdirSync(join(root, PENDING_DIR), { recursive: true });
  writeFileSync(join(root, PENDING_DIR, 'obsolete.yml'), 'left over from an older cycle\n');

  await packUpdate(root, {
    fullName: 'o/r',
    selfTestRun: () => 'ok',
    extraRecords: [{
      id: 'test-workflow-rewrite',
      dir: 'claudinite-tasks/migrations/test-workflow-rewrite',
      rewrite: [{ file: EXECUTOR_WORKFLOW, replace: [{ from: '# MARKER', to: '# REWRITTEN' }] }],
      applyStage: { why: 'a workflow file was withheld and needs delivering' },
    }],
  });

  assert.equal(existsSync(join(root, PENDING_DIR, 'obsolete.yml')), false, 'the stale one goes');
  assert.ok(existsSync(join(root, PENDING_DIR, 'claudinite-executor.yml')), 'this run\'s staging stays');
});

// THE STAMP HAZARD (#1545). A withheld file is delivered by the apply stage, not by
// this run — so when the run stamps the pack anyway, the stamp claims a delivery that
// has not happened. If the PR then merges without the apply stage running,
// `migrationApplies` (`want > have`) puts the record permanently out of range: the
// member is above the version, the record stops vendoring, and the only other copy of
// the content — the staged file — is swept as a leftover by the next cycle. Nothing
// is red at any point. Five members lost the executor's CLAUDINITE_VARS line that way.
test('a pack whose record withheld a file is NOT stamped, so the record still applies next cycle', async () => {
  const root = makeMember({ packs: ['basics', 'claudinite-tasks'] });
  assert.deepEqual((await applyVendor(root)).errors, []);
  // Below canon, so stamping is a real move this run either makes or withholds.
  setStamp(root, { packVersions: { 'claudinite-tasks': '60831.5' } });
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(root, EXECUTOR_WORKFLOW), 'name: Claudinite executor\n# MARKER\n');

  const record = {
    id: 'test-workflow-rewrite',
    dir: 'packs/claudinite-tasks/migrations/test-workflow-rewrite',
    rewrite: [{ file: EXECUTOR_WORKFLOW, replace: [{ from: '# MARKER', to: '# REWRITTEN' }] }],
    applyStage: { why: 'a workflow file was withheld and needs delivering' },
  };
  const r = await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok', extraRecords: [record] });

  assert.deepEqual(r.withheld, [EXECUTOR_WORKFLOW], 'the file was withheld, so the delivery is still owed');
  assert.equal(stampOf(root).packVersions['claudinite-tasks'], '60831.5',
    'stamping claims a delivery the apply stage has not made, and puts the record out of range forever');
  // The other packs this run really did converge are stamped as normal — the hold is
  // scoped to the one pack that owes a file, not to the whole run.
  assert.equal(stampOf(root).packVersions.basics, (await loadPacks()).find((p) => p.id === 'basics').version,
    'a pack with nothing withheld is unaffected');

  // And because the stamp stayed put, a second cycle still stages the delivery rather
  // than sweeping the first one away with no way left to recreate it.
  const again = await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok', extraRecords: [record] });
  assert.deepEqual(again.withheld, [EXECUTOR_WORKFLOW], 'the delivery is re-staged, not lost');
  assert.ok(existsSync(join(root, PENDING_DIR, 'claudinite-executor.yml')), 'and the staged file survives the sweep');
  removeTree(root);
});
