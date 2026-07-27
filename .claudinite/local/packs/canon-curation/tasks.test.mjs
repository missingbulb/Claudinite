import { test } from 'node:test';
import assert from 'node:assert/strict';
import promote from './tasks/growth-promote/task.mjs';
import discover from './tasks/growth-discover-packs/task.mjs';

// The canon-curation fleet-scoped task preconditions (per-project-scheduling
// DESIGN §6 table 2): growth-promote reads which members changed their local
// packs, growth-discover-packs sweeps the members' stacks for technologies the
// canon does not home. (prose-to-checks-sweep moved to grow_with_claudinite as a
// per-repo task, and migrations-retire became a canon-local TTL archiver.)
// Each precondition is pure over the collected signals, so it tests directly
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

// --- growth-discover-packs (the FLEET sweep) ---------------------------------
// Not to be confused with its per-repo namesake in grow_with_claudinite, which
// authors a repo's own LOCAL packs. This one is the central canon-gap sweep.

test('growth-discover-packs: declaration is weekly/opus/open-pr, fleet-scoped over the fleet signal', () => {
  assert.equal(discover.id, 'growth-discover-packs');
  assert.equal(discover.frequency, 'weekly');
  assert.equal(discover.agent_model, 'opus');
  assert.equal(discover.expected_outcome, 'open-pr'); // a new canon pack is owner-reviewed, never auto-merged
  assert.equal(discover.session_scope, 'fleet');      // routed to the ready-for-agent-fleet executor
  assert.deepEqual(discover.precondition_signals, ['fleet']);
});

test('growth-discover-packs: sweeps every covered member, binding them as Context', () => {
  const v = discover.precondition({ fleet: { members: [
    member({ repo: 'acme/a', localPacksChanged: false }),          // no window trigger — the opportunity is standing
    member({ repo: 'acme/b', activePacks: ['basics'], hasLocalPacks: false }), // not a growth participant — still swept
  ] } });
  assert.equal(v.run, true);
  assert.match(v.context.join(' '), /acme\/a/);
  assert.match(v.context.join(' '), /acme\/b/);
  assert.match(v.context.join(' '), /do not enumerate the fleet yourself/i);
});

test('growth-discover-packs: skips a member that declares no packs', () => {
  const v = discover.precondition({ fleet: { members: [member({ repo: 'acme/bare', activePacks: [] })] } });
  assert.equal(v.run, false);
});

test('growth-discover-packs: skips when there is no fleet signal or the enumeration errored', () => {
  assert.equal(discover.precondition({ fleet: null }).run, false);
  assert.equal(discover.precondition({ fleet: { error: 'wrong token' } }).run, false);
  assert.equal(discover.precondition({ fleet: { members: [] } }).run, false);
});
