import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_SCOPES, validateTaskDeclaration } from '../../engine/scheduler/task-contract.mjs';
import { readyLabelForScope, READY_LABEL, READY_FLEET_LABEL } from '../../engine/scheduler/dispatch.mjs';

// Session scope is RETIRED as something a task (or pack) declares — an executor's
// reach is how its repo is provisioned. What survives is the routing for the
// deprecated field's one standing use, the canon's curation tasks, and that is the
// compatibility promise these tests hold: a lingering `session_scope: 'fleet'` must
// keep reaching the broader executor until those two migrate.

test('an undeclared scope rides the ordinary ready label — almost every task', () => {
  assert.equal(readyLabelForScope(undefined), READY_LABEL);
});

test("a lingering 'fleet' still routes to the fleet label, and the two labels are distinct", () => {
  // The canon repo's ordinary executor does NOT hold the fleet; the second label is
  // what keeps that grant off it. Collapsing the labels would hand it over silently.
  assert.equal(readyLabelForScope('fleet'), READY_FLEET_LABEL);
  assert.equal(readyLabelForScope('self'), READY_LABEL);
  assert.notEqual(READY_LABEL, READY_FLEET_LABEL);
  assert.deepEqual(SESSION_SCOPES, ['self', 'fleet']);
});

test('the deprecated field is still validated, never silently ignored', () => {
  // A typo that routed nowhere would strand the dispatch with an executor that
  // declines it, re-armed hourly forever — the contract keeps rejecting it loudly.
  const base = {
    id: 't', frequency: 'weekly', precondition_signals: [], agent_model: 'none',
    expected_outcome: 'none', prework: 'node worker.mjs', prework_timeout: 60,
    precondition: () => ({ run: false, reason: 'test' }),
  };
  assert.deepEqual(validateTaskDeclaration({ ...base, session_scope: 'fleet' }), []);
  const bad = validateTaskDeclaration({ ...base, session_scope: 'FLEET' });
  assert.equal(bad.length, 1);
  assert.match(bad[0].what, /not a legal session scope/);
});
