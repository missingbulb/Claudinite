import { test } from 'node:test';
import assert from 'node:assert/strict';
import tidyIssuesJson from '../tasks/tidy-issues/task.json' with { type: 'json' };
import tidyPrsJson from '../tasks/tidy-prs/task.json' with { type: 'json' };
import { evaluatePrecondition, preconditionSignals } from '../../claudinite-tasks/shared-code/preconditions.mjs';
import { normalizeTaskDeclaration } from '../../claudinite-tasks/task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const tidyIssues = normalizeTaskDeclaration(tidyIssuesJson);
const tidyPrs = normalizeTaskDeclaration(tidyPrsJson);

// The scheduler's signal bundle, in the shapes the collectors produce.
const S = (over = {}) => ({
  prs: { open: [], touched: [] },
  issues: { open: [], touched: [] },
  branches: { names: [], touched: [] },
  commits: { substantiveChange: false },
  ...over,
});

const issuesVerdict = (signals) => evaluatePrecondition({ decl: tidyIssues }, signals);
const prsVerdict = (signals) => evaluatePrecondition({ decl: tidyPrs }, signals);

// --- tidy-issues: the acting dimension, daily, narrow ------------------------

test('tidy-issues: its signal is derived from its condition — the issues, nothing else', () => {
  assert.deepEqual(preconditionSignals(tidyIssues.preconditions, new Map()), ['issues']);
});

test('tidy-issues: an issue moving is the trigger — a PR or branch moving is not its business', () => {
  const v = issuesVerdict(S({ issues: { open: [{ number: 3 }, { number: 5 }], touched: [5] } }));
  assert.equal(v.run, true);
  assert.match(v.context.join(' '), /#5/);
  assert.doesNotMatch(v.context.join(' '), /#3/); // untouched — the trigger names what moved

  // Activity in the other dimensions never wakes this task.
  assert.equal(issuesVerdict(S({ prs: { open: [{ number: 7 }], touched: [7] } })).run, false);
  assert.equal(issuesVerdict(S({ branches: { names: ['main', 'feat-x'], touched: ['feat-x'] } })).run, false);
});

// The gate the owner asked for: nothing new in the window → don't go over the
// existing ones. A moving `main` is not an issue moving, and on any active repo it
// moves substantively most days — so widening on it ALONE re-triaged every open
// issue daily, which is the failure this asserts against.
test('tidy-issues: a substantive main move alone never wakes the task', () => {
  const v = issuesVerdict(S({
    issues: { open: [{ number: 3 }, { number: 5 }], touched: [] },
    commits: { substantiveChange: true },
  }));
  assert.equal(v.run, false);
  assert.match(v.reason, /no issue of this repo's own moved/);
});

// The scheduler's own work items wear a `task:*` label from creation. The issues
// signal only hides them by title prefix, so one filed under any other title
// reaches this task — and the queue's machinery is not project work to triage.
test('tidy-issues: an issue labelled task:* is neither a trigger nor in scope', () => {
  const queueItem = { number: 9, labels: ['task:ready'] };

  // It cannot wake the task on its own.
  assert.equal(issuesVerdict(S({ issues: { open: [queueItem], touched: [9] } })).run, false);

  // Nor can it enter the scope of a run something else triggered.
  const v = issuesVerdict(S({ issues: { open: [{ number: 3, labels: [] }, queueItem], touched: [3, 9] } }));
  assert.equal(v.run, true);
  assert.match(v.context.join(' '), /#3/);
  assert.doesNotMatch(v.context.join(' '), /#9/);

  // A label that merely CONTAINS the marker is somebody else's label.
  const other = issuesVerdict(S({ issues: { open: [{ number: 4, labels: ['not-task:ready'] }], touched: [4] } }));
  assert.equal(other.run, true);
});

test('tidy-issues: silent on a quiet repo, and on a substantive move with no open issues', () => {
  assert.equal(issuesVerdict(S()).run, false);
  assert.equal(issuesVerdict(S({ commits: { substantiveChange: true } })).run, false);
});

// --- tidy-prs: assess-only, weekly, full every run --------------------------

test('tidy-prs: its signal is derived from its condition — the prs, nothing else', () => {
  assert.deepEqual(preconditionSignals(tidyPrs.preconditions, new Map()), ['prs']);
});

test('tidy-prs: a touched open PR wakes the sweep, and the trigger names it', () => {
  const v = prsVerdict(S({ prs: { open: [{ number: 7 }, { number: 9 }], touched: [9] } }));
  assert.equal(v.run, true);
  assert.match(v.context.join(' '), /#9/); // the trigger names what moved
});

// The gate the owner asked for: an unchanged set of open PRs is last run's picture,
// and re-deriving it rewrites the tracker with itself.
test('tidy-prs: open PRs that nothing touched in the window are not re-swept', () => {
  const v = prsVerdict(S({ prs: { open: [{ number: 7 }, { number: 9 }], touched: [] } }));
  assert.equal(v.run, false);
  assert.match(v.reason, /no open PR was opened or updated in the window/);
});

test('tidy-prs: nothing moved, no run', () => {
  assert.equal(prsVerdict(S()).run, false);
});

// The `prs` signal also carries recently-MERGED PRs (for growth-extract). A merged
// PR is not something this sweep can recommend closing, so it must stay out of the
// target set entirely — the reason merged PRs live in their own field rather than
// being folded into `open`.
test('tidy-prs: merged PRs on the signal never enter the sweep', () => {
  const merged = { merged: [{ number: 42, title: 'landed last night' }] };
  assert.equal(prsVerdict(S({ prs: { open: [], touched: [], ...merged } })).run, false);
  // A merged PR is not a touch either: it cannot trigger the sweep on its own.
  assert.equal(prsVerdict(S({ prs: { open: [{ number: 7 }], touched: [], ...merged } })).run, false);
  const v = prsVerdict(S({ prs: { open: [{ number: 7 }], touched: [7], ...merged } }));
  assert.doesNotMatch(v.context.join(' '), /#42/);
});

// --- the trackers: one per task, never a shared body ------------------------
