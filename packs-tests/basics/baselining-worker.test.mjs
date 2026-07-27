import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDelivery, resolveDelivery, DEFAULT_DELIVERY, pendingAgentic, heldStamp,
  maintenanceBranchName, openMaintenanceBranch, shouldRequestAgent, unconfiguredSecrets,
  SECRETS_ISSUE_TITLE,
} from '../../packs/basics/tasks/baselining/worker.mjs';

// The worker's PURE decision helpers (agent-preprocessing DESIGN §7, E4). The
// native-git / clone / REST I/O in main() is validated by the live pilot; these
// are the git-free unit surface.

test('normalizeDelivery maps the accepted values and legacy aliases, rejecting the rest', () => {
  assert.equal(normalizeDelivery('auto-merge'), 'auto-merge');
  assert.equal(normalizeDelivery('auto'), 'auto-merge');   // legacy alias
  assert.equal(normalizeDelivery('push'), 'auto-merge');   // legacy alias
  assert.equal(normalizeDelivery('review'), 'review');
  assert.equal(normalizeDelivery('pr'), 'review');         // legacy alias
  assert.equal(normalizeDelivery(' review '), 'review');   // trimmed
  assert.equal(normalizeDelivery('bogus'), null);
  assert.equal(normalizeDelivery(undefined), null);
});

// A MISSING maintenance.delivery is drift, not an error: the only writer is
// check_the_world --init (first adoption), so a repo adopted before the key existed
// — or one whose key was hand-removed — has nothing that could ever put it back,
// and a hard failure would just fail baselining every night forever. Materialize
// the default instead. An UNRECOGNIZED value stays a hard failure: substituting a
// default there would deliver the opposite of a stated intent.
test('resolveDelivery materializes the default for a missing key rather than failing the run', () => {
  assert.deepEqual(resolveDelivery(undefined), { delivery: DEFAULT_DELIVERY, materialize: true });
  assert.deepEqual(resolveDelivery(null), { delivery: DEFAULT_DELIVERY, materialize: true });
  assert.equal(DEFAULT_DELIVERY, 'auto-merge');
});

test('resolveDelivery treats a content-free value as absent, not as a typo', () => {
  assert.deepEqual(resolveDelivery(''), { delivery: DEFAULT_DELIVERY, materialize: true });
  assert.deepEqual(resolveDelivery('   '), { delivery: DEFAULT_DELIVERY, materialize: true });
});

test('resolveDelivery passes a stated intent through untouched — legacy aliases included', () => {
  assert.deepEqual(resolveDelivery('review'), { delivery: 'review', materialize: false });
  assert.deepEqual(resolveDelivery('auto-merge'), { delivery: 'auto-merge', materialize: false });
  assert.deepEqual(resolveDelivery('pr'), { delivery: 'review', materialize: false });
  assert.deepEqual(resolveDelivery('push'), { delivery: 'auto-merge', materialize: false });
  assert.deepEqual(resolveDelivery('auto'), { delivery: 'auto-merge', materialize: false });
});

test('resolveDelivery still fails the run on an unrecognized value — never a silent default', () => {
  assert.deepEqual(resolveDelivery('bogus'), { delivery: null, materialize: false });
  assert.deepEqual(resolveDelivery('merge'), { delivery: null, materialize: false });
});

test('pendingAgentic keeps notes dated on/after the stamp DAY (same-day inclusive), oldest first', () => {
  const notes = [
    { id: 'newer', landed: '2026-07-25' },
    { id: 'sameday', landed: '2026-07-18' },
    { id: 'older', landed: '2026-07-10' },
  ];
  const pending = pendingAgentic(notes, '2026-07-18T09:00:00.000Z');
  assert.deepEqual(pending.map((n) => n.id), ['sameday', 'newer']); // 'older' dropped; sorted asc
});

test('pendingAgentic with no prior stamp returns all, sorted oldest first', () => {
  const notes = [{ id: 'b', landed: '2026-07-20' }, { id: 'a', landed: '2026-07-01' }];
  assert.deepEqual(pendingAgentic(notes, undefined).map((n) => n.id), ['a', 'b']);
  assert.deepEqual(pendingAgentic([], '2026-07-01').length, 0);
});

test('heldStamp is the day BEFORE the earliest pending note; null when nothing pends', () => {
  assert.equal(heldStamp([{ id: 'x', landed: '2026-07-19' }]), '2026-07-18T00:00:00.000Z');
  // month boundary: the day before the 1st is the previous month's last day
  assert.equal(heldStamp([{ id: 'y', landed: '2026-08-01' }]), '2026-07-31T00:00:00.000Z');
  assert.equal(heldStamp([]), null);
});

test('maintenanceBranchName carries the prefix, date, and seed', () => {
  assert.equal(maintenanceBranchName('2026-07-23', 'ab12cd'), 'claudinite/maintenance-2026-07-23-ab12cd');
});

test('openMaintenanceBranch finds an open PR head by prefix, else null', () => {
  const pulls = [{ head: { ref: 'feature/x' } }, { head: { ref: 'claudinite/maintenance-2026-07-23-zz' } }];
  assert.equal(openMaintenanceBranch(pulls), 'claudinite/maintenance-2026-07-23-zz');
  assert.equal(openMaintenanceBranch([{ head: { ref: 'other' } }]), null);
  assert.equal(openMaintenanceBranch([]), null);
  assert.equal(openMaintenanceBranch(undefined), null);
});

test('shouldRequestAgent: agent iff a pending note, or a change left non-green', () => {
  assert.equal(shouldRequestAgent({ pendingCount: 1, meaningfulChange: false, checksPass: true }), true);  // agentic note
  assert.equal(shouldRequestAgent({ pendingCount: 0, meaningfulChange: true, checksPass: false }), true);  // change, not green
  assert.equal(shouldRequestAgent({ pendingCount: 0, meaningfulChange: true, checksPass: true }), false);  // change, green → agentless
  assert.equal(shouldRequestAgent({ pendingCount: 0, meaningfulChange: false, checksPass: false }), false); // no change → agentless
});

// --- required_secrets ask (agent-preprocessing DESIGN §9) --------------------
// The wiring converge stamps every declared name into the workflow, so by the time
// the worker runs the value is either in the environment or genuinely unset. That
// makes the ask a plain env read — no probe, no bundle, no engine-side machinery.

test('unconfiguredSecrets: a stamped-and-set secret is not asked about', () => {
  assert.deepEqual(unconfiguredSecrets(['SOME_API_KEY'], { SOME_API_KEY: 'v' }), []);
});

test('unconfiguredSecrets: an unset name is asked about — and so is the empty string Actions renders for one', () => {
  assert.deepEqual(unconfiguredSecrets(['SOME_API_KEY'], {}), ['SOME_API_KEY']);
  assert.deepEqual(unconfiguredSecrets(['SOME_API_KEY'], { SOME_API_KEY: '' }), ['SOME_API_KEY']);
});

test('unconfiguredSecrets: reports only the missing ones, and nothing when none are declared', () => {
  assert.deepEqual(unconfiguredSecrets(['A', 'B'], { A: 'set' }), ['B']);
  assert.deepEqual(unconfiguredSecrets([], { A: 'set' }), []);
  assert.deepEqual(unconfiguredSecrets(undefined, {}), []);
});

test('the ask issue title is a stable exact-match key (the at-most-one-open guard depends on it)', () => {
  assert.equal(SECRETS_ISSUE_TITLE, 'Claudinite: configure required Actions secrets');
});
