// THE FORCED WAKE PLANS OVER A QUEUE THAT DOES NOT YET CONTAIN WHAT THIS RUN
// JUST WROTE. Same eventual consistency as the drain gate's (#1340), one site
// later in the same function, and a miss here is not a skipped dispatch but a
// duplicate write: the block re-reads the queue, fails to see the standing item
// the ops above filed seconds earlier, and mints a second one beside it. On
// Shepherd a forced `acme-pack-b/acme-task-c` filed #577 and then #582
// fifteen seconds later, and both claimed an executor (#1979).
//
// So the wake's view is a UNION, exactly as the gate's verdict is: what the list
// returns, plus what this run itself created — and the second needs no read to
// confirm it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planWake, withOwnWrites } from '../../src/schedule/run.mjs';
import { normalizeTaskDeclaration } from '../../src/contract/task-contract.mjs';

const task = {
  pack: 'acme-pack-b',
  id: 'acme-task-c',
  taskPath: '.claudinite/shared/packs/acme-pack-b/tasks/acme-task-c/task.md',
  decl: normalizeTaskDeclaration({ trigger: 'schedule', preconditions: ['due:daily'] }),
};

// What the ops loop records for an item it just created, in the shape
// `listWorkItems` projects — the two are read by the same planner.
const minted = {
  number: 577,
  title: '[claudinite-work] acme-pack-b/acme-task-c',
  body: `${task.taskPath}\n\nExecute the Claudinite task above.\n`,
  state: 'open',
  labels: ['task:origin:planned', 'task:status:waiting-for-executor'],
};

// The item this run filed is `waiting-for-executor`, which IS `STATUS_READY` — in
// flight — so the right answer is to leave it alone. What the stale read produced
// instead was a second standing item, filed fifteen seconds after the first.
test('a forced wake sees the standing item this run just filed, unseen by the list read', () => {
  const stale = []; // the read has not caught up
  const { create, already } = planWake('acme-pack-b/acme-task-c', [task], withOwnWrites(stale, [minted]));
  assert.deepEqual(create, [], 'the force minted a second standing item beside the one this run just filed');
  assert.deepEqual(already.map((a) => a.issue), [577], 'the force did not see the item this run filed');
});

// A force must still reach a standing item that is NOT in flight — the parked one
// the union now also carries into view.
test('a forced wake still wakes a parked item this run just filed', () => {
  const parked = { ...minted, labels: ['task:origin:planned', 'task:status:needs-human-failure'] };
  const { wake, create } = planWake('acme-pack-b/acme-task-c', [task], withOwnWrites([], [parked]));
  assert.deepEqual(create, [], 'the force minted an item beside the parked one');
  assert.deepEqual(wake.map((w) => w.issue), [577], 'the force did not wake the parked item');
});

test('an item both listed and created by this run appears once', () => {
  const merged = withOwnWrites([minted], [minted]);
  assert.equal(merged.length, 1, 'the union double-counted an item the read did return');
});

// The union only ADDS what the read missed: a read that is ahead of this run's
// own record — an item readied or closed between the two — still wins, because
// it is the later truth about an issue this run is not writing to.
test('the list read is left intact where it and the run both name an item', () => {
  const listed = { ...minted, labels: ['task:origin:planned', 'task:ready'] };
  const [only] = withOwnWrites([listed], [minted]);
  assert.deepEqual(only.labels, listed.labels, 'the run\'s own record overwrote a fresher read');
});
