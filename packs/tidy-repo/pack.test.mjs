import { test } from 'node:test';
import assert from 'node:assert/strict';
import pack from './pack.mjs';

const REPO = { fullName: 'owner/foo', defaultBranch: 'main' };
const S = (over = {}) => ({
  fullSweep: false, mainMoved: false, projectChanged: false, canonChanged: false,
  prsTouched: [], issuesTouched: [], branchesTouched: [], activePacks: ['tidy-repo'], ...over,
});
const task = (id) => pack.maintenance.find((t) => t.id === id);

test('tidy-repo is a declared pack (no fingerprint) with three maintenance tasks', () => {
  assert.equal(pack.id, 'tidy-repo');
  assert.equal(pack.detect, null);
  assert.deepEqual(pack.maintenance.map((t) => t.id), ['branch-cleanup', 'pr-assess', 'issue-triage']);
  for (const t of pack.maintenance) {
    assert.equal(t.full_sweep_supported, true);
    assert.equal(t.smarts, 'medium');
    assert.match(t.worker, /^packs\/tidy-repo\/maintenance\/.*\.worker\.md$/);
  }
});

test('branch-cleanup: excludes the default branch, runs only when other branches are present', async () => {
  const g = task('branch-cleanup').gate;
  assert.equal((await g(REPO, S())).run, false); // no branches touched
  assert.equal((await g(REPO, S({ branchesTouched: ['main'] }))).run, false); // only default
  const v = await g(REPO, S({ branchesTouched: ['main', 'feat-x'], mainMoved: true }));
  assert.equal(v.run, true);
  assert.deepEqual(v.targets.branches, ['feat-x']);
});

test('pr-assess: runs on the surfaced PRs, carries them as targets', async () => {
  const g = task('pr-assess').gate;
  assert.equal((await g(REPO, S())).run, false);
  const v = await g(REPO, S({ prsTouched: [7, 9] }));
  assert.equal(v.run, true);
  assert.deepEqual(v.targets.prs, [7, 9]);
});

test('issue-triage: runs on the surfaced issues, carries them as targets', async () => {
  const g = task('issue-triage').gate;
  assert.equal((await g(REPO, S())).run, false);
  const v = await g(REPO, S({ issuesTouched: [3], mainMoved: true }));
  assert.equal(v.run, true);
  assert.deepEqual(v.targets.issues, [3]);
});
