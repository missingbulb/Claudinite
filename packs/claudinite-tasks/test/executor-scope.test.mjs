import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readyLabelForScope, EXECUTOR_SCOPES, READY_LABEL, READY_FLEET_LABEL } from '../dispatch.mjs';
import { scopeForLabel } from '../resolve-dispatch.mjs';

// A scope is a property of the EXECUTOR ROUTINE, never of a task: `session_scope`
// is gone from the contract (#1642) and nothing asks a task what its reach is. What
// these hold is the routing — the canon repo's ordinary executor does NOT hold the
// fleet grant, and the second ready label is the whole of what keeps it off.

test('an unnamed scope rides the ordinary ready label — every ordinary executor', () => {
  assert.equal(readyLabelForScope(undefined), READY_LABEL);
});

test('the two scopes route apart', () => {
  // Collapsing the labels would hand the fleet-wide grant to every project's own
  // executor silently.
  assert.equal(readyLabelForScope('fleet'), READY_FLEET_LABEL);
  assert.equal(readyLabelForScope('self'), READY_LABEL);
  assert.notEqual(readyLabelForScope('fleet'), readyLabelForScope('self'));
});

test('scopeForLabel is the exact inverse of the label the scheduler files under', () => {
  for (const scope of EXECUTOR_SCOPES) assert.equal(scopeForLabel(readyLabelForScope(scope)), scope);
  // And EVERY ready label inverts: a scope missing from the list would leave the
  // label it files under reading as no scope at all, so the executor started for it
  // would decline its own dispatch and the item would sit ready forever.
  for (const label of [READY_LABEL, READY_FLEET_LABEL]) {
    assert.ok(scopeForLabel(label) !== null, `${label} names no executor scope`);
  }
  // Anything that is not a ready label at all is not a scope.
  for (const label of ['task:status:waiting-for-executor', 'needs-human', '']) {
    assert.equal(scopeForLabel(label), null, label);
  }
});
