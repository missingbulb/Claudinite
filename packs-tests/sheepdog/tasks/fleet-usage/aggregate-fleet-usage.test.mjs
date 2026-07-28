import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregate, SAMPLING_NOTE, FLEET_USAGE_PATH, MEMBER_USAGE_PATH, FLEET_VERSION,
} from '../../../../packs/sheepdog/tasks/fleet-usage/aggregate-fleet-usage.mjs';
import { unchanged } from '../../../../packs/sheepdog/tasks/fleet-usage/worker.mjs';
import task from '../../../../packs/sheepdog/tasks/fleet-usage/task.mjs';
import { USAGE_PATH } from '../../../../packs/grow_with_claudinite/tasks/usage-fold/worker.mjs';

const member = (repo, weeks, days = {}, foldedThrough = '2026-07-27') => ({
  repo, usage: { version: 1, foldedThrough, days, weeks },
});
const week = (over) => ({
  days: 7, captures: 10, merges: 8, sessionDays: 9, userMessages: 100, userCommands: 5, skillLoads: {}, ...over,
});

test('the sweep reads the member file the fold actually writes', () => {
  // Two packs, no shared import: the fold writes this path in a member repo and the
  // sweep reads it across the fleet. A rename on either side would make the sweep
  // report the whole fleet as "not folding yet" — a plausible-looking, entirely wrong
  // answer. This is the guard that turns that into a failing test.
  assert.equal(MEMBER_USAGE_PATH, USAGE_PATH);
});

test('aggregate keeps full week x repo x skill grain — nothing pre-summed', () => {
  const file = aggregate({
    members: [
      member('owner/alpha', { '2026-W30': week({ skillLoads: { 'merge-to-main': 6, 'writing-tests': 1 } }) }),
      member('owner/beta', { '2026-W30': week({ skillLoads: { 'merge-to-main': 2 } }), '2026-W31': week({}) }),
    ],
    generatedAt: '2026-07-28',
  });
  assert.deepEqual(Object.keys(file.weeks), ['2026-W30', '2026-W31']);
  assert.deepEqual(Object.keys(file.weeks['2026-W30']), ['owner/alpha', 'owner/beta']);
  assert.equal(file.weeks['2026-W30']['owner/alpha'].skillLoads['writing-tests'], 1);
  // The coarser views a consumer wants stay DERIVABLE, which is the point of the grain.
  const fleetWide = Object.values(file.weeks['2026-W30'])
    .reduce((n, row) => n + (row.skillLoads['merge-to-main'] ?? 0), 0);
  assert.equal(fleetWide, 8);
});

test('aggregate carries each member\'s current day window verbatim, for the fast view', () => {
  const days = { '2026-07-28': { captures: 3, merges: 2, sessions: 2, userMessages: 31, userCommands: 4, skillLoads: { a: 1 } } };
  const file = aggregate({ members: [member('owner/alpha', {}, days)], generatedAt: '2026-07-28' });
  assert.deepEqual(file.days['owner/alpha'], days);
});

test('a member without a usage file is a reported COVERAGE GAP, never a silent skip', () => {
  const file = aggregate({
    members: [member('owner/alpha', { '2026-W30': week({}) })],
    absent: [`owner/beta (no ${MEMBER_USAGE_PATH} — not folding yet)`, 'owner/gamma (reading it returned 500)'],
    generatedAt: '2026-07-28',
  });
  assert.deepEqual(file.coverage.folding, ['owner/alpha']);
  assert.equal(file.coverage.absent.length, 2);
  assert.match(file.coverage.absent.join(' '), /not folding yet/);
  assert.match(file.coverage.absent.join(' '), /returned 500/, 'an unreadable file states WHY it is absent');
});

test('the file states its sampling population — it must not read as a census', () => {
  const file = aggregate({ members: [], generatedAt: '2026-07-28' });
  assert.equal(file._note, SAMPLING_NOTE);
  assert.match(file._note, /Captured sessions only/);
  assert.match(file._note, /Reclaimed containers and crashes are invisible/);
  assert.equal(file.version, FLEET_VERSION);
});

test('aggregate is a pure stateless recompute — same inputs, byte-identical output', () => {
  const members = [
    member('owner/beta', { '2026-W31': week({ skillLoads: { zeta: 1, alpha: 1 } }) }),
    member('owner/alpha', { '2026-W30': week({}) }),
  ];
  const a = JSON.stringify(aggregate({ members, generatedAt: '2026-07-28' }), null, 2);
  const b = JSON.stringify(aggregate({ members: [...members].reverse(), generatedAt: '2026-07-28' }), null, 2);
  assert.equal(a, b, 'member order must not change the file — sorted keys throughout');
  assert.deepEqual(Object.keys(JSON.parse(a).weeks['2026-W31']['owner/beta'].skillLoads), ['alpha', 'zeta']);
});

test('unchanged ignores the day stamp — an unmoved fleet opens no PR', () => {
  const prior = JSON.stringify(aggregate({ members: [member('owner/alpha', { '2026-W30': week({}) })], generatedAt: '2026-07-27' }), null, 2);
  const same = JSON.stringify(aggregate({ members: [member('owner/alpha', { '2026-W30': week({}) })], generatedAt: '2026-07-28' }), null, 2);
  const moved = JSON.stringify(aggregate({ members: [member('owner/alpha', { '2026-W30': week({ captures: 11 }) })], generatedAt: '2026-07-28' }), null, 2);
  assert.equal(unchanged(prior, same), true, 'only generatedAt moved — nothing to deliver');
  assert.equal(unchanged(prior, moved), false);
  assert.equal(unchanged(null, same), false, 'no prior file at all means there IS something to deliver');
  assert.equal(unchanged('{ not json', same), false, 'an unreadable prior is regenerated, not assumed equal');
});

test('fleet-usage: daily/agentless/merged-pr over the fleet PAT, wired as an ordinary pack task', () => {
  assert.equal(task.id, 'fleet-usage');
  assert.equal(task.frequency, 'daily');
  assert.equal(task.agent_model, 'none');
  assert.equal(task.expected_outcome, 'merged-pr');
  assert.deepEqual(task.required_secrets, ['FLEET_GITHUB_TOKEN']);
  assert.equal(task.precondition().run, true, 'every input lives outside this repo — the answer IS the run');
  // The cross-repo reach lives in the implementation, never in the wiring: no fleet
  // signal, no fleet session scope (per-project-scheduling DESIGN §6).
  assert.deepEqual(task.precondition_signals, []);
  assert.equal(task.session_scope, undefined);
  assert.ok(FLEET_USAGE_PATH.includes('GENERATED'), 'a machine-written file says so in its name');
});
