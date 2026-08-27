import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pack from '../pack.mjs';
import tidyIssues from '../tasks/tidy-issues/task.mjs';
import tidyPrs from '../tasks/tidy-prs/task.mjs';

const PACK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../packs/tidy-repo');
const taskDir = (id) => join(PACK_DIR, 'tasks', id);

// The scheduler's signal bundle, in the shapes the collectors produce.
const S = (over = {}) => ({
  prs: { open: [], touched: [] },
  issues: { open: [], touched: [] },
  branches: { names: [], touched: [] },
  commits: { substantiveChange: false },
  ...over,
});

test('tidy-repo is a declared pack (no fingerprint) with its skills; its tasks are not pack.mjs slots', () => {
  // No fingerprint is stated by saying nothing — the loader resolves an undeclared
  // `detect` to null.
  assert.equal(pack.detect, undefined);
  // The tasks moved out of the manifest: the repo's scheduler finds
  // tasks/<name>/task.mjs structurally (#394).
  assert.equal(pack.run_daily, undefined);
  assert.deepEqual(
    readdirSync(join(PACK_DIR, 'skills')).sort(),
    ['improve-comments', 'single-issue-triage', 'single-pr-status'],
    'the worker skills are bundled in this pack\'s own skills/'
  );
});

test('one task per tidy dimension — the repo-tidy pass is split three ways', () => {
  assert.deepEqual(
    readdirSync(join(PACK_DIR, 'tasks')).sort(),
    ['improve-comments', 'tidy-issues', 'tidy-prs'],
  );
});

test('every GitHub-object tidy task: id matches its dir, sonnet, outcome none, bounded, worker doc present', () => {
  // improve-comments is deliberately outside this loop: it is the one dimension whose
  // subject is the repo's source, so it alone opens a PR and alone pays for opus.
  for (const t of [tidyIssues, tidyPrs]) {
    assert.ok(existsSync(taskDir(t.id)), `${t.id} has no task directory of its own`);
    assert.equal(t.agent_model, 'sonnet');    // landed-status / implemented-in-main are judgment calls
    assert.equal(t.expected_outcome, 'none'); // no GitHub-object dimension ever opens or merges a PR
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
  assert.equal(tidyIssues.precondition(S({ branches: { names: ['main', 'feat-x'], touched: ['feat-x'] } })).run, false);
});

test('tidy-issues: a substantive main move widens an already-triggered run to every open issue', () => {
  const v = tidyIssues.precondition(S({
    issues: { open: [{ number: 3 }, { number: 5 }], touched: [5] },
    commits: { substantiveChange: true },
  }));
  assert.equal(v.run, true);
  assert.match(v.reason, /substantively/);
  assert.match(v.context.join(' '), /Issues to triage: #3, #5\./); // #3 is untouched, and still in scope
});

// The gate the owner asked for: nothing new in the window → don't go over the
// existing ones. A moving `main` is not an issue moving, and on any active repo it
// moves substantively most days — so widening on it ALONE re-triaged every open
// issue daily, which is the failure this asserts against.
test('tidy-issues: a substantive main move alone never wakes the task', () => {
  const v = tidyIssues.precondition(S({
    issues: { open: [{ number: 3 }, { number: 5 }], touched: [] },
    commits: { substantiveChange: true },
  }));
  assert.equal(v.run, false);
  assert.match(v.reason, /no issues touched/);
});

// The scheduler's own work items wear a `task:*` label from creation. The issues
// signal only hides them by title prefix, so one filed under any other title
// reaches this task — and the queue's machinery is not project work to triage.
test('tidy-issues: an issue labelled task:* is neither a trigger nor in scope', () => {
  const queueItem = { number: 9, labels: ['task:ready'] };

  // It cannot wake the task on its own.
  assert.equal(tidyIssues.precondition(S({ issues: { open: [queueItem], touched: [9] } })).run, false);

  // Nor can it enter the scope of a run something else triggered.
  const v = tidyIssues.precondition(S({
    issues: { open: [{ number: 3, labels: [] }, queueItem], touched: [3] },
    commits: { substantiveChange: true },
  }));
  assert.equal(v.run, true);
  assert.match(v.context.join(' '), /Issues to triage: #3\./);
  assert.doesNotMatch(v.context.join(' '), /#9/);

  // A label that merely CONTAINS the marker is somebody else's label.
  const other = tidyIssues.precondition(S({ issues: { open: [{ number: 4, labels: ['not-task:ready'] }], touched: [4] } }));
  assert.equal(other.run, true);
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

test('tidy-prs: touched-ness gates the sweep but never narrows it — scope stays every open PR', () => {
  const v = tidyPrs.precondition(S({ prs: { open: [{ number: 7 }, { number: 9 }], touched: [9] } }));
  assert.equal(v.run, true);
  assert.match(v.reason, /full sweep over 2 open PR/);
  assert.match(v.context.join(' '), /PRs to assess.*#7, #9/); // #7 is untouched, and still assessed
  assert.match(v.context.join(' '), /read-only/);
});

// The gate the owner asked for: an unchanged set of open PRs is last run's picture,
// and re-deriving it rewrites the tracker with itself.
test('tidy-prs: open PRs that nothing touched in the window are not re-swept', () => {
  const v = tidyPrs.precondition(S({ prs: { open: [{ number: 7 }, { number: 9 }], touched: [] } }));
  assert.equal(v.run, false);
  assert.match(v.reason, /no PR opened or updated in the window/);
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
  // A merged PR is not a touch either: it cannot trigger the sweep on its own.
  assert.equal(tidyPrs.precondition(S({ prs: { open: [{ number: 7 }], touched: [], ...merged } })).run, false);
  const v = tidyPrs.precondition(S({ prs: { open: [{ number: 7 }], touched: [7], ...merged } }));
  assert.match(v.reason, /over 1 open PR/);
  assert.doesNotMatch(v.context.join(' '), /#42/);
});

// --- the trackers: one per task, never a shared body ------------------------

test('each worker reconciles its OWN tracker by exact title — the two tasks never race on one body', () => {
  const titles = {
    'tidy-issues': 'Claudinite tracker: Tidy Issues',
    'tidy-prs': 'Claudinite tracker: Tidy PRs',
  };
  for (const [id, title] of Object.entries(titles)) {
    const worker = readFileSync(join(taskDir(id), 'task.md'), 'utf8');
    assert.ok(worker.includes(`\`${title}\``), `${id}/task.md does not name its tracker \`${title}\``);
    // The tracker's state carries no meaning, so no worker may open or close it.
    assert.match(worker, /Never open, close, or reopen the tracker/);
    // The tracker logs changes, not scans: a run that acted on nothing (issues) or
    // re-derived the same picture (PRs) leaves it untouched, and a repo with nothing
    // to record never gets a tracker at all.
    assert.match(worker, /nothing to record/, `${id}/task.md does not gate its tracker write on having something to record`);
  }
});

// The self-trigger the touched-gate could not see (#988): a triage comment is an
// issue update, so a run that re-announces a verdict it already posted is the next
// window's `touched` and wakes itself, indefinitely. The fix is to not make that
// write — so the skill's no-repeat rule, and the marker that lets a run recognise
// its own prior verdict, are what these assert.
test('single-issue-triage: an unchanged verdict is posted nowhere, and carries its own action name', () => {
  const skill = readFileSync(join(PACK_DIR, 'skills/single-issue-triage/SKILL.md'), 'utf8');
  assert.match(skill, /post nothing and change nothing/i,
    'single-issue-triage does not forbid re-posting a verdict it already posted');
  assert.match(skill, /<!-- claudinite:tidy-issues verdict=/,
    'single-issue-triage defines no marker, so a run cannot recognise its own prior verdict');
  assert.match(skill, /\bunchanged\b/,
    'the return vocabulary carries no `unchanged`, so the worker cannot tell it apart from `left`');
});

test('tidy-issues: its worker knows an unchanged verdict is not an action', () => {
  const worker = readFileSync(join(taskDir('tidy-issues'), 'task.md'), 'utf8');
  assert.match(worker, /\bunchanged\b/,
    'tidy-issues/task.md does not say what an unchanged verdict means for its tracker');
});

// The strongest completion signal an issue can carry is its own checklist, fully
// ticked — and it is a claim by the author, not proof, so it enters the
// close-if-implemented rung rather than short-circuiting it (#1087).
test('single-issue-triage: a fully-ticked checklist prompts a completion check, and a partial one does not', () => {
  const skill = readFileSync(join(PACK_DIR, 'skills/single-issue-triage/SKILL.md'), 'utf8');
  assert.match(skill, /every checkbox .*ticked/i,
    'single-issue-triage never reads the issue body\'s checkboxes');
  assert.match(skill, /a claim.*not proof/i,
    'a ticked checklist is treated as proof of completion, bypassing the verify-against-main safeguard');
  assert.match(skill, /partially[- ]ticked/i,
    'the skill does not say a partially-ticked list is not a completion signal');
});

// A manual-steps issue (a console setting, a routine only a human can touch) has no
// repo-side artifact to verify against, so verify-against-`main` alone would send
// every one of them to `comment` forever.
test('single-issue-triage: an ask with no repo-side artifact closes on the author\'s own ticks', () => {
  const skill = readFileSync(join(PACK_DIR, 'skills/single-issue-triage/SKILL.md'), 'utf8');
  assert.match(skill, /no repo-side artifact/i,
    'the skill leaves a manual-steps issue with no closing condition but main, which can never carry it');
});
