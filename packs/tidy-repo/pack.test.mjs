import { test } from 'node:test';
import assert from 'node:assert/strict';
import pack from './pack.mjs';

const REPO = { fullName: 'owner/foo', defaultBranch: 'main' };
const S = (over = {}) => ({
  fullSweep: false, mainMoved: false, projectChanged: false, canonChanged: false,
  prsTouched: [], issuesTouched: [], branchesTouched: [], activePacks: ['tidy-repo'], ...over,
});
const task = (id) => pack.run_daily.find((t) => t.id === id);

test('tidy-repo is a declared pack (no fingerprint) with its run_daily tasks and skills', () => {
  assert.equal(pack.id, 'tidy-repo');
  assert.equal(pack.detect, null);
  assert.deepEqual(pack.run_daily.map((t) => t.id), ['branch-cleanup', 'pr-assess', 'issue-triage', 'tidy-report']);
  assert.deepEqual(pack.skills, ['single-branch-status', 'single-pr-status', 'single-issue-triage']);
  for (const t of pack.run_daily) {
    assert.equal(t.full_sweep_supported, true);
    assert.match(t.worker, /^packs\/tidy-repo\/run_daily\/.*\.worker\.md$/);
  }
  // Dimension tasks need judgment (medium); the report is mechanical aggregation (low).
  assert.deepEqual(pack.run_daily.map((t) => t.smarts), ['medium', 'medium', 'medium', 'low']);
});

test('tidy-report: runs after any tidy activity or on the weekly sweep, ordered as a per-repo barrier', async () => {
  const g = task('tidy-report').gate;
  assert.equal(task('tidy-report').order, 'tidy:report');
  assert.equal((await g(REPO, S())).run, false); // nothing happened
  assert.equal((await g(REPO, S({ branchesTouched: ['main'] }))).run, false); // only default branch
  assert.equal((await g(REPO, S({ prsTouched: [1] }))).run, true);
  assert.equal((await g(REPO, S({ issuesTouched: [2] }))).run, true);
  assert.equal((await g(REPO, S({ branchesTouched: ['main', 'feat'] }))).run, true);
  assert.equal((await g(REPO, S({ fullSweep: true }))).run, true);
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
