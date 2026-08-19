import { test } from 'node:test';
import assert from 'node:assert/strict';
import promote from './tasks/growth-promote/task.mjs';
import discover from './tasks/growth-discover-packs/task.mjs';

// The canon-curation fleet-scoped task preconditions (per-project-scheduling
// DESIGN §6 table 2): growth-promote reads which members changed their local
// packs, growth-discover-packs sweeps the members' stacks for technologies the
// canon does not home. (prose-to-checks-sweep moved to claudinite-growth as a
// per-repo task; migration records need no curation task at all — they are kept
// forever, and vendoring's recency window decides what ships.)
// Each precondition is pure over the collected signals, so it tests directly
// against a fabricated `fleet` signal.

const member = (over = {}) => ({
  repo: 'acme/app', defaultBranch: 'main',
  activePacks: ['claudinite-growth'], packConfigs: {},
  hasLocalPacks: true, localPacksChanged: true, stamp: null, schedulesItself: false,
  ...over,
});

// --- growth-promote ----------------------------------------------------------

test('growth-promote: declaration is daily/opus/open-pr over the fleet signal', () => {
  assert.equal(promote.frequency, 'daily');
  assert.equal(promote.agent_model, 'opus');
  assert.equal(promote.expected_outcome, 'open-pr'); // owner-gated, never auto-merged
  assert.deepEqual(promote.precondition_signals, ['fleet']);
  // Same as discover: reach is the endpoint the hand-off calls, and this task reads
  // every member's local packs.
  assert.equal(promote.invocation_endpoint, 'fleet');
  assert.equal(promote.session_scope, undefined, 'session_scope lost its last reader with the slot scheduler');
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
    member({ repo: 'acme/opt', packConfigs: { 'claudinite-growth': { promote: false } } }),
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
// Not to be confused with its per-repo namesake in claudinite-growth, which
// authors a repo's own LOCAL packs. This one is the central canon-gap sweep.

test('growth-discover-packs: declaration is weekly/opus/open-pr, fleet-reaching over the fleet signal', () => {
  assert.equal(discover.id, 'growth-discover-packs');
  assert.equal(discover.frequency, 'weekly');
  assert.equal(discover.agent_model, 'opus');
  assert.equal(discover.expected_outcome, 'open-pr'); // a new canon pack is owner-reviewed, never auto-merged
  // Reach is which endpoint the hand-off calls, and nothing else — this task reads
  // every member's tree, which an ordinary session in this repo does not.
  assert.equal(discover.invocation_endpoint, 'fleet');
  assert.equal(discover.session_scope, undefined, 'session_scope lost its last reader with the slot scheduler');
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
