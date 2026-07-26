import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pack from '../../packs/tidy-repo/pack.mjs';
import repoTidy from '../../packs/tidy-repo/tasks/repo-tidy/task.mjs';

const TASK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../packs/tidy-repo/tasks/repo-tidy');

// The scheduler's signal bundle, in the shapes the collectors produce.
const S = (over = {}) => ({
  prs: { open: [], touched: [] },
  issues: { open: [], touched: [] },
  branches: { names: [] },
  commits: { substantiveChange: false },
  ...over,
});

test('tidy-repo is a declared pack (no fingerprint) with its skills; its task is not a pack.mjs slot', () => {
  assert.equal(pack.id, 'tidy-repo');
  assert.equal(pack.detect, null);
  // The task moved out of the manifest: the repo's scheduler finds
  // tasks/<name>/task.mjs structurally (#394).
  assert.equal(pack.run_daily, undefined);
  assert.deepEqual(
    readdirSync(join(dirname(fileURLToPath(import.meta.url)), '../../packs/tidy-repo/skills')).sort(),
    ['single-branch-status', 'single-issue-triage', 'single-pr-status'],
    'the worker skills are bundled in this pack\'s own skills/'
  );
});

test('repo-tidy task declaration: daily/sonnet/none, with its worker doc', () => {
  assert.equal(repoTidy.id, 'repo-tidy');
  assert.equal(repoTidy.frequency, 'daily');
  assert.equal(repoTidy.agent_model, 'sonnet'); // landed-status and implemented-in-main are judgment calls
  assert.equal(repoTidy.expected_outcome, 'none'); // acts only on issues; branches/PRs are read-only
  assert.deepEqual(repoTidy.precondition_signals, ['prs', 'issues', 'branches', 'commits']);
  assert.ok(existsSync(join(TASK_DIR, repoTidy.agent_instructions)), `worker doc missing: ${repoTidy.agent_instructions}`);
});

test('repo-tidy: runs on any tidy activity, silent on a genuinely quiet repo', () => {
  assert.equal(repoTidy.precondition(S()).run, false); // nothing happened
  assert.equal(repoTidy.precondition(S({ branches: { names: ['main'] } })).run, false); // only the default branch
  assert.equal(repoTidy.precondition(S({ prs: { open: [], touched: [1] } })).run, true);
  assert.equal(repoTidy.precondition(S({ issues: { open: [], touched: [2] } })).run, true);
  assert.equal(repoTidy.precondition(S({ branches: { names: ['main', 'feat'] } })).run, true);
  assert.equal(repoTidy.precondition(S({ commits: { substantiveChange: true } })).run, true);
});

test('repo-tidy: a substantive move widens PRs/issues to everything open; context names all three lists', () => {
  const v = repoTidy.precondition(S({
    branches: { names: ['main', 'feat-x'] },
    prs: { open: [{ number: 7 }, { number: 9 }], touched: [7] },
    issues: { open: [{ number: 3 }], touched: [] },
    commits: { substantiveChange: true },
  }));
  assert.equal(v.run, true);
  assert.match(v.reason, /substantively/);
  const ctx = v.context.join(' ');
  assert.match(ctx, /Branches to assess.*feat-x/);
  assert.match(ctx, /PRs to assess.*#7.*#9/); // widened past the one touched PR
  assert.match(ctx, /Issues to triage.*#3/);
});

test('repo-tidy: without a substantive move, only the touched PRs/issues are carried', () => {
  const v = repoTidy.precondition(S({
    prs: { open: [{ number: 7 }, { number: 9 }], touched: [9] },
    issues: { open: [{ number: 3 }], touched: [] },
  }));
  assert.equal(v.run, true);
  const ctx = v.context.join(' ');
  assert.match(ctx, /PRs to assess.*#9/);
  assert.doesNotMatch(ctx, /#7/);
  assert.doesNotMatch(ctx, /Issues to triage/);
});

test('repo-tidy: ignores the orphan conversation-logs and the maintenance delivery branch', () => {
  // conversation-logs is a grow_with_claudinite log stream and
  // claudinite/maintenance is Claudinite's own delivery branch — never project
  // work, so neither may reach the branch review even on a widening move.
  const v = repoTidy.precondition(S({
    branches: { names: ['main', 'conversation-logs', 'claudinite/maintenance', 'feat-x'] },
    commits: { substantiveChange: true },
  }));
  assert.equal(v.run, true);
  assert.match(v.context.join(' '), /Branches to assess.*feat-x/);
  assert.doesNotMatch(v.context.join(' '), /conversation-logs|claudinite\/maintenance/);

  // A window whose only non-default branches are those two carries no branch work
  // and — with nothing else moving — no run at all.
  assert.equal(repoTidy.precondition(S({ branches: { names: ['main', 'conversation-logs'] } })).run, false);
});
