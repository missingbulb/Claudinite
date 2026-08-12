import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { engineUpdate, engineRecordsInGap, isEngineFile, NEEDS_HUMAN } from '../updates/engine-update.mjs';
import { ENGINE_VERSION } from '../engine/version.mjs';
import { applyVendor } from '../vendoring/apply-vendor-set.mjs';
import { SCHEDULER_WORKFLOW } from '../engine/scheduler/converge-wiring.mjs';

// The engine update flow, driven against REAL member trees built by the real vendor
// writer — the thing a member actually holds. A fixture corpus would prove the
// sequencing and say nothing about whether this canon's own engine can be laid down
// on a repo, which is the only question a member has.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MOUNT = join('.claudinite', 'shared');

function makeMember(declaration = { packs: ['basics'] }) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-member-'));
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

test('the engine half is the engine tree plus the catalog nothing else owns', () => {
  assert.equal(isEngineFile('engine/selftest.mjs'), true);
  assert.equal(isEngineFile('packs/directory.GENERATED.md'), true, 'the catalog ships with every mount, so no pack owns it');
  assert.equal(isEngineFile('packs/basics/RULES.md'), false);
  assert.equal(isEngineFile('packs/sheepdog/migrations/2026-08-11-x/migration.mjs'), false, 'a pack\'s records are the pack flow\'s');
});

test('the gap is engine records only, and empties as the repo catches up', () => {
  const behind = engineRecordsInGap({ engineVersion: 0 });
  assert.ok(behind.length > 0, 'a repo below version 1 needs the records that landed at it');
  assert.ok(behind.every((d) => d.startsWith('engine/migrations/')), `a pack record leaked into the engine gap: ${behind}`);
  assert.deepEqual(engineRecordsInGap({ engineVersion: ENGINE_VERSION }), [], 'an up-to-date repo needs none');
});

test('a repo that never adopted is a needs-human terminal, not a crash', async () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-bare-'));
  const r = await engineUpdate(root, { fullName: 'o/r' });
  assert.equal(r.status, NEEDS_HUMAN);
  assert.match(r.detail, /never adopted/);
  rmSync(root, { recursive: true, force: true });
});

test('malformed settings stop the run before anything is written', async () => {
  const root = makeMember();
  writeFileSync(join(root, '.claudinite-checks.json'), '{ not json\n');
  const r = await engineUpdate(root, { fullName: 'o/r' });
  assert.equal(r.status, NEEDS_HUMAN);
  assert.ok(!existsSync(join(root, MOUNT)), 'a refused update writes nothing at all');
  rmSync(root, { recursive: true, force: true });
});

test('an engine record carrying an agentic note stops the run, before any write', async () => {
  // Live, not fixtured: two engine records still carry the notes DESIGN §6 retires,
  // so a repo below version 1 genuinely cannot be served by this flow yet. The
  // invariant is that it says so and writes nothing — never that it skips the note
  // quietly, and never that it half-updates and then stops.
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);
  setStamp(root, { engineVersion: 0 });
  const before = readFileSync(join(root, MOUNT, 'engine', 'selftest.mjs'), 'utf8');
  writeFileSync(join(root, MOUNT, 'engine', 'zzz-canary.mjs'), 'still here if nothing was written\n');

  const r = await engineUpdate(root, { fullName: 'o/r' });
  assert.equal(r.status, NEEDS_HUMAN);
  assert.match(r.detail, /agentic note/);
  assert.match(r.detail, /engine\/migrations\//, 'it names the records, so a human knows which');
  assert.equal(readFileSync(join(root, MOUNT, 'engine', 'selftest.mjs'), 'utf8'), before);
  assert.ok(existsSync(join(root, MOUNT, 'engine', 'zzz-canary.mjs')), 'the mount was not touched');
  assert.equal(stampOf(root).engineVersion, 0, 'and the stamp still says what the repo really runs');
  rmSync(root, { recursive: true, force: true });
});

test('a real member is converged onto this canon\'s engine, and stamped for it', async () => {
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);
  // Something the new engine must overwrite, and something stale it must remove.
  writeFileSync(join(root, MOUNT, 'engine', 'selftest.mjs'), 'locally mangled\n');
  writeFileSync(join(root, MOUNT, 'engine', 'zzz-stale.mjs'), 'from an engine that no longer exists\n');

  const r = await engineUpdate(root, { fullName: 'o/r' });
  assert.equal(r.status, 'ok', r.detail);
  assert.equal(r.to, ENGINE_VERSION);

  assert.equal(
    readFileSync(join(root, MOUNT, 'engine', 'selftest.mjs'), 'utf8'),
    readFileSync(join(ROOT, 'engine', 'selftest.mjs'), 'utf8'),
    'the engine is replaced wholesale, so local drift reverts');
  assert.ok(!existsSync(join(root, MOUNT, 'engine', 'zzz-stale.mjs')), 'a file the new engine dropped must not survive');
  assert.equal(stampOf(root).engineVersion, ENGINE_VERSION);
  assert.equal(readFileSync(join(root, 'src', 'app.js'), 'utf8'), 'project code\n', 'the repo\'s own files are untouched');
  rmSync(root, { recursive: true, force: true });
});

test('the flow never writes a workflow file — the one thing its credential cannot deliver', async () => {
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);
  rmSync(join(root, '.github'), { recursive: true, force: true });

  const r = await engineUpdate(root, { fullName: 'o/r' });
  assert.equal(r.status, 'ok', r.detail);
  assert.ok(!existsSync(join(root, SCHEDULER_WORKFLOW)),
    'the engine flow must leave .github/workflows/ to the pack flow — writing one fails the whole push');
  assert.ok(!r.wiring.includes(SCHEDULER_WORKFLOW));
  // …while the wiring it MAY converge still happened.
  assert.ok(existsSync(join(root, '.claude', 'settings.json')), 'hooks are wiring this flow owns');
  rmSync(root, { recursive: true, force: true });
});

test('the packs half of the mount is left alone — it belongs to the pack flow', async () => {
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);
  const packFile = join(root, MOUNT, 'packs', 'basics', 'RULES.md');
  writeFileSync(packFile, 'a pack version this flow has no business replacing\n');

  assert.equal((await engineUpdate(root, { fullName: 'o/r' })).status, 'ok');
  assert.equal(readFileSync(packFile, 'utf8'), 'a pack version this flow has no business replacing\n');
  rmSync(root, { recursive: true, force: true });
});

test('an up-to-date repo is a clean no-gap run, not a special case', async () => {
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);
  const r = await engineUpdate(root, { fullName: 'o/r' });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.records, [], 'nothing above what it has installed');
  assert.equal(stampOf(root).engineVersion, ENGINE_VERSION);
  rmSync(root, { recursive: true, force: true });
});

test('dry run judges everything and writes nothing', async () => {
  const root = makeMember();
  assert.deepEqual((await applyVendor(root)).errors, []);
  writeFileSync(join(root, MOUNT, 'engine', 'selftest.mjs'), 'mangled\n');

  const r = await engineUpdate(root, { fullName: 'o/r', dryRun: true });
  assert.equal(r.status, 'ok');
  assert.equal(r.dryRun, true);
  assert.ok(r.files > 0, 'it reports what it would lay down');
  assert.equal(readFileSync(join(root, MOUNT, 'engine', 'selftest.mjs'), 'utf8'), 'mangled\n', 'and changed nothing');
  rmSync(root, { recursive: true, force: true });
});
