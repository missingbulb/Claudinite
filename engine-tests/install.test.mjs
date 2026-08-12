import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installPacks, planInstall, unansweredQuestions } from '../updates/install.mjs';
import { terminalFor, applyStageBrief } from '../updates/terminals.mjs';
import { NEEDS_HUMAN } from '../updates/engine-update.mjs';
import { loadPacks } from '../engine/pack_loader/pack-registry.mjs';

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
  assert.deepEqual(r.applyStage.packs, ['basics']);
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

test('the apply-stage brief scopes the session and re-homes the executor verification', () => {
  const brief = applyStageBrief({ packs: ['basics', 'sheepdog'], branch: 'claudinite/update-1' });
  assert.match(brief, /basics, sheepdog/);
  assert.match(brief, /claudinite\/update-1/);
  assert.match(brief, /executor routine/, 'the one verification no Action can make');
  assert.match(brief, /needs-human/);
});
