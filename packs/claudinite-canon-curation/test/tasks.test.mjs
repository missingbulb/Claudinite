import { test } from 'node:test';
import assert from 'node:assert/strict';
import promote from '../tasks/growth-promote/task.mjs';
import discover from '../tasks/growth-discover-packs/task.mjs';
import upstream from '../tasks/upstream-watch/task.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTaskDeclaration } from '../../claudinite-tasks/shared-code/task-contract.mjs';

const PACK_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

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

test('growth-promote: declaration is daily/opus/pr+nothing over the fleet signal', () => {
  assert.equal(promote.frequency, 'daily');
  assert.equal(promote.agent_model, 'opus');
  assert.equal(promote.expected_outcome, 'pr'); // owner-gated: its policy authorizes nothing to auto-merge
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

test('growth-discover-packs: declaration is weekly/opus/pr+nothing, fleet-reaching over the fleet signal', () => {
  assert.equal(discover.id, 'growth-discover-packs');
  assert.equal(discover.frequency, 'weekly');
  assert.equal(discover.agent_model, 'opus');
  assert.equal(discover.expected_outcome, 'pr'); // a new canon pack is owner-reviewed: its policy authorizes nothing to auto-merge
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

// --- upstream-watch (the shelf's own currency) --------------------------------
// The canon's answer to a pack that would otherwise schedule a watcher of its own:
// one task over the whole shelf, opted into per pack by an `## Upstream` section.

test('upstream-watch: a well-formed monthly, owner-gated declaration over no signal', () => {
  assert.deepEqual(validateTaskDeclaration(upstream), []);
  assert.equal(upstream.id, 'upstream-watch');
  assert.equal(upstream.frequency, 'monthly');
  assert.deepEqual(upstream.precondition_signals, []); // the trigger is the outside world
  assert.equal(upstream.expected_outcome, 'pr');
  assert.equal(upstream.automerge, 'nothing');         // canon content every member reads
  // The shelf is the whole subject, so this one needs no reach past an ordinary session.
  assert.equal(upstream.invocation_endpoint, undefined);
});

test('upstream-watch: runs unconditionally, binding the run to the packs that opted in', () => {
  const v = upstream.precondition();
  assert.equal(v.run, true);
  const context = v.context.join(' ');
  assert.match(context, /## Upstream/);
  assert.match(context, /Never edit a member repository/);
});

test('upstream-watch: the worker advances an anchor only for a source it read', () => {
  const worker = readFileSync(join(PACK_DIR, 'tasks/upstream-watch', upstream.agent_instructions), 'utf8');
  // An unread source must stay unread: the anchor is what the next run windows on,
  // so advancing it past what was covered silently skips a publication window.
  assert.match(worker, /never for one you skipped, and never past what you actually covered/);
  assert.match(worker, /never infer what it would have said/);
  // The scope is the shelf, and the two temptations it must refuse.
  assert.match(worker, /dependency versions/);
  assert.match(worker, /do not add one/);
});

test('the pack keeps exactly the three curation tasks', () => {
  assert.deepEqual(
    readdirSync(join(PACK_DIR, 'tasks')).sort(),
    ['growth-discover-packs', 'growth-promote', 'upstream-watch'],
  );
});
