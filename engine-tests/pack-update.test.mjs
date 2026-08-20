import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, renameSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packUpdate, planPackUpdates, packRecordsInGap, isPackFile, applyStageFor, pendingSchedulerWorkflow, pendingExecutorWorkflow, PENDING_DIR } from '../updates/pack-update.mjs';
import { terminalFor } from '../updates/terminals.mjs';
import { SCHEDULER_WORKFLOW, EXECUTOR_WORKFLOW } from '../engine/scheduler/converge-wiring.mjs';
import { NEEDS_HUMAN } from '../updates/engine-update.mjs';
import { ENGINE_VERSION } from '../engine/version.mjs';
import { applyVendor } from '../vendoring/apply-vendor-set.mjs';
import { loadPacks } from '../engine/pack_loader/pack-registry.mjs';
import { loadMigrations, applyMaterializations } from '../engine/migrations/registry.mjs';

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
  const latest = (await loadPacks()).find((p) => p.id === 'basics').version;
  assert.equal(stampOf(root).packVersions.basics, latest, 'the stamp is the manifest version, whatever it is now');
  assert.equal(stampOf(root).engineVersion, ENGINE_VERSION, 'the engine\'s stamp is not this flow\'s to move');
  rmSync(root, { recursive: true, force: true });
});

test('the pack flow converges the CLAUDE.md index, because it is what changed the pack set (#807)', async () => {
  // The engine flow converges the index too, but it runs BEFORE the packs in a cycle
  // — so on the night a pack lands, its copy is already yesterday's. Without this the
  // member would carry a stale index (and fall back to injecting the whole corpus
  // through the hook that #807 showed truncates it) until some later cycle happened
  // to touch the engine.
  const root = makeMember({ packs: ['basics', 'tidy-repo'] });
  assert.deepEqual((await applyVendor(root)).errors, []);
  setStamp(root, { engineVersion: ENGINE_VERSION, packVersions: { basics: 0, 'tidy-repo': 0 } });

  assert.equal((await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' })).status, 'ok');
  const index = readFileSync(join(root, '.claudinite', 'claudinite-rules.GENERATED.md'), 'utf8');
  // Every declared pack imported, off the mount this flow just wrote.
  assert.match(index, /@shared\/packs\/basics\/RULES\.md/);
  assert.match(index, /@shared\/packs\/tidy-repo\/RULES\.md/);
  // And the wiring that makes the file load for anyone.
  const claudeMd = readFileSync(join(root, 'CLAUDE.md'), 'utf8').split('\n');
  assert.ok(claudeMd.some((l) => !l.includes('`') && l.includes('@.claudinite/claudinite-rules.GENERATED.md')), claudeMd.join('\n'));
  assert.match(readFileSync(join(root, '.gitattributes'), 'utf8'), /claudinite-rules\.GENERATED\.md merge=ours/);
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

// Play the apply stage's credential half: move everything staged into place, which is
// all that lane ever does. Used to get a fixture into the state a delivered member is
// in, so the tests after it are about the thing they name.
function deliverStaged(root) {
  const dir = join(root, PENDING_DIR);
  if (!existsSync(dir)) return [];
  const moved = [];
  for (const name of readdirSync(dir)) {
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
    renameSync(join(dir, name), join(root, '.github', 'workflows', name));
    moved.push(name);
  }
  return moved;
}

test('the scheduler workflow is staged for a lane that can push it, and clears once it is (#797)', async () => {
  // The regression this closes: baselining converged this file, Phase 5 retired
  // baselining, and NOTHING replaced it — so every member's wiring froze at whatever
  // baselining last wrote, including the cron minute and the secrets its tasks can see.
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);

  const first = await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' });
  const staged = first.withheld.find((w) => w.path === SCHEDULER_WORKFLOW);
  assert.ok(staged, 'a member with no scheduler workflow is owed one');
  assert.equal(staged.staged, `${PENDING_DIR}claudinite-scheduler.yml`);

  // Withheld means WITHHELD: the destination must be untouched, because the caller's
  // token is refused there and GitHub rejects the whole ref, not just the file.
  assert.ok(!existsSync(join(root, SCHEDULER_WORKFLOW)), 'the flow must not write what its caller cannot push');
  assert.ok(existsSync(join(root, staged.staged)), 'the content rides out on the branch, in the PR diff');
  const content = readFileSync(join(root, staged.staged), 'utf8');
  assert.match(content, /cron:/, 'the staged file is the converged workflow, not a marker');
  assert.equal(first.applyStage.needed, true, 'an undelivered workflow is outstanding work');

  // Delivered — and now the flow must go quiet, or every member sits permanently at
  // `apply-stage` and no update ever merges again.
  // Both files, because a member on the default dispatch is a QUEUE member and the
  // tick without its executor is a generator with no worker (#874).
  assert.deepEqual(deliverStaged(root).sort(), ['claudinite-executor.yml', 'claudinite-scheduler.yml']);
  const second = await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' });
  assert.deepEqual(second.withheld, [], 'a converged workflow is owed nothing');
  assert.equal(second.applyStage.needed, false);
  assert.equal(readFileSync(join(root, SCHEDULER_WORKFLOW), 'utf8'), content, 'and it is left exactly alone');
  assert.ok(!existsSync(join(root, PENDING_DIR, 'claudinite-scheduler.yml')),
    'the staged copy is swept, or it reads forever as work nobody did');
  rmSync(root, { recursive: true, force: true });
});

test('a wiring answer that cannot be computed is REPORTED, never read as converged', async () => {
  // The bug this closes: the first version swallowed every failure to a bare `null`,
  // which is the same answer as "already converged". A member whose settings stopped
  // parsing would have reported a clean update forever while its wiring silently
  // froze — the exact failure #797 exists to end.
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);
  const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : null);

  const healthy = await pendingSchedulerWorkflow(root, 'o/r', read);
  assert.equal(healthy.error, null);
  assert.ok(healthy.pending, 'a member with no scheduler workflow is owed one');

  // No name to hash a cron minute from, and no stub to converge against: both are
  // "cannot answer", and neither may look like "nothing owed".
  for (const [why, call] of [
    ['no repo name', () => pendingSchedulerWorkflow(root, '', read)],
    ['no vendored stub', () => pendingSchedulerWorkflow(root, 'o/r', (p) => (p.includes('stubs/') ? null : read(p)))],
  ]) {
    const r = await call();
    assert.equal(r.pending, null, why);
    assert.ok(r.error, `${why} must be reported, not returned as "already converged"`);
  }

  // …and the report reaches the line a human actually sees. `detail` is what the
  // worker prints, what becomes the PR body, and what becomes the dispatch issue's
  // reason — chosen over a new field because a new field only reaches a member once
  // its worker catches up, a cycle later.
  writeFileSync(join(root, '.claudinite-checks.json'), '{ not json at all\n');
  const broken = await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' });
  if (broken.status !== NEEDS_HUMAN) {
    assert.ok(broken.wiringError, 'the flow must carry the fault');
    assert.match(broken.detail, /but /, 'and say so where it is read');
  }
  rmSync(root, { recursive: true, force: true });
});

test('the staged workflow tracks this repo, not a template', async () => {
  // The two things that make it repo-specific are the two things a frozen file gets
  // wrong: the cron minute is a hash of the full name, so two members do not stampede
  // the same minute, and the env block is the union of every task's required_secrets.
  const a = makeMember();
  const b = makeMember();
  assert.deepEqual((await applyVendor(a)).errors, []);
  assert.deepEqual((await applyVendor(b)).errors, []);
  const of = async (root, fullName) => {
    await packUpdate(root, { fullName, selfTestRun: () => 'ok' });
    return readFileSync(join(root, PENDING_DIR, 'claudinite-scheduler.yml'), 'utf8');
  };
  const cron = (t) => /cron:\s*'([^']*)'/.exec(t)?.[1];
  assert.notEqual(cron(await of(a, 'o/one')), cron(await of(b, 'o/two')), 'two members must not share a minute');
  rmSync(a, { recursive: true, force: true });
  rmSync(b, { recursive: true, force: true });
});

test('a RECORD materializing a workflow is withheld too, not written where the token is refused (#649)', async () => {
  // The gap this closes. The withhold lane had ONE exercised caller — the scheduler
  // workflow's own convergence, two tests up. A record's `materialize` reaches the same
  // `write` from the other side, through `applyMaterializations`, which carries its own
  // branch for a workflow `dest`: unless the caller announces
  // `CLAUDINITE_CAN_WITHHOLD_WORKFLOWS`, the write is REPORTED AS SKIPPED rather than
  // made. Nothing had ever driven that branch with the variable set, and the failure it
  // guards against is not a wrong file — it is the Action's token refusing the push and
  // GitHub rejecting the whole ref, failing the entire converge.
  //
  // Driven through the real claudinite-canary-repo record, not a fixture, because the thing worth
  // pinning is that a record shipped in this corpus travels the lane — a fake record
  // would only prove that `write` can be called.
  const root = makeMember({ packs: ['basics', 'claudinite-canary-repo'] });
  assert.deepEqual((await applyVendor(root)).errors, []);
  const probe = '.github/workflows/claudinite-workflow-probe.yml';

  // A member at pack version 1: seeded copy present (what `seedOps` does at install),
  // stale content, and a real gap for the record at version 2 to close.
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(root, probe), 'name: Claudinite workflow probe\non:\n  workflow_dispatch:\n');
  setStamp(root, { engineVersion: ENGINE_VERSION, packVersions: { basics: 99, 'claudinite-canary-repo': 1 } });

  const first = await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' });
  const staged = first.withheld.find((w) => w.path === probe);
  assert.ok(staged, 'the record materialized a workflow, so the flow owes it through the lane');
  assert.equal(staged.staged, `${PENDING_DIR}claudinite-workflow-probe.yml`);

  // The two halves of "withheld". The destination is untouched — a write there is what
  // takes the whole push down — and the content still rides out on the branch, where a
  // reviewer sees it and the apply stage can find it.
  assert.equal(readFileSync(join(root, probe), 'utf8'), 'name: Claudinite workflow probe\non:\n  workflow_dispatch:\n',
    'the flow must not write what its caller cannot push');
  const template = readFileSync('packs/claudinite-canary-repo/stubs/workflows/claudinite-workflow-probe.yml', 'utf8');
  assert.equal(readFileSync(join(root, staged.staged), 'utf8'), template, 'and the staged copy is the pack template, byte for byte');
  assert.equal(first.applyStage.needed, true, 'an undelivered workflow is outstanding work');

  // Delivered — and the flow must then go quiet, or the member parks at `apply-stage`
  // forever and no update ever merges again.
  assert.ok(deliverStaged(root).includes('claudinite-workflow-probe.yml'));
  const second = await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' });
  assert.ok(!second.withheld.some((w) => w.path === probe), 'a delivered workflow is owed nothing');
  assert.equal(readFileSync(join(root, probe), 'utf8'), template, 'and is left exactly alone');
  assert.ok(!existsSync(join(root, PENDING_DIR, 'claudinite-workflow-probe.yml')),
    'the staged copy is swept, or it reads forever as work nobody did');
  rmSync(root, { recursive: true, force: true });
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
  // Start from a member whose wiring is already delivered, so what is measured below
  // is the version bump alone and not the workflow lane above.
  await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' });
  deliverStaged(root);

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
  rmSync(root, { recursive: true, force: true });
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

test('a withheld workflow needs the stage on its own, and is named by where it is staged', () => {
  // The credential lane, not the judgement lane: no record asked for anything, and
  // the session's whole job is a move it can perform without an opinion.
  const stage = applyStageFor([], [{ path: '.github/workflows/claudinite-scheduler.yml', staged: '.claudinite/pending-workflows/claudinite-scheduler.yml' }]);
  assert.equal(stage.needed, true);
  assert.deepEqual(stage.packs, [], 'nothing asked for a rules pass — do not invent scope for one');
  assert.deepEqual(stage.records, []);
  assert.match(stage.why, /withheld workflow/);
  assert.match(stage.why, /\.claudinite\/pending-workflows\//, 'the session is told where to look, not what to write');
  assert.ok(!stage.why.includes('runs-on'), 'the CONTENT stays on the branch, in the PR diff a human can review');
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
  const behind = packRecordsInGap('claudinite-fleet-sheepdog', { packVersions: { 'claudinite-fleet-sheepdog': 0 } });
  assert.ok(behind.every((d) => d.startsWith('packs/claudinite-fleet-sheepdog/migrations/')), behind.join(', '));
  assert.deepEqual(packRecordsInGap('claudinite-fleet-sheepdog', { packVersions: { 'claudinite-fleet-sheepdog': 99 } }), []);
});

test('a member is owed the executor workflow beside its tick', async () => {
  // The tick and the executor are ONE mechanism in two files: the tick only creates
  // and readies work items, so a member holding the tick without the executor has a
  // generator with no worker — a queue that fills every hour and is never drained,
  // which reads from outside exactly like a repo whose tasks all declined. This lane
  // staged only the scheduler path, so that state was reachable for every member.
  const queue = makeMember();
  assert.deepEqual((await applyVendor(queue)).errors, []);
  const readerFor = (root) => (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : null);

  const owed = await pendingExecutorWorkflow(queue, readerFor(queue));
  assert.equal(owed.error, null);
  assert.ok(owed.pending, 'a member with no executor workflow is owed one');
  assert.equal(owed.pending.path, EXECUTOR_WORKFLOW);

  // Not a template: the env block is the union of every task's required_secrets and
  // each configured endpoint's token secret, which is the whole reason this file
  // cannot simply be vendored like the stub it is built from.
  assert.match(owed.pending.content, /issues:\s*\n\s*types: \[labeled\]/, 'the label-event trigger survives the stamp');

  // An unreadable stub is "cannot answer", never "already converged" — the same
  // distinction the scheduler lane above had to learn.
  const blind = await pendingExecutorWorkflow(queue, (p) => (p.includes('claudinite-executor.yml') ? null : readerFor(queue)(p)));
  assert.equal(blind.pending, null);
  assert.ok(blind.error, 'a missing stub must be reported, not read as converged');

  // …and the whole flow stages it beside the tick, in one cycle, through the same
  // withhold lane — the property the fleet flip actually depends on.
  const run = await packUpdate(queue, { fullName: 'o/r', selfTestRun: () => 'ok' });
  const staged = run.withheld.map((w) => w.path);
  assert.ok(staged.includes(EXECUTOR_WORKFLOW), `the executor workflow is staged: ${staged.join(', ')}`);
  assert.ok(staged.includes(SCHEDULER_WORKFLOW), 'beside the scheduler workflow, in the same cycle');
  rmSync(queue, { recursive: true, force: true });
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
  rmSync(root, { recursive: true, force: true });
});
