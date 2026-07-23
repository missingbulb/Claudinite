import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pack from './pack.mjs';

const REPO = { fullName: 'owner/foo', defaultBranch: 'main' };
const S = (over = {}) => ({
  fullSweep: false, mainMoved: false, projectChanged: false, substantiveChange: false, canonChanged: false,
  prsTouched: [], issuesTouched: [], branchesTouched: [], activePacks: ['tidy-repo'], ...over,
});
const task = (id) => pack.run_daily.find((t) => t.id === id);

test('tidy-repo is a declared pack (no fingerprint) with its one run_daily task and skills', () => {
  assert.equal(pack.id, 'tidy-repo');
  assert.equal(pack.detect, null);
  assert.deepEqual(pack.run_daily.map((t) => t.id), ['repo-tidy']);
  assert.deepEqual(
    readdirSync(join(dirname(fileURLToPath(import.meta.url)), 'skills')).sort(),
    ['single-branch-status', 'single-issue-triage', 'single-pr-status'],
    'the worker skills are bundled in this pack\'s own skills/'
  );
  const t = task('repo-tidy');
  assert.equal(t.full_sweep_supported, true);
  assert.match(t.worker, /^packs\/tidy-repo\/run_daily\/repo-tidy\.worker\.md$/);
  // A single pass doing dimensions-then-reconcile needs no ordering barrier.
  assert.equal(t.order, undefined);
  // The pass makes landed-status and implemented-in-main judgment calls.
  assert.equal(t.smarts, 'medium');
});

test('repo-tidy: runs on any tidy activity or the weekly sweep, carrying all three target lists', async () => {
  const g = task('repo-tidy').gate;
  assert.equal((await g(REPO, S())).run, false); // nothing happened
  assert.equal((await g(REPO, S({ branchesTouched: ['main'] }))).run, false); // only the default branch
  assert.equal((await g(REPO, S({ prsTouched: [1] }))).run, true);
  assert.equal((await g(REPO, S({ issuesTouched: [2] }))).run, true);
  assert.equal((await g(REPO, S({ branchesTouched: ['main', 'feat'] }))).run, true);
  assert.equal((await g(REPO, S({ fullSweep: true }))).run, true);
});

test('repo-tidy: excludes the default branch from the branch targets, carries the rest', async () => {
  const g = task('repo-tidy').gate;
  const v = await g(REPO, S({ branchesTouched: ['main', 'feat-x'], prsTouched: [7, 9], issuesTouched: [3], substantiveChange: true }));
  assert.equal(v.run, true);
  assert.deepEqual(v.targets, { branches: ['feat-x'], prs: [7, 9], issues: [3] });
  assert.match(v.reason, /substantively/);
});

test('repo-tidy: ignores the orphan conversation-logs branch altogether', async () => {
  const g = task('repo-tidy').gate;
  // conversation-logs is a grow_with_claudinite log stream, never project work —
  // it must never reach the branch review, even on a widening substantive move.
  const v = await g(REPO, S({ branchesTouched: ['main', 'conversation-logs', 'feat-x'], substantiveChange: true }));
  assert.equal(v.run, true);
  assert.deepEqual(v.targets.branches, ['feat-x']);
  // A window where the ONLY non-default branch is conversation-logs carries no branch work.
  const only = await g(REPO, S({ branchesTouched: ['main', 'conversation-logs'], fullSweep: true }));
  assert.deepEqual(only.targets.branches, []);
});
