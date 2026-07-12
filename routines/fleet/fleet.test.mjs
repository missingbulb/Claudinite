import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fullSweepBucket, isFullSweepDay } from './schedule.mjs';
import { packTasks, assembleForRepo, loadFleetTasks } from './registry.mjs';
import { planRepo } from './gates.mjs';
import baselining from './tasks/baselining.mjs';
import extract from './tasks/growth-extract-new-instructions.mjs';
import dedup from './tasks/growth-dedup-local-instructions.mjs';

const REPO = { fullName: 'owner/foo', defaultBranch: 'main' };
// A signal bundle with everything off; override per test.
const S = (over = {}) => ({
  fullSweep: false, mainMoved: false, projectChanged: false, canonChanged: false,
  prsTouched: [], issuesTouched: [], branchesTouched: [], activePacks: [], ...over,
});
// A minimal task descriptor for the engine tests.
const T = (over = {}) => ({
  id: 't', scope: 'fleet', worker: 'w.md', order: null, full_sweep_supported: false,
  smarts: 'low', gate: async () => ({ run: true }), ...over,
});

// --- schedule ---------------------------------------------------------------

test('fullSweepBucket is deterministic and in [0,6]', () => {
  for (const n of ['owner/a', 'owner/b', 'Owner/A', 'x/y/z']) {
    const b = fullSweepBucket(n);
    assert.ok(Number.isInteger(b) && b >= 0 && b < 7, `${n} -> ${b}`);
    assert.equal(b, fullSweepBucket(n), 'stable across calls');
  }
});

test('fullSweepBucket is case-insensitive', () => {
  assert.equal(fullSweepBucket('Owner/Repo'), fullSweepBucket('owner/repo'));
});

test('isFullSweepDay fires on exactly one weekday per repo', () => {
  const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => isFullSweepDay('owner/foo', d));
  assert.equal(days.length, 1);
  assert.equal(days[0], fullSweepBucket('owner/foo'));
});

// --- registry ---------------------------------------------------------------

test('packTasks scopes each task to its pack and carries pack id', () => {
  const packs = [
    { id: 'tidy-repo', maintenance: [{ id: 'branch-cleanup' }, { id: 'pr-assess' }] },
    { id: 'node' }, // no maintenance field
  ];
  const tasks = packTasks(packs);
  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks.map((t) => t.scope), ['pack:tidy-repo', 'pack:tidy-repo']);
  assert.equal(tasks[0].pack, 'tidy-repo');
});

test('assembleForRepo = fleet-core always + pack tasks only when the pack is declared', () => {
  const fleet = [T({ id: 'baselining' })];
  const packAll = packTasks([{ id: 'tidy-repo', maintenance: [{ id: 'branch-cleanup' }] }]);
  const withPack = assembleForRepo(['basics', 'tidy-repo'], fleet, packAll).map((t) => t.id);
  const withoutPack = assembleForRepo(['basics'], fleet, packAll).map((t) => t.id);
  assert.deepEqual(withPack, ['baselining', 'branch-cleanup']);
  assert.deepEqual(withoutPack, ['baselining']); // pack task absent when undeclared
});

test('loadFleetTasks discovers the fleet-core descriptors structurally', async () => {
  const ids = (await loadFleetTasks()).map((t) => t.id).sort();
  assert.deepEqual(ids, [
    'baselining', 'growth-dedup-local-instructions', 'growth-extract-new-instructions',
  ]);
});

// --- gate evaluation --------------------------------------------------------

test('planRepo emits a unit per run:true gate, carrying worker/targets/order/smarts', async () => {
  const tasks = [
    T({ id: 'a', worker: 'a.md', order: 'growth:1', smarts: 'high',
      gate: async () => ({ run: true, targets: { x: 1 }, reason: 'because' }) }),
    T({ id: 'b', gate: async () => ({ run: false }) }),
  ];
  const { units } = await planRepo(REPO, S(), tasks, null);
  assert.equal(units.length, 1);
  assert.deepEqual(units[0], {
    repo: 'owner/foo', task: 'a', worker: 'a.md', targets: { x: 1 },
    reason: 'because', order: 'growth:1', smarts: 'high',
  });
});

test('planRepo masks fullSweep for tasks that do not support it', async () => {
  let sawFull = null;
  const tasks = [T({ id: 'nofull', full_sweep_supported: false,
    gate: async (_r, sig) => { sawFull = sig.fullSweep; return { run: false }; } })];
  await planRepo(REPO, S({ fullSweep: true }), tasks, null);
  assert.equal(sawFull, false, 'a non-full task never sees fullSweep true');
});

test('planRepo passes fullSweep through to tasks that support it', async () => {
  let sawFull = null;
  const tasks = [T({ id: 'full', full_sweep_supported: true,
    gate: async (_r, sig) => { sawFull = sig.fullSweep; return { run: false }; } })];
  await planRepo(REPO, S({ fullSweep: true }), tasks, null);
  assert.equal(sawFull, true);
});

test('planRepo isolates a throwing gate: it drops the task, keeps the rest', async () => {
  const tasks = [
    T({ id: 'boom', gate: async () => { throw new Error('kaboom'); } }),
    T({ id: 'ok', gate: async () => ({ run: true }) }),
  ];
  const { units, errors } = await planRepo(REPO, S(), tasks, null);
  assert.deepEqual(units.map((u) => u.task), ['ok']);
  assert.equal(errors.length, 1);
  assert.match(errors[0].error, /kaboom/);
});

// --- fleet-core descriptor gates -------------------------------------------

test('baselining: runs on canonChanged (incremental) and on its full sweep', async () => {
  assert.equal((await baselining.gate(REPO, S())).run, false);
  assert.equal((await baselining.gate(REPO, S({ canonChanged: true }))).run, true);
  const full = await baselining.gate(REPO, S({ fullSweep: true }));
  assert.equal(full.run, true);
  assert.equal(full.targets.mode, 'full');
  assert.equal(baselining.full_sweep_supported, true);
});

test('growth-extract: runs only when the project changed; no full mode', async () => {
  assert.equal(extract.full_sweep_supported, false);
  assert.equal((await extract.gate(REPO, S())).run, false);
  assert.equal((await extract.gate(REPO, S({ projectChanged: true }))).run, true);
});

test('growth-dedup: runs on canonChanged, projectChanged, or its full sweep', async () => {
  assert.equal(dedup.full_sweep_supported, true);
  assert.equal((await dedup.gate(REPO, S())).run, false);
  assert.equal((await dedup.gate(REPO, S({ canonChanged: true }))).run, true);
  assert.equal((await dedup.gate(REPO, S({ projectChanged: true }))).run, true);
  assert.equal((await dedup.gate(REPO, S({ fullSweep: true }))).run, true);
});
