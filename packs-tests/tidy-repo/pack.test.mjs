import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pack from '../../packs/tidy-repo/pack.mjs';
import tidyIssues from '../../packs/tidy-repo/tasks/tidy-issues/task.mjs';
import tidyPrs from '../../packs/tidy-repo/tasks/tidy-prs/task.mjs';
import tidyBranches from '../../packs/tidy-repo/tasks/tidy-branches/task.mjs';

const PACK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../packs/tidy-repo');
const taskDir = (id) => join(PACK_DIR, 'tasks', id);

// The scheduler's signal bundle, in the shapes the collectors produce.
const S = (over = {}) => ({
  prs: { open: [], touched: [] },
  issues: { open: [], touched: [] },
  branches: { names: [] },
  commits: { substantiveChange: false },
  ...over,
});

test('tidy-repo is a declared pack (no fingerprint) with its skills; its tasks are not pack.mjs slots', () => {
  assert.equal(pack.id, 'tidy-repo');
  assert.equal(pack.detect, null);
  // The tasks moved out of the manifest: the repo's scheduler finds
  // tasks/<name>/task.mjs structurally (#394).
  assert.equal(pack.run_daily, undefined);
  assert.deepEqual(
    readdirSync(join(PACK_DIR, 'skills')).sort(),
    ['single-branch-status', 'single-issue-triage', 'single-pr-status'],
    'the worker skills are bundled in this pack\'s own skills/'
  );
});

test('one task per tidy dimension — the single repo-tidy pass is split three ways', () => {
  assert.deepEqual(readdirSync(join(PACK_DIR, 'tasks')).sort(), ['tidy-branches', 'tidy-issues', 'tidy-prs']);
});

test('every tidy task: id matches its dir, sonnet, outcome none, bounded, worker doc present', () => {
  for (const t of [tidyIssues, tidyPrs, tidyBranches]) {
    assert.ok(existsSync(taskDir(t.id)), `${t.id} has no task directory of its own`);
    assert.equal(t.agent_model, 'sonnet');    // landed-status / implemented-in-main are judgment calls
    assert.equal(t.expected_outcome, 'none'); // no tidy dimension ever opens or merges a PR
    assert.ok(Number.isInteger(t.agent_execution_timeout) && t.agent_execution_timeout > 0);
    assert.ok(existsSync(join(taskDir(t.id), t.agent_instructions)), `worker doc missing: ${t.id}/${t.agent_instructions}`);
  }
});

// --- tidy-issues: the acting dimension, daily, narrow ------------------------

test('tidy-issues: daily, and its signals are exactly the two triggers that change an issue verdict', () => {
  assert.equal(tidyIssues.id, 'tidy-issues');
  assert.equal(tidyIssues.frequency, 'daily'); // the one dimension that ACTS, so latency matters
  assert.deepEqual(tidyIssues.precondition_signals, ['issues', 'commits']);
});

test('tidy-issues: scope is the touched issues only — a PR or branch moving is not its business', () => {
  const v = tidyIssues.precondition(S({ issues: { open: [{ number: 3 }, { number: 5 }], touched: [5] } }));
  assert.equal(v.run, true);
  assert.match(v.context.join(' '), /Issues to triage: #5\./);
  assert.doesNotMatch(v.context.join(' '), /#3/); // untouched, and main didn't move

  // Activity in the other dimensions never wakes this task.
  assert.equal(tidyIssues.precondition(S({ prs: { open: [{ number: 7 }], touched: [7] } })).run, false);
  assert.equal(tidyIssues.precondition(S({ branches: { names: ['main', 'feat-x'] } })).run, false);
});

test('tidy-issues: a substantive main move IS the full sweep — every open issue, no calendar flag', () => {
  const v = tidyIssues.precondition(S({
    issues: { open: [{ number: 3 }, { number: 5 }], touched: [] },
    commits: { substantiveChange: true },
  }));
  assert.equal(v.run, true);
  assert.match(v.reason, /substantively/);
  assert.match(v.context.join(' '), /Issues to triage: #3, #5\./);
});

test('tidy-issues: silent on a quiet repo, and on a substantive move with no open issues', () => {
  assert.equal(tidyIssues.precondition(S()).run, false);
  assert.equal(tidyIssues.precondition(S({ commits: { substantiveChange: true } })).run, false);
});

// --- tidy-prs: assess-only, weekly, full every run --------------------------

test('tidy-prs: weekly (the full sweep is the declaration) over the prs signal alone', () => {
  assert.equal(tidyPrs.id, 'tidy-prs');
  assert.equal(tidyPrs.frequency, 'weekly');
  assert.deepEqual(tidyPrs.precondition_signals, ['prs']);
});

test('tidy-prs: scope is every open PR — touched-ness never narrows a full sweep', () => {
  const v = tidyPrs.precondition(S({ prs: { open: [{ number: 7 }, { number: 9 }], touched: [9] } }));
  assert.equal(v.run, true);
  assert.match(v.reason, /weekly full sweep over 2 open PR/);
  assert.match(v.context.join(' '), /PRs to assess.*#7, #9/);
  assert.match(v.context.join(' '), /read-only/);
});

test('tidy-prs: no open PRs, no run', () => {
  assert.equal(tidyPrs.precondition(S()).run, false);
});

// The `prs` signal also carries recently-MERGED PRs (for growth-extract). A merged
// PR is not something this sweep can recommend closing, so it must stay out of the
// target set entirely — the reason merged PRs live in their own field rather than
// being folded into `open`.
test('tidy-prs: merged PRs on the signal never enter the sweep', () => {
  const merged = { merged: [{ number: 42, title: 'landed last night' }] };
  assert.equal(tidyPrs.precondition(S({ prs: { open: [], touched: [], ...merged } })).run, false);
  const v = tidyPrs.precondition(S({ prs: { open: [{ number: 7 }], touched: [], ...merged } }));
  assert.match(v.reason, /over 1 open PR/);
  assert.doesNotMatch(v.context.join(' '), /#42/);
});

// --- tidy-branches: assess-only, weekly, full every run ---------------------

test('tidy-branches: weekly (the full sweep is the declaration) over the branches signal alone', () => {
  assert.equal(tidyBranches.id, 'tidy-branches');
  assert.equal(tidyBranches.frequency, 'weekly');
  assert.deepEqual(tidyBranches.precondition_signals, ['branches']);
});

test('tidy-branches: scope is every branch past the presumed default', () => {
  const v = tidyBranches.precondition(S({ branches: { names: ['main', 'feat-x', 'fix-y'] } }));
  assert.equal(v.run, true);
  assert.match(v.reason, /weekly full sweep over 2 branch/);
  assert.match(v.context.join(' '), /Branches to assess.*feat-x, fix-y/);
  assert.doesNotMatch(v.context.join(' '), /main/);
});

test('tidy-branches: ignores the orphan conversation-logs and the maintenance delivery branch', () => {
  // conversation-logs is a grow_with_claudinite log stream and
  // claudinite/maintenance is Claudinite's own delivery branch — never project
  // work, so neither may reach the branch review.
  const v = tidyBranches.precondition(S({
    branches: { names: ['main', 'conversation-logs', 'claudinite/maintenance', 'feat-x'] },
  }));
  assert.equal(v.run, true);
  assert.match(v.context.join(' '), /Branches to assess.*feat-x/);
  assert.doesNotMatch(v.context.join(' '), /conversation-logs|claudinite\/maintenance/);

  // A repo whose only non-default branches are those two has no branch work at all.
  assert.equal(tidyBranches.precondition(S({ branches: { names: ['master', 'conversation-logs'] } })).run, false);
  assert.equal(tidyBranches.precondition(S()).run, false);
});

// --- the trackers: one per task, never a shared body ------------------------

test('each worker reconciles its OWN tracker by exact title — three tasks never race on one body', () => {
  const titles = {
    'tidy-issues': 'Claudinite tracker: Tidy Issues',
    'tidy-prs': 'Claudinite tracker: Tidy PRs',
    'tidy-branches': 'Claudinite tracker: Tidy Branches',
  };
  for (const [id, title] of Object.entries(titles)) {
    const worker = readFileSync(join(taskDir(id), 'task.md'), 'utf8');
    assert.ok(worker.includes(`\`${title}\``), `${id}/task.md does not name its tracker \`${title}\``);
    // The tracker's state carries no meaning, so no worker may open or close it.
    assert.match(worker, /Never open, close, or reopen the tracker/);
  }
});
