import { test } from 'node:test';
import assert from 'node:assert/strict';
import promote from './tasks/growth-promote/task.mjs';

// The canon-curation fleet-scoped task precondition (per-project-scheduling
// redesign: growth-promote is the ONLY task that needs fleet access;
// growth-discover-packs and prose-to-checks-sweep moved to grow_with_claudinite as
// per-repo local tasks, and migrations-retire became a canon-local TTL archiver).
// The precondition is pure over the collected signals, so it tests directly
// against a fabricated `fleet` signal.

const member = (over = {}) => ({
  repo: 'acme/app', defaultBranch: 'main',
  activePacks: ['grow_with_claudinite'], packConfigs: {},
  hasLocalPacks: true, localPacksChanged: true, stamp: null, schedulesItself: false,
  ...over,
});

// --- growth-promote ----------------------------------------------------------

test('growth-promote: declaration is daily/opus/open-pr over the fleet signal', () => {
  assert.equal(promote.frequency, 'daily');
  assert.equal(promote.agent_model, 'opus');
  assert.equal(promote.expected_outcome, 'open-pr'); // owner-gated, never auto-merged
  assert.deepEqual(promote.precondition_signals, ['fleet']);
});

test('growth-promote: fires on participating members whose local packs changed', () => {
  const v = promote.precondition({ fleet: { members: [
    member({ repo: 'acme/a' }),
    member({ repo: 'acme/b', localPacksChanged: false }), // changed nothing → excluded
    member({ repo: 'acme/c' }),
  ] } });
  assert.equal(v.run, true);
  assert.match(v.context.join(' '), /acme\/a/);
  assert.match(v.context.join(' '), /acme\/c/);
  assert.doesNotMatch(v.context.join(' '), /acme\/b/); // the unchanged member isn't a target
});

test('growth-promote: skips a member that opted out of promotion', () => {
  const v = promote.precondition({ fleet: { members: [
    member({ repo: 'acme/opt', packConfigs: { grow_with_claudinite: { promote: false } } }),
  ] } });
  assert.equal(v.run, false);
});

test('growth-promote: skips a member without local packs, or not declaring the growth pack', () => {
  assert.equal(promote.precondition({ fleet: { members: [member({ hasLocalPacks: false })] } }).run, false);
  assert.equal(promote.precondition({ fleet: { members: [member({ activePacks: ['basics'] })] } }).run, false);
});

test('growth-promote: skips when there is no fleet signal or the enumeration errored', () => {
  assert.equal(promote.precondition({ fleet: null }).run, false);
  assert.equal(promote.precondition({ fleet: { error: 'wrong token' } }).run, false);
  assert.equal(promote.precondition({ fleet: { members: [] } }).run, false);
});
