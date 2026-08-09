import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSessionScope, SESSION_SCOPES, DEFAULT_SESSION_SCOPE } from '../../engine/scheduler/session-scope.mjs';
import { readyLabelForScope, READY_LABEL, READY_FLEET_LABEL } from '../../engine/scheduler/dispatch.mjs';

// Which executor session a dispatch is filed to. The scope moved from the task to the
// OWNING PACK (owner ruling, 2026-08-09); the task-level `session_scope` is deprecated
// and still honoured. Both paths are tested, because the deprecated one is the
// compatibility promise — a repo still carrying it must keep routing correctly.

test('a pack declaring fleet reach gives it to every task it contributes', () => {
  // The task declares nothing — that is the point of the move.
  assert.deepEqual(
    resolveSessionScope({ pack: { id: 'sheepdog', sessionScope: 'fleet' }, decl: { id: 't' } }),
    { scope: 'fleet', source: 'pack' },
  );
});

test('the deprecated task-level field still routes, and is reported as deprecated', () => {
  // The compatibility promise: a repo carrying the old field is out of date, not
  // broken. `source` is what lets a caller say so instead of silently accepting it.
  assert.deepEqual(
    resolveSessionScope({ pack: { id: 'local/curation' }, decl: { session_scope: 'fleet' } }),
    { scope: 'fleet', source: 'task (deprecated)' },
  );
});

test('a pack declaring fleet wins over a task that says self', () => {
  // A task inside a fleet-reaching pack cannot be narrower than the executor it is
  // filed to — routing has no way to express it, so the pack's answer is the answer.
  assert.equal(
    resolveSessionScope({ pack: { sessionScope: 'fleet' }, decl: { session_scope: 'self' } }).scope,
    'fleet',
  );
});

test('everything else is self, which is almost every task', () => {
  for (const args of [
    {},
    { pack: {}, decl: {} },
    { pack: { sessionScope: 'self' }, decl: {} },
    { pack: null, decl: null },
  ]) {
    assert.deepEqual(resolveSessionScope(args), { scope: DEFAULT_SESSION_SCOPE, source: 'default' });
  }
});

test('a junk scope on either side falls back to self rather than mis-routing', () => {
  // A dispatch filed under a label no executor is wired to is never run, and the
  // scheduler re-arms it hourly forever. Defaulting is the recoverable failure; the
  // task contract is what flags the junk value loudly.
  assert.equal(resolveSessionScope({ pack: { sessionScope: 'FLEET' }, decl: {} }).scope, 'self');
  assert.equal(resolveSessionScope({ decl: { session_scope: 'everything' } }).scope, 'self');
});

test('every legal scope maps to a ready label, and the two are distinct', () => {
  // The whole reason the split exists: the fleet-wide session grant must not ride on
  // the label every ordinary project's executor fires on.
  assert.deepEqual(SESSION_SCOPES, ['self', 'fleet']);
  assert.equal(readyLabelForScope('self'), READY_LABEL);
  assert.equal(readyLabelForScope('fleet'), READY_FLEET_LABEL);
  assert.notEqual(READY_LABEL, READY_FLEET_LABEL);
});
