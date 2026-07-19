import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fullSweepBucket, isFullSweepDay } from './schedule.mjs';
import { packTasks, assembleForRepo } from './registry.mjs';
import { planRepo } from './gates.mjs';
import baselining from '../../packs/basics/run_daily/baselining.mjs';
import extract from '../../packs/grow_with_claudinite/run_daily/growth-extract-new-instructions.mjs';
import dedup from '../../packs/grow_with_claudinite/run_daily/growth-dedup-local-instructions.mjs';
import discoverPacks from '../../packs/grow_with_claudinite/run_daily/growth-discover-packs.mjs';
import promote from '../../packs/canon-curation/run_daily/growth-promote-to-claudinite.mjs';
import proseSweep from '../../packs/canon-curation/run_daily/prose-to-checks-sweep.mjs';

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

test('baselining (basics): runs on canonChanged (incremental) and on its full sweep', async () => {
  assert.equal((await baselining.gate(REPO, S())).run, false);
  assert.equal((await baselining.gate(REPO, S({ canonChanged: true }))).run, true);
  const full = await baselining.gate(REPO, S({ fullSweep: true }));
  assert.equal(full.run, true);
  assert.equal(full.targets.mode, 'full');
  assert.equal(baselining.full_sweep_supported, true);
});

test('baselining (basics): self-skips the home repo — the canon doesn\'t mount itself', async () => {
  assert.equal((await baselining.gate(REPO, S({ isHome: true, canonChanged: true }))).run, false);
  assert.equal((await baselining.gate(REPO, S({ isHome: true, fullSweep: true }))).run, false);
});

test('growth-extract (grow_with_claudinite): runs only on a substantive project change; no full mode', async () => {
  assert.equal(extract.full_sweep_supported, false);
  assert.equal((await extract.gate(REPO, S())).run, false);
  assert.equal((await extract.gate(REPO, S({ substantiveChange: true }))).run, true);
  // a housekeeping-only main move (bot bump / baselining) must NOT trigger extract
  assert.equal((await extract.gate(REPO, S({ mainMoved: true, projectChanged: true }))).run, false);
});

test('growth-dedup (grow_with_claudinite): only with local packs, on a relevant canon / substantive change / full sweep', async () => {
  assert.equal(dedup.full_sweep_supported, true);
  // No local packs → never runs, whatever else is true (nothing to prune)
  assert.equal((await dedup.gate(REPO, S())).run, false);
  assert.equal((await dedup.gate(REPO, S({ relevantCanonChanged: true, substantiveChange: true, fullSweep: true }))).run, false);
  // With local packs, any of the three triggers fires it
  assert.equal((await dedup.gate(REPO, S({ hasLocalPacks: true, relevantCanonChanged: true }))).run, true);
  assert.equal((await dedup.gate(REPO, S({ hasLocalPacks: true, substantiveChange: true }))).run, true);
  assert.equal((await dedup.gate(REPO, S({ hasLocalPacks: true, fullSweep: true }))).run, true);
  // A canon change to a pack this repo does NOT declare (relevantCanonChanged false) does not fire —
  // the coarse global canonChanged is no longer the trigger.
  assert.equal((await dedup.gate(REPO, S({ hasLocalPacks: true, canonChanged: true, relevantCanonChanged: false }))).run, false);
  // a housekeeping-only main move must NOT by itself trigger dedup
  assert.equal((await dedup.gate(REPO, S({ hasLocalPacks: true, mainMoved: true, projectChanged: true }))).run, false);
});

test('growth-discover-packs (grow_with_claudinite): a regular run_daily task, weekly-only, independent', async () => {
  assert.equal(discoverPacks.full_sweep_supported, true);
  // Slow-moving signal: fires only on the member's weekly full sweep, not on day-to-day change.
  assert.equal((await discoverPacks.gate(REPO, S())).run, false);
  assert.equal((await discoverPacks.gate(REPO, S({ projectChanged: true }))).run, false);
  assert.equal((await discoverPacks.gate(REPO, S({ canonChanged: true }))).run, false);
  assert.equal((await discoverPacks.gate(REPO, S({ fullSweep: true }))).run, true);
});

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

test('prose-to-checks-sweep (canon-curation): weekly, home-only', async () => {
  assert.equal(proseSweep.full_sweep_supported, true);
  assert.equal((await proseSweep.gate(HOME, S({ isHome: true }))).run, false);
  assert.equal((await proseSweep.gate(HOME, S({ isHome: true, fullSweep: true }))).run, true);
  assert.equal((await proseSweep.gate(REPO, S({ fullSweep: true }))).run, false); // never off-home
});
