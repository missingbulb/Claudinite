import { test } from 'node:test';
import assert from 'node:assert/strict';
import promote from './tasks/growth-promote/task.mjs';
import discover from './tasks/growth-discover-packs/task.mjs';
import proseToChecks from './tasks/prose-to-checks-sweep/task.mjs';

// The canon-curation fleet-scoped + canon-local task preconditions
// (per-project-scheduling DESIGN §6, table 2). Each precondition is pure over the
// collected signals, so it tests directly against a fabricated `fleet` signal.

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

// --- growth-discover-packs ---------------------------------------------------

test('growth-discover-packs: declaration is weekly/opus/open-pr over the fleet signal', () => {
  assert.equal(discover.frequency, 'weekly');
  assert.equal(discover.agent_model, 'opus');
  assert.equal(discover.expected_outcome, 'open-pr');
  assert.deepEqual(discover.precondition_signals, ['fleet']);
});

test('growth-discover-packs: fires over ALL participating members regardless of change', () => {
  const v = discover.precondition({ fleet: { members: [
    member({ repo: 'acme/a', localPacksChanged: false }),
    member({ repo: 'acme/b', localPacksChanged: false }),
    member({ repo: 'acme/c', activePacks: ['basics'] }), // not a participant
  ] } });
  assert.equal(v.run, true); // change-independent — discovery manifests every participant weekly
  assert.match(v.context.join(' '), /acme\/a.*acme\/b|acme\/b.*acme\/a/);
  assert.doesNotMatch(v.context.join(' '), /acme\/c/);
});

test('growth-discover-packs: skips with no participants or no fleet signal', () => {
  assert.equal(discover.precondition({ fleet: { members: [member({ activePacks: ['basics'] })] } }).run, false);
  assert.equal(discover.precondition({ fleet: null }).run, false);
  assert.equal(discover.precondition({ fleet: { error: 'boom' } }).run, false);
});

// --- prose-to-checks-sweep ---------------------------------------------------

test('prose-to-checks-sweep: declaration is daily/opus/open-pr, canon-local (no signals)', () => {
  assert.equal(proseToChecks.frequency, 'daily');
  assert.equal(proseToChecks.agent_model, 'opus');
  assert.equal(proseToChecks.expected_outcome, 'open-pr');
  assert.deepEqual(proseToChecks.precondition_signals, []); // canon-local — no fleet, no windowed signal
});

test('prose-to-checks-sweep: fires daily (the worker no-ops on a dry corpus)', () => {
  assert.equal(proseToChecks.precondition().run, true);
});
