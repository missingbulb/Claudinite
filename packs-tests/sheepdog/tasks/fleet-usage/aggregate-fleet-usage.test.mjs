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
  days: 7, captures: 10, merges: 8, sessionDays: 9, userMessages: 100, userCommands: 5, skillLoads: {},
  checks: {}, checkFindings: {}, ...over,
});
const scope = (over) => ({ runs: 0, failures: 0, errors: 0, blocking: 0, advisory: 0, ...over });

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

test('aggregate keeps the check activations at the same week x repo x rule grain', () => {
  // A rule's worth is a FLEET question, exactly as a skill's is: never firing in one
  // repo may just mean it is not that repo's subject. Only the full grain lets the
  // "fires nowhere" and "fires everywhere" readings be told apart afterwards.
  const file = aggregate({
    members: [
      member('owner/alpha', { '2026-W30': week({
        checks: { work: scope({ runs: 30, failures: 9, blocking: 11 }), world: scope({ runs: 12, failures: 1, blocking: 1, advisory: 40 }) },
        checkFindings: { 'task-lifecycle': { blocking: 8, advisory: 0 }, 'file-placement': { blocking: 0, advisory: 40 } },
      }) }),
      member('owner/beta', { '2026-W30': week({
        checks: { work: scope({ runs: 5, failures: 1, blocking: 1 }) },
        checkFindings: { 'task-lifecycle': { blocking: 1, advisory: 0 } },
      }) }),
    ],
    generatedAt: '2026-07-28',
  });
  assert.equal(file.weeks['2026-W30']['owner/alpha'].checks.world.failures, 1);
  assert.equal(file.weeks['2026-W30']['owner/beta'].checks.world, undefined, 'a scope that never ran there has no key');
  // Fleet-wide "how often did this rule catch something" stays derivable — the point
  // of not pre-summing.
  const fleetWide = Object.values(file.weeks['2026-W30'])
    .reduce((n, row) => n + (row.checkFindings['task-lifecycle']?.blocking ?? 0), 0);
  assert.equal(fleetWide, 9);
});

test('a member still on the older fold lands as empty check rows, never as an exception', () => {
  // Weeks are frozen once folded and the fleet sweep leads the members' upgrades, so
  // rows without `checks` are the normal case for a while, not a corruption.
  const older = { days: 7, captures: 10, merges: 8, sessionDays: 9, userMessages: 100, userCommands: 5, skillLoads: { a: 1 } };
  const file = aggregate({ members: [{ repo: 'owner/alpha', usage: { version: 1, foldedThrough: '2026-07-27', days: {}, weeks: { '2026-W30': older } } }], generatedAt: '2026-07-28' });
  assert.deepEqual(file.weeks['2026-W30']['owner/alpha'].checks, {});
  assert.deepEqual(file.weeks['2026-W30']['owner/alpha'].checkFindings, {});
  assert.equal(file.weeks['2026-W30']['owner/alpha'].captures, 10, 'and everything it DOES carry still lands');
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

test('a dormant member is out of the denominator and named as dormant, not as absent', () => {
  // "Not in the race" and "should be folding and isn't" are different facts, and
  // only the second is a problem to chase. Folding a dormant repo's silence into
  // the fleet numbers would drag every skill toward "never used" as the fleet
  // accumulates finished projects.
  const file = aggregate({
    members: [member('owner/alpha', { '2026-W30': week({}) })],
    absent: [`owner/beta (no ${MEMBER_USAGE_PATH} — not folding yet)`],
    dormant: ['owner/zeta'],
    generatedAt: '2026-07-28',
  });
  assert.deepEqual(file.coverage.folding, ['owner/alpha']);
  assert.deepEqual(file.coverage.dormant, ['owner/zeta']);
  assert.ok(!file.coverage.absent.some((a) => a.includes('owner/zeta')), 'dormant is not an absence');
  assert.equal(file.repos['owner/zeta'], undefined, 'and contributes no row to any number');
  // The common case — no dormant member — still reports the key, empty: a reader
  // must not have to tell "none" from "this file predates the idea".
  assert.deepEqual(aggregate({ members: [], generatedAt: '2026-07-28' }).coverage.dormant, []);
});

test('the file states its sampling population — it must not read as a census', () => {
  const file = aggregate({ members: [], generatedAt: '2026-07-28' });
  assert.equal(file._note, SAMPLING_NOTE);
  assert.match(file._note, /Captured sessions only/);
  assert.match(file._note, /Reclaimed containers and crashes are invisible/);
  // The checks carry a second, narrower boundary — a CI run counts only when the
  // session pulled its log in — and the file must say so where it is read.
  assert.match(file._note, /floor on activations, never an over-count/);
  assert.match(file._note, /pulled its job log in/);
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
