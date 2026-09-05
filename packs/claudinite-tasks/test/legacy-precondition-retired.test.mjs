import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTaskDeclaration, taskSignalNames } from '../task-contract.mjs';
import { evaluatePrecondition } from '../queue/executor.mjs';

// The declarative expression is the ONLY gate mechanism (#1617). The
// `precondition` function form and its `precondition_signals` companion are
// retired — a declaration carrying either is malformed, not tolerated.
//
// This is asserted at the CONTRACT rather than only at the world rule because
// discovery is what actually decides: an invalid declaration is skipped with a
// recorded error rather than failing the mount, so the task stops running. A
// contract that quietly accepted the old shape would run the task through a code
// path that no longer exists.

const base = {
  id: 'x', frequency: 'daily', agent_model: 'none', expected_outcome: 'no_code_changes', code_work: 'node worker.mjs', code_work_timeout: 60,
};
const whats = (decl) => validateTaskDeclaration(decl, new Map()).map((p) => p.what).join(' | ');

test('a declaration carrying only the retired function is rejected by name', () => {
  // Absent `preconditions` is run-always (the default), so what fails here is the
  // retired field itself, not a missing gate.
  const problems = whats({ ...base, precondition: () => ({ run: true }), precondition_signals: [] });
  assert.match(problems, /"precondition" function, which is retired/);
  assert.match(problems, /"precondition_signals" is retired/);
});

test('"precondition_signals" is rejected wherever it appears', () => {
  assert.match(whats({ ...base, preconditions: ['none'], precondition_signals: ['commits'] }), /precondition_signals/);
  assert.match(whats({ ...base, preconditions: ['none'], precondition_signals: [] }), /precondition_signals/);
});

test('a "precondition" property is rejected even beside a valid expression', () => {
  assert.match(whats({ ...base, preconditions: ['none'], precondition: () => ({ run: true }) }), /precondition/);
});

test('the declarative form is the one that passes', () => {
  assert.deepEqual(validateTaskDeclaration({ ...base, preconditions: ['none'] }, new Map()), []);
});

// The signal union has one source: the terms the expression names. A declared
// list could disagree with what the gate actually consults, which is the whole
// reason the derived union replaced it.
test('the signal union is derived, never read off a declared list', () => {
  assert.deepEqual(taskSignalNames({ preconditions: ['substantive-change'] }, new Map()), ['commits']);
  assert.deepEqual(taskSignalNames({ precondition_signals: ['issues'] }, new Map()), []);
});

// The seam production goes through must not reach for a function any more.
test('the executor seam never calls a precondition function', () => {
  const task = { decl: { frequency: 'daily', precondition: () => { throw new Error('the retired form was called'); } }, terms: new Map() };
  const verdict = evaluatePrecondition(task, {}, {}, null, new Date());
  assert.ok(verdict.error, 'a declaration with no expression must be a run failure, not a silent verdict');
  assert.match(verdict.error, /preconditions/);
});
