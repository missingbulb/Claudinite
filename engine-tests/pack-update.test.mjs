import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, renameSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packUpdate, planPackUpdates, packRecordsInGap, isPackFile, applyStageFor, pendingSchedulerWorkflow, PENDING_DIR } from '../updates/pack-update.mjs';
import { terminalFor } from '../updates/terminals.mjs';
import { SCHEDULER_WORKFLOW } from '../engine/scheduler/converge-wiring.mjs';
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
  assert.deepEqual(deliverStaged(root), ['claudinite-scheduler.yml']);
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
  // moving at once. The old trigger (`moved.length > 0`) fired here, and that is
  // exactly the defect: this is a WHOLESALE TREE REPLACEMENT, deterministic and
  // idempotent, and no session can improve on it. Unless a record in the gap says
  // its change met member-authored content, the update is silent.
  setStamp(root, { packVersions: { basics: 0 } });
  const moved = await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' });
  assert.ok(moved.plan.some((p) => p.from !== p.to), 'the fixture must actually move a version, or it proves nothing');
  assert.equal(moved.applyStage.needed, false, 'a bump with no record asking for a session must not spend one');
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
    dir: 'packs/sheepdog/migrations/2026-08-13-roster',
    id: 'roster',
    applyStage: { why: 'the roster rules meet each member\'s own tasks', instructions: 'Re-home any task the new roster shape orphans.' },
  };
  const stage = applyStageFor([mechanical, asks]);
  assert.equal(stage.needed, true);
  assert.deepEqual(stage.packs, ['sheepdog'], 'only the pack that RAISED the record is in scope');
  assert.deepEqual(stage.records, ['packs/sheepdog/migrations/2026-08-13-roster']);

  // The record is NAMED, not quoted. Its instructions are on the branch, in the mount
  // the update just vendored; the reason carries an identifier so the session can find
  // them, because a request payload may not carry instructions (prework.mjs).
  assert.match(stage.why, /packs\/sheepdog\/migrations\/2026-08-13-roster/, 'the session must be able to find the record');
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
  const behind = packRecordsInGap('sheepdog', { packVersions: { sheepdog: 0 } });
  assert.ok(behind.every((d) => d.startsWith('packs/sheepdog/migrations/')), behind.join(', '));
  assert.deepEqual(packRecordsInGap('sheepdog', { packVersions: { sheepdog: 99 } }), []);
});
