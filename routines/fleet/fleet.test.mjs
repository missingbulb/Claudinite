import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fullSweepBucket, isFullSweepDay } from './schedule.mjs';
import { packTasks, assembleForRepo } from './registry.mjs';
import { planRepo } from './gates.mjs';
import promote from '../../.claudinite/local/packs/canon-curation/run_daily/growth-promote-to-claudinite.mjs';

const REPO = { fullName: 'owner/foo', defaultBranch: 'main' };
const S = (over = {}) => ({
  fullSweep: false, mainMoved: false, projectChanged: false, substantiveChange: false,
  canonChanged: false, relevantCanonChanged: false, hasLocalPacks: false,
  prsTouched: [], issuesTouched: [], branchesTouched: [], activePacks: [], ...over,
});
const T = (over = {}) => ({
  id: 't', worker: 'w.md', full_sweep_supported: false,
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

test('packTasks collects each pack\'s run_daily tasks, tagged with the pack id', () => {
  const packs = [
    { id: 'tidy-repo', run_daily: [{ id: 'repo-tidy' }] },
    { id: 'grow_with_claudinite', run_daily: [{ id: 'growth-extract' }] },
    { id: 'node' }, // no run_daily field
  ];
  const tasks = packTasks(packs);
  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks.map((t) => t.pack), ['tidy-repo', 'grow_with_claudinite']);
  assert.equal(tasks[0].id, 'repo-tidy');
});

test('assembleForRepo = the run_daily tasks of only the packs a repo declares', () => {
  const all = packTasks([
    { id: 'basics', run_daily: [{ id: 'baselining' }] },
    { id: 'tidy-repo', run_daily: [{ id: 'repo-tidy' }] },
  ]);
  assert.deepEqual(assembleForRepo(['basics', 'tidy-repo'], all).map((t) => t.id), ['baselining', 'repo-tidy']);
  assert.deepEqual(assembleForRepo(['basics'], all).map((t) => t.id), ['baselining']); // tidy task absent when undeclared
});

// --- gate evaluation --------------------------------------------------------

test('planRepo emits a unit per run:true gate, carrying worker/targets/smarts', async () => {
  const tasks = [
    T({ id: 'a', worker: 'a.md', smarts: 'high',
      gate: async () => ({ run: true, targets: { x: 1 }, reason: 'because' }) }),
    T({ id: 'b', gate: async () => ({ run: false }) }),
  ];
  const { units } = await planRepo(REPO, S(), tasks, null);
  assert.equal(units.length, 1);
  assert.deepEqual(units[0], {
    repo: 'owner/foo', task: 'a', worker: 'a.md', workerRepo: null, targets: { x: 1 },
    reason: 'because', smarts: 'high',
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

// --- pack-contributed descriptor gates -------------------------------------
//
// The canon packs' `run_daily/` descriptors retired with the per-project
// scheduler (#394), so there are no canon-pack gates left for this file to
// exercise: every canon pack's scheduled work is now a `tasks/<name>/task.mjs`
// declaration whose PRECONDITION is tested beside its pack —
// packs-tests/basics/tasks.test.mjs, packs-tests/grow_with_claudinite/tasks.test.mjs,
// packs-tests/product-wiki/pack.test.mjs, packs-tests/tidy-repo/pack.test.mjs,
// packs-tests/chrome-extension-release/tasks.test.mjs. What survives here is the
// planner machinery above (pure, pack-agnostic) and the one LOCAL-pack descriptor
// the central routine still reads, below.

// --- canon-curation (home-only pack) gates ----------------------------------

const HOME = { fullName: 'o/home', defaultBranch: 'main' };
const MEMBERS = [
  { repo: 'owner/foo', activePacks: ['basics', 'grow_with_claudinite'], projectChanged: true, substantiveChange: true, hasLocalPacks: true, localPacksChanged: true },
  { repo: 'owner/bar', activePacks: ['basics', 'grow_with_claudinite'], projectChanged: false, substantiveChange: false, hasLocalPacks: true, localPacksChanged: false },
  { repo: 'owner/baz', activePacks: ['basics'], projectChanged: true, substantiveChange: true, hasLocalPacks: true, localPacksChanged: true }, // not enrolled
];

test('growth-promote-to-claudinite (canon-curation): targets the members whose local packs changed', async () => {
  const v = await promote.gate(HOME, S({ isHome: true, fleetMembers: MEMBERS }));
  assert.equal(v.run, true);
  assert.deepEqual(v.targets.repos, ['owner/foo']); // local packs changed AND enrolled; baz changed but isn't enrolled
});

test('growth-promote-to-claudinite: a growth entry with promote:false is never a promote target', async () => {
  const optedOut = [{ repo: 'owner/foo', activePacks: ['basics', 'grow_with_claudinite'], packConfigs: { grow_with_claudinite: { promote: false } }, projectChanged: true, substantiveChange: true, hasLocalPacks: true, localPacksChanged: true }];
  assert.equal((await promote.gate(HOME, S({ isHome: true, fleetMembers: optedOut }))).run, false);
  // the weekly full sweep honors the opt-out too — it is a standing setting, not a missed night
  assert.equal((await promote.gate(HOME, S({ isHome: true, fullSweep: true, fleetMembers: optedOut }))).run, false);
});

test('growth-promote-to-claudinite: a participant that changed code but not its local packs is not targeted daily', async () => {
  const members = [{ repo: 'owner/foo', activePacks: ['basics', 'grow_with_claudinite'], projectChanged: true, substantiveChange: true, hasLocalPacks: true, localPacksChanged: false }];
  assert.equal((await promote.gate(HOME, S({ isHome: true, fleetMembers: members }))).run, false);
  // but the weekly full sweep still re-promotes over it (the safety net, regardless of change)
  assert.equal((await promote.gate(HOME, S({ isHome: true, fullSweep: true, fleetMembers: members }))).run, true);
});

test('growth-promote-to-claudinite: a member whose only change was housekeeping is not targeted', async () => {
  // enrolled + main moved, but the move was bot/baselining — no local-pack change
  const members = [{ repo: 'owner/foo', activePacks: ['basics', 'grow_with_claudinite'], projectChanged: true, substantiveChange: false, hasLocalPacks: true, localPacksChanged: false }];
  assert.equal((await promote.gate(HOME, S({ isHome: true, fleetMembers: members }))).run, false);
});

test('growth-promote-to-claudinite: a participant with no local packs is not a target', async () => {
  // enrolled + changed, but tracks no local packs → nothing to promote from
  const members = [{ repo: 'owner/foo', activePacks: ['basics', 'grow_with_claudinite'], projectChanged: true, substantiveChange: true, hasLocalPacks: false, localPacksChanged: false }];
  assert.equal((await promote.gate(HOME, S({ isHome: true, fleetMembers: members }))).run, false);
  // even the weekly full sweep skips it — no participant with local packs to promote over
  assert.equal((await promote.gate(HOME, S({ isHome: true, fullSweep: true, fleetMembers: members }))).run, false);
});

test('growth-promote-to-claudinite: full sweep promotes over all participants regardless of change', async () => {
  const v = await promote.gate(HOME, S({ isHome: true, fullSweep: true, fleetMembers: MEMBERS }));
  assert.equal(v.run, true);
  assert.deepEqual(v.targets.repos, ['owner/foo', 'owner/bar']);
});

test('growth-promote-to-claudinite: quiet when nothing changed, and never runs off the home repo', async () => {
  assert.equal((await promote.gate(HOME, S({ isHome: true, fleetMembers: MEMBERS.map((m) => ({ ...m, projectChanged: false, substantiveChange: false, localPacksChanged: false })) }))).run, false);
  assert.equal((await promote.gate(HOME, S({ isHome: true }))).run, false); // no aggregate at all
  // A stray declaration on a member can't double-run promote: the gate requires isHome.
  assert.equal((await promote.gate(REPO, S({ fleetMembers: MEMBERS }))).run, false);
});
