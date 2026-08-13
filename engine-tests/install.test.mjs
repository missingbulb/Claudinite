import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installPacks, planInstall, unansweredQuestions } from '../updates/install.mjs';
import { terminalFor } from '../updates/terminals.mjs';
import { NEEDS_HUMAN } from '../updates/engine-update.mjs';
import { loadPacks } from '../engine/pack_loader/pack-registry.mjs';
import { validateManifest } from '../engine/pack_loader/pack-schema.mjs';

const MOUNT = join('.claudinite', 'shared');
const makeRepo = (declaration = { packs: [] }) => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-install-'));
  writeFileSync(join(root, '.claudinite-checks.json'), `${JSON.stringify(declaration, null, 2)}\n`);
  mkdirSync(join(root, 'src'), { recursive: true });
  return root;
};
const settingsOf = (root) => JSON.parse(readFileSync(join(root, '.claudinite-checks.json'), 'utf8'));

test('an install refuses a pack the repo already has a version for', async () => {
  const packs = await loadPacks();
  const { install, refused } = planInstall(packs, ['basics'], { packVersions: { basics: 1 } });
  assert.deepEqual(install, []);
  assert.match(refused[0].why, /already installed at version 1 — that is an update, not an install/);
});

test('an install refuses a pack this repo\'s engine is too old for, and an unknown id', async () => {
  const packs = await loadPacks().then((ps) => ps.map((p) => (p.id === 'basics' ? { ...p, minEngineVersion: 99 } : p)));
  const { install, refused } = planInstall(packs, ['basics', 'not-a-pack'], null, { engineVersion: 2 });
  assert.deepEqual(install, []);
  assert.deepEqual(refused.map((r) => r.id).sort(), ['basics', 'not-a-pack']);
  assert.match(refused.find((r) => r.id === 'basics').why, /needs engine 99/);
});

test('an install stamps the latest version and fetches NO migration records', async () => {
  const root = makeRepo();
  const r = await installPacks(root, ['basics'], { selfTestRun: () => 'ok' });
  assert.notEqual(r.status, undefined);

  const packs = await loadPacks();
  const latest = packs.find((p) => p.id === 'basics').version;
  assert.equal(settingsOf(root).claudinite.packVersions.basics, latest, 'the install claims the newest version directly');
  assert.ok(settingsOf(root).packs.includes('basics'), 'and declares the pack it installed');

  // The correctness rule, asserted as an absence: a record assumes the shapes its own
  // era produced, and an empty repo is not one of them.
  const mounted = join(root, MOUNT, 'packs', 'basics');
  assert.ok(existsSync(join(mounted, 'RULES.md')), 'the content is there');
  assert.ok(!existsSync(join(mounted, 'migrations')), 'and not one migration record with it');
  rmSync(root, { recursive: true, force: true });
});

test('an install never runs a record even for a pack that has them', async () => {
  const root = makeRepo();
  const r = await installPacks(root, ['sheepdog'], { dryRun: true });
  assert.equal(r.dryRun, true);
  assert.equal(r.records, 0, 'sheepdog carries records; a fresh install fetches none of them');
  rmSync(root, { recursive: true, force: true });
});

test('unanswered adoption questions end the run the same way a red check does', async () => {
  const packs = await loadPacks();
  const withQuestions = packs.find((p) => p.questions?.length);
  assert.ok(withQuestions, 'the corpus has a pack that interviews');

  // Declared bare — no answers at all.
  assert.ok(unansweredQuestions(packs, [withQuestions.id]).length > 0);
  // …and answered, it asks nothing.
  const answers = Object.fromEntries(withQuestions.questions.map((q) => [q.id, 'answered']));
  assert.deepEqual(unansweredQuestions(packs, [{ id: withQuestions.id, answers }]), []);

  const root = makeRepo();
  const r = await installPacks(root, [withQuestions.id], { selfTestRun: () => 'ok' });
  assert.equal(r.status, NEEDS_HUMAN, 'an interview is one instance of the rule, not a rule of its own');
  assert.match(r.decision.why, /unanswered/);
  // The content still landed and the version is still stamped — what the terminal
  // governs is the merge, not whether the install happened.
  assert.ok(settingsOf(root).claudinite.packVersions[withQuestions.id]);
  rmSync(root, { recursive: true, force: true });
});

test('an install always wants the apply stage — the rules meet the repo for the first time', async () => {
  const root = makeRepo();
  const r = await installPacks(root, ['basics'], { selfTestRun: () => 'ok' });
  assert.equal(r.applyStage.needed, true);
  assert.ok(r.applyStage.packs.includes('basics'));
  rmSync(root, { recursive: true, force: true });
});

test('the requires closure is installed and STAMPED, not just vendored', async () => {
  // The hole this closes: `computeVendorSet` resolves the closure and lays its content
  // down, but only the ids a caller NAMED were stamped. A pack pulled in by another was
  // therefore installed-but-unversioned, so the next update flow read `from: null` and
  // fell back to the landed-date window instead of comparing numbers — the same silent
  // failure the install runner exists to prevent, one level down.
  //
  // Real member stamps already assume this: the canary carries `git-github: 1` without
  // declaring it, pulled in through basics.
  const root = makeRepo();
  const r = await installPacks(root, ['basics'], { selfTestRun: () => 'ok' });
  const stamped = settingsOf(root).claudinite.packVersions;
  const pulled = r.install.map((i) => i.id).filter((id) => id !== 'basics');
  assert.ok(pulled.length, 'basics pulls a closure in — otherwise this test proves nothing');
  for (const id of pulled) {
    assert.equal(typeof stamped[id], 'number', `${id} was vendored but left unversioned`);
  }
  // …and the closure is INSTALLED, not DECLARED: what a repo declares is its own
  // choice, and `requires` is the canon's inference from it.
  assert.deepEqual(settingsOf(root).packs, ['basics'], 'a pulled-in pack is not a declaration the repo made');
  rmSync(root, { recursive: true, force: true });
});

// --- the uniform terminal ------------------------------------------------------

test('needs-human outranks everything, including a repo that would auto-merge', () => {
  const t = terminalFor({ status: NEEDS_HUMAN, detail: 'the tree failed its self-test', decision: { action: 'merge' } });
  assert.equal(t.action, 'needs-human');
  assert.match(t.why, /failed its self-test/);
});

test('the apply stage outranks a merge — landing first would call the repair optional', () => {
  const t = terminalFor({ status: 'ok', applyStage: { needed: true, packs: ['basics'] }, decision: { action: 'merge', why: 'green' } });
  assert.equal(t.action, 'apply-stage');
  assert.deepEqual(t.packs, ['basics']);
});

test('an outcome that decided nothing is not a merge', () => {
  assert.equal(terminalFor({ status: 'ok' }).action, 'needs-human');
  assert.equal(terminalFor(null).action, 'needs-human');
  assert.equal(terminalFor('ok').action, 'needs-human');
});

test('a judged, nothing-pending outcome takes the flow\'s own decision', () => {
  assert.equal(terminalFor({ status: 'ok', decision: { action: 'merge', why: 'green' } }).action, 'merge');
  assert.equal(terminalFor({ status: 'ok', decision: { action: 'keep', why: 'review' } }).action, 'keep');
  assert.equal(terminalFor({ status: 'ok', applyStage: { needed: false }, decision: { action: 'merge', why: 'green' } }).action, 'merge');
  assert.equal(terminalFor({ status: 'ok', decision: { action: 'merge', forced: true, why: 'forced' } }).forced, true);
});

test('the flow surface a FIELDED worker calls stays callable, whatever this ref\'s worker uses', async () => {
  // The asymmetry that makes this its own test: a member's vendored worker is one
  // cycle behind, but the flows it loads come from a FRESH CANON CLONE. So deleting an
  // export here does not deprecate it — it breaks every worker already in the field on
  // its very next run, and no version gate stands between the two.
  //
  // This bit for real. `applyStageBrief` was removed as dead code (nothing consumed
  // the payload key it fed), but every fielded worker still destructures it and calls
  // it on the `apply-stage` path — the path #797 sends EVERY member down. The call
  // throws after the PR is opened, so the update never completes, the mount never
  // refreshes, and the member never receives the worker that would stop calling it.
  //
  // The canary rehearsal cannot cover this: it runs the worker THIS REF SHIPS, by
  // design, so it only ever exercises the new caller. This list is the substitute.
  // An entry leaves it one full cycle after the fleet vendors a worker without the
  // call — not when this repo's own worker stops making it.
  const fielded = {
    'updates/terminals.mjs': ['terminalFor', 'applyStageBrief'],
    'updates/engine-update.mjs': ['engineUpdate'],
    'updates/pack-update.mjs': ['packUpdate'],
  };
  for (const [mod, names] of Object.entries(fielded)) {
    const loaded = await import(`../${mod}`);
    for (const name of names) {
      assert.equal(typeof loaded[name], 'function',
        `${mod} no longer exports ${name} — every fielded worker calling it wedges on its next cycle`);
    }
  }
  // And callable, not merely present: a shim kept as a non-function constant would
  // satisfy a weaker check and still throw at the call site.
  const { applyStageBrief } = await import('../updates/terminals.mjs');
  assert.equal(typeof applyStageBrief({ packs: ['basics'], branch: 'x' }), 'string');
  assert.equal(typeof applyStageBrief(), 'string', 'a fielded caller may pass nothing');
});

test('the compatibility shims carry an EXPIRY, so nobody has to remember them', async () => {
  // A comment saying "remove this once the fleet catches up" is a comment nobody
  // rereads, and a shim kept forever is indistinguishable from a shim that is still
  // needed. So the reminder is a failing test on a stated engine version instead.
  //
  // `applyStageBrief` became unnecessary the moment every member vendored a worker
  // that stops calling it — one full cycle after engine 3. Engine 5 is the deadline:
  // by then either the fleet has long since caught up and the shim goes, or something
  // has gone wrong with the rollout and that is worth discovering deliberately.
  //
  // WHEN THIS FIRES, do not just bump the number. Check a real member's vendored
  // worker for the call, and if it is gone, delete the shim and this test together.
  const { ENGINE_VERSION } = await import('../engine/version.mjs');
  const SHIMS = [{ name: 'applyStageBrief', module: 'updates/terminals.mjs', reviewAt: 5, since: 3 }];
  for (const s of SHIMS) {
    assert.ok(ENGINE_VERSION < s.reviewAt,
      `engine ${ENGINE_VERSION} has passed ${s.reviewAt}: re-check whether ${s.module}'s ${s.name} shim `
      + `(added at engine ${s.since} for one-cycle-behind workers) is still called by any fielded worker. `
      + 'If not, delete the shim, its entry in the fielded-surface test above, and this entry.');
  }
});

test('the apply stage\'s duties live in its task file, and none were dropped with the brief', () => {
  // `applyStageBrief` used to render these into the request payload, where nothing
  // read them and where they duplicated the task file that the dispatch issue links.
  // Retiring it is only safe if every duty it carried still has a home — so this
  // asserts the home, not the wording.
  const task = readFileSync('packs/basics/tasks/update/task.md', 'utf8');
  assert.match(task, /executor routine/, 'the one verification no Action can make');
  assert.match(task, /needs-human/);
  assert.match(task, /\.claudinite\/pending-workflows\//, 'the withheld-workflow lane (#797)');
  assert.match(task, /byte for byte/i, 'a converged workflow is transcribed, never revised');
  assert.match(task, /applyStage\.instructions/, 'what a record asked for is read from the record, on the branch');

  // And the payload must stay identifiers-only: the worker may name the condition,
  // never carry the instructions (engine/scheduler/prework.mjs).
  const worker = readFileSync('packs/basics/tasks/update/worker.mjs', 'utf8');
  assert.ok(!worker.includes('brief:'), 'this ref\'s worker carries no rendered brief — the export survives only for fielded ones');
});

// --- seed ops: run once at install, repo-owned thereafter ----------------------

test('the manifest accepts seedOps and rejects a malformed one', () => {
  const valid = {
    id: 'demo',
    ruleRoutingGuidance: { belongs: 'a b c', excludes: 'd e f' },
  };
  assert.deepEqual(validateManifest({ ...valid, seedOps: [{ template: 'stubs/x.yml', dest: '.github/x.yml' }] }), []);
  assert.deepEqual(validateManifest(valid), [], 'optional — most packs seed nothing');
  for (const bad of [[{ template: 'x' }], [{ dest: 'y' }], ['x'], [null], 'x']) {
    assert.match(validateManifest({ ...valid, seedOps: bad }).map((e) => e.what).join(' '), /"seedOps" is not a valid value/, JSON.stringify(bad));
  }
});

test('an install seeds a declared op, and never overwrites what the repo already has', async () => {
  // Driven through the real install with the pack set injected, because the seed-op
  // path is only reachable through a manifest that declares one and the canon has
  // none yet. The template is a file that really exists in the pack.
  const packs = await loadPacks();
  const patched = packs.map((p) => (p.id === 'basics'
    ? { ...p, seedOps: [{ template: 'RULES.md', dest: 'SEEDED.md' }] }
    : p));

  const root = makeRepo();
  const first = await installPacks(root, ['basics'], { packs: patched, selfTestRun: () => 'ok' });
  assert.deepEqual(first.seeded, ['SEEDED.md']);
  assert.ok(existsSync(join(root, 'SEEDED.md')));

  // The repo owns it from here. Re-seeding into a repo that already has the file —
  // the README-diff class of bug — must not happen even on a fresh install.
  writeFileSync(join(root, 'SEEDED.md'), 'the repo edited this\n');
  const second = makeRepo();
  writeFileSync(join(second, 'SEEDED.md'), 'this repo already had one\n');
  const again = await installPacks(second, ['basics'], { packs: patched, selfTestRun: () => 'ok' });
  assert.deepEqual(again.seeded, [], 'a dest that exists is never overwritten');
  assert.equal(readFileSync(join(second, 'SEEDED.md'), 'utf8'), 'this repo already had one\n');
  assert.equal(readFileSync(join(root, 'SEEDED.md'), 'utf8'), 'the repo edited this\n');
  rmSync(root, { recursive: true, force: true });
  rmSync(second, { recursive: true, force: true });
});

test('an UPDATE never seeds — the run-once guarantee is structural, not a flag', async () => {
  // The hazard the issue names: an install op that re-runs on update rewrites a
  // repo-owned surface. It cannot here, because only this flow reads seedOps — so
  // the assurance is behavioural: a pack update over a seeded, then edited, file
  // leaves it exactly as the repo left it.
  const { packUpdate } = await import('../updates/pack-update.mjs');
  const { applyVendor } = await import('../vendoring/apply-vendor-set.mjs');
  const root = makeRepo({ packs: ['basics'] });
  assert.deepEqual((await applyVendor(root)).errors, []);
  writeFileSync(join(root, 'SEEDED.md'), 'seeded once, then edited by the repo\n');
  const settings = settingsOf(root);
  settings.claudinite.packVersions = { basics: 0 };
  writeFileSync(join(root, '.claudinite-checks.json'), `${JSON.stringify(settings, null, 2)}\n`);

  const r = await packUpdate(root, { fullName: 'o/r', selfTestRun: () => 'ok' });
  assert.equal(r.status, 'ok', r.detail);
  assert.equal(r.seeded, undefined, 'an update has no seeding step at all');
  assert.equal(readFileSync(join(root, 'SEEDED.md'), 'utf8'), 'seeded once, then edited by the repo\n');
  rmSync(root, { recursive: true, force: true });
});
