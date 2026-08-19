// The precondition-is-the-only-gate hunt (owner, 2026-08-06): flags task.md
// instructions and code-work workers that decide to skip the run in a later phase.
// Heuristic and advisory by design — the fixtures below are the real shapes the
// 2026-08-06 audit found, plus the legal shapes it must NOT flag.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup, declaredCheck } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';

const rule = declaredCheck('packs/core', 'task-phase-discipline');

const MD = 'packs/demo/tasks/demo-task/task.md';
const WORKER = 'packs/demo/tasks/demo-task/worker.mjs';

const run = (files) => {
  const root = makeRepo({ changed: files });
  try { return rule.run(buildContext({ root, mode: 'all' })); } finally { cleanup(root); }
};

test('advisory, and inert on a repo without tasks', () => {
  assert.equal(rule.severity, 'advisory');
  assert.deepEqual(run({ 'src/app.js': 'skip if already done\n' }), []);
});

test('flags a task.md state-gate that aborts the run (the wiki-growth shape)', () => {
  const findings = run({ [MD]: [
    '# task',
    'Before researching, list open PRs carrying the label.',
    'If one is open, do **not** stack a second round on it — add one dated nudge comment and stop.',
  ].join('\n') });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 3);
  assert.match(findings[0].what, /conditional skip/);
});

test('flags "already ⇒ skip" instruction language', () => {
  const findings = run({ [MD]: 'Already pointing at them ⇒ skip. Absent ⇒ skip; never create it.\n' });
  assert.equal(findings.length, 1);
});

test('does not flag an empty OUTCOME, or a scope carved by the precondition\'s Context', () => {
  const findings = run({ [MD]: [
    'Neither mode yields citable material → nothing to write. No commit, no log entry, no PR.',
    'A run that finds nothing and opens nothing is fine — and common.',
    'Skip this half entirely when Context says the activity half is not in scope.',
  ].join('\n') });
  assert.deepEqual(findings, []);
});

// A REQUIRED INPUT THE DISPATCH DID NOT CARRY IS A FAILURE, NOT A SKIP (owner,
// 2026-08-17): an agentic phase must state what it requires and stop without it,
// so the doc that does so cannot be the thing this rule flags. The exemption keys
// on the terminal state it names — converging to `needs-human` is the opposite of
// quietly deciding the run was not needed.
test('does not flag stopping on a missing required input, which converges to needs-human', () => {
  const findings = run({ [MD]: [
    '**That number is a required input.** A dispatch that does not carry it is a failed run: converge to `needs-human` naming the missing input.',
    'If the dispatch names no branch, stop and converge to needs-human — never fall back to the newest branch.',
  ].join('\n') });
  assert.deepEqual(findings, []);
});

// …and the exemption must not swallow the shape the rule exists for: a doc that
// mentions the failure state elsewhere still gets flagged for a real skip.
test('still flags a discretionary skip in a doc that also mentions needs-human', () => {
  const findings = run({ [MD]: [
    'A failed run converges to needs-human.',
    'If a PR is already open, do not run this cycle — stop and leave it.',
  ].join('\n') });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 2);
});

test('flags a code_work worker that logs a discretionary cycle skip (the baselining shape)', () => {
  const findings = run({ [WORKER]: [
    'export function deliver() {',
    "  console.log(`baselining: PR still stands — leaving this cycle's converge undelivered`);",
    "  console.log('baselining: skipping this cycle');",
    '}',
  ].join('\n') });
  assert.equal(findings.length, 2);
  assert.match(findings[0].what, /discretionary cycle skip/);
});

test('never scans task.mjs itself — the precondition is where skip logic BELONGS', () => {
  const findings = run({ 'packs/demo/tasks/demo-task/task.mjs': "// skip this cycle if nothing changed\nexport default { precondition() { return { run: false, reason: 'skipping this run' }; } };\n" });
  assert.deepEqual(findings, []);
});
