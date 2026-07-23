import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDelivery, pendingAgentic, heldStamp, maintenanceBranchName,
  openMaintenanceBranch, shouldRequestAgent,
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
