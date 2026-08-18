import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregate, inactiveToday, renderFleetFile, SAMPLING_NOTE, FLEET_USAGE_PATH, MEMBER_USAGE_PATH, FLEET_VERSION,
} from '../../../../packs/sheepdog/tasks/fleet-usage/aggregate-fleet-usage.mjs';
import { unchanged, renderUsageSummary } from '../../../../packs/sheepdog/tasks/fleet-usage/worker.mjs';
import task from '../../../../packs/sheepdog/tasks/fleet-usage/task.mjs';
import { USAGE_PATH } from '../../../../packs/grow_with_claudinite/tasks/usage-fold/worker.mjs';
// The sweep itself imports no format code — it copies members' rows through. These
// tests read a row back the way any consumer of the file does: with the header that
// member published beside its rows. The codec is imported here only to BUILD a
// realistic member fixture and to read one back, never by the code under test.
import {
  USAGE_FIELDS, decodeRow, encodeUsageFile,
} from '../../../../packs/grow_with_claudinite/tasks/usage-fold/usage-format.mjs';

const member = (repo, weeks, days = {}, foldedThrough = '2026-07-27') => ({
  repo, usage: { version: 1, foldedThrough, days, weeks },
});

// A member's row, read through the header that member published — `fields: null`
// means the member wrote fully-spelled objects, which are already the decoded shape.
const read = (file, repo, row, totals) => (file.repos[repo].fields === null
  ? row
  : decodeRow(row, file.repos[repo].fields[totals] ?? USAGE_FIELDS[totals], file.repos[repo].fields));
const weekRow = (file, week, repo) => read(file, repo, file.weeks[week]?.[repo], 'week');
const dayRow = (file, repo, date) => read(file, repo, file.days[repo]?.[date], 'day');
const week = (over) => ({
  days: 7, captures: 10, merges: 8, sessionDays: 9, userMessages: 100, userCommands: 5, skillLoads: {},
  checks: {}, checkFindings: {}, tasks: {}, ...over,
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
  assert.equal(weekRow(file, '2026-W30', 'owner/alpha').skillLoads['writing-tests'], 1);
  // The coarser views a consumer wants stay DERIVABLE, which is the point of the grain.
  const fleetWide = Object.keys(file.weeks['2026-W30'])
    .reduce((n, repo) => n + (weekRow(file, '2026-W30', repo).skillLoads['merge-to-main'] ?? 0), 0);
  assert.equal(fleetWide, 8);
});

test('aggregate carries each member\'s current day window, for the fast view', () => {
  const days = { '2026-07-28': { captures: 3, merges: 2, sessions: 2, userMessages: 31, userCommands: 4, skillLoads: { a: 1 } } };
  const file = aggregate({ members: [member('owner/alpha', {}, days)], generatedAt: '2026-07-28' });
  const row = dayRow(file, 'owner/alpha', '2026-07-28');
  assert.equal(row.captures, 3);
  assert.equal(row.sessions, 2);
  assert.equal(row.userMessages, 31);
  assert.deepEqual(row.skillLoads, { a: 1 });
});

test('aggregate keeps each member\'s task invocations at week x repo x task grain', () => {
  // A different population from everything else in the file: these came from each
  // member's retired SLOT SCHEDULER, not from a captured session. Nothing writes that
  // record any more (#974, #994), so the aggregation is kept for the rows members have
  // already folded and the file's note must say plainly that they are history — a
  // reader comparing them against a later period would read a dead source as a fleet
  // that stopped working.
  const taskRow = (over) => ({ agent: 0, code_work: 0, skipped: 0, failed: 0, deferred: 0, ...over });
  const file = aggregate({
    members: [
      member('owner/alpha', { '2026-W30': week({
        tasks: { 'tidy-repo/tidy-issues': taskRow({ agent: 7 }), 'grow_with_claudinite/usage-fold': taskRow({ code_work: 7, skipped: 161 }) },
      }) }),
      member('owner/beta', { '2026-W30': week({ tasks: { 'tidy-repo/tidy-issues': taskRow({ skipped: 7 }) } }) }),
      // A member still on an older fold carries no `tasks` key at all — it must land as
      // an empty row rather than an exception, because the sweep leads the upgrades.
      member('owner/gamma', { '2026-W30': week() }),
    ],
    generatedAt: '2026-07-28',
  });
  assert.equal(weekRow(file, '2026-W30', 'owner/alpha').tasks['tidy-repo/tidy-issues'].agent, 7);
  assert.equal(weekRow(file, '2026-W30', 'owner/beta').tasks['tidy-repo/tidy-issues'].agent, 0,
    'the same task did no agent work in the other member — visible, not absent');
  assert.deepEqual(weekRow(file, '2026-W30', 'owner/gamma').tasks, {});
  assert.match(file._note, /`tasks` rows are HISTORICAL/,
    'and the file says so — a reader must not compare them against a period after the retirement');
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
  assert.equal(weekRow(file, '2026-W30', 'owner/alpha').checks.world.failures, 1);
  assert.equal(weekRow(file, '2026-W30', 'owner/beta').checks.world, undefined, 'a scope that never ran there has no key');
  // Fleet-wide "how often did this rule catch something" stays derivable — the point
  // of not pre-summing.
  const fleetWide = Object.keys(file.weeks['2026-W30'])
    .reduce((n, repo) => n + (weekRow(file, '2026-W30', repo).checkFindings['task-lifecycle']?.blocking ?? 0), 0);
  assert.equal(fleetWide, 9);
});

test('a member still on the older fold lands as empty check rows, never as an exception', () => {
  // Weeks are frozen once folded and the fleet sweep leads the members' upgrades, so
  // rows without `checks` are the normal case for a while, not a corruption.
  const older = { days: 7, captures: 10, merges: 8, sessionDays: 9, userMessages: 100, userCommands: 5, skillLoads: { a: 1 } };
  const file = aggregate({ members: [{ repo: 'owner/alpha', usage: { version: 1, foldedThrough: '2026-07-27', days: {}, weeks: { '2026-W30': older } } }], generatedAt: '2026-07-28' });
  assert.equal(weekRow(file, '2026-W30', 'owner/alpha').checks, undefined);
  assert.equal(weekRow(file, '2026-W30', 'owner/alpha').captures, 10, 'and everything it DOES carry still lands');
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
  // The keys this sweep OWNS are sorted; a row's own key order is the member's, and
  // sorting it here would be a rewrite of a file this repo does not write.
  assert.deepEqual(Object.keys(JSON.parse(a).weeks), ['2026-W30', '2026-W31']);
  assert.deepEqual(Object.keys(JSON.parse(a).weeks['2026-W31']['owner/beta'].skillLoads), ['zeta', 'alpha']);
});

test('each member publishes the vocabulary its own rows are spelled in', () => {
  // The sweep copies rows it does not understand, so the file has to say how to read
  // each repo's — otherwise a positional row is unreadable by anything but the code
  // that wrote it. The answer is per repo, because the fleet is permanently
  // mid-upgrade: members converge on their own nightly cadence.
  const rows = { '2026-W30': week({ skillLoads: { 'merge-to-main': 4 }, checks: { work: scope({ runs: 30, failures: 9 }) } }) };
  const file = aggregate({
    members: [
      member('owner/alpha', rows),                                                        // fully-spelled objects
      { repo: 'owner/beta', usage: encodeUsageFile({ foldedThrough: '2026-07-27', weeks: rows, days: {} }) },
    ],
    generatedAt: '2026-07-28',
  });
  assert.equal(file.repos['owner/alpha'].format, 1);
  assert.equal(file.repos['owner/alpha'].fields, null, 'nothing to declare — the rows name their own fields');
  assert.equal(file.repos['owner/beta'].format, 2);
  assert.deepEqual(file.repos['owner/beta'].fields.checks, [...USAGE_FIELDS.checks]);

  // Read through their own headers, both members say the same thing.
  for (const repo of ['owner/alpha', 'owner/beta']) {
    assert.equal(weekRow(file, '2026-W30', repo).skillLoads['merge-to-main'], 4);
    assert.equal(weekRow(file, '2026-W30', repo).checks.work.failures, 9);
  }
  const tuple = file.weeks['2026-W30']['owner/beta'].checks.work;
  assert.ok(Array.isArray(tuple), "and the newer member's rows really are positional");
});

test("a member's rows are copied, never restated in another vocabulary", () => {
  // The sweep must not be able to reinterpret a repo's numbers. A member carrying a
  // counter this sweep has never heard of keeps it; one missing a counter the others
  // have does not gain a fabricated zero.
  const exotic = {
    version: 2,
    foldedThrough: '2026-07-27',
    fields: { week: ['days', 'captures', 'somethingNew'] },
    days: {},
    weeks: { '2026-W30': { totals: [7, 10, 42] } },
  };
  const file = aggregate({ members: [{ repo: 'owner/alpha', usage: exotic }], generatedAt: '2026-07-28' });
  assert.deepEqual(file.weeks['2026-W30']['owner/alpha'], exotic.weeks['2026-W30'], "byte-for-byte the member's row");
  assert.deepEqual(file.repos['owner/alpha'].fields, exotic.fields);
  assert.equal(weekRow(file, '2026-W30', 'owner/alpha').somethingNew, 42);
  assert.ok(!('userMessages' in weekRow(file, '2026-W30', 'owner/alpha')),
    'a counter the member never carried stays absent, not zero');
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

test('coverage accounts for the whole fleet — uncovered and out-of-scope repos are named', () => {
  const file = aggregate({
    members: [member('owner/alpha', { '2026-W30': week({}) })],
    uncovered: ['owner/naked'],
    outOfScope: ['owner/attic (archived)', 'owner/copy (fork)', 'owner/left-out (excluded)'],
    generatedAt: '2026-07-28',
  });
  assert.deepEqual(file.coverage.uncovered, ['owner/naked']);
  assert.deepEqual(file.coverage.outOfScope, ['owner/attic (archived)', 'owner/copy (fork)', 'owner/left-out (excluded)']);
  assert.equal(file.repos['owner/naked'], undefined, 'named, but contributing to no number');
  // The common case — nothing uncovered, nothing out of scope — still reports the
  // keys, empty: a reader must not have to tell "none" from "predates the idea".
  const bare = aggregate({ members: [], generatedAt: '2026-07-28' });
  assert.deepEqual(bare.coverage.uncovered, []);
  assert.deepEqual(bare.coverage.outOfScope, []);
});

test('inactiveToday: a folding member with no day row for the generation date', () => {
  const activeDays = { '2026-07-28': { captures: 3 } };
  const staleDays2 = { '2026-07-20': { captures: 1 } };
  const file = aggregate({
    members: [member('owner/alpha', {}, activeDays), member('owner/beta', {}, staleDays2), member('owner/gamma', {})],
    dormant: ['owner/zeta'],
    generatedAt: '2026-07-28',
  });
  assert.deepEqual(inactiveToday(file), ['owner/beta', 'owner/gamma'],
    'quiet-today and never-active members are inactive; a dormant repo is not counted — it is not folding at all');
});

test('inactiveToday is derived, never stored — the file must stay date-stamp-insensitive', () => {
  // The worker's `unchanged` ignores only generatedAt; a stored inactive-today list
  // would move with the date alone and reopen the delivery PR every midnight.
  const file = aggregate({ members: [member('owner/alpha', {})], generatedAt: '2026-07-28' });
  assert.equal(file.inactiveToday, undefined);
  assert.equal(file.coverage.inactiveToday, undefined);
});

test('the run summary names every repo, whatever its state, and flags inactive-today', () => {
  const file = aggregate({
    members: [member('owner/alpha', {}, { '2026-07-28': { captures: 1 } }), member('owner/beta', {})],
    absent: ['owner/gap (no file — not folding yet)'],
    dormant: ['owner/zeta'],
    uncovered: ['owner/naked'],
    outOfScope: ['owner/attic (archived)'],
    generatedAt: '2026-07-28',
  });
  const out = renderUsageSummary(file);
  for (const repo of ['owner/alpha', 'owner/beta', 'owner/gap', 'owner/zeta', 'owner/naked', 'owner/attic']) {
    assert.ok(out.includes(repo), `${repo} must be named in the summary`);
  }
  assert.match(out, /inactive today \(no captured activity on 2026-07-28\).*owner\/beta/);
  assert.match(out, /\*\*Folding, active today:\*\* owner\/alpha/);
});

test('the fleet file is written one line per row, and parses back to what went in', () => {
  const file = aggregate({
    members: [
      member('owner/alpha', { '2026-W30': week({ skillLoads: { a: 1 } }) }, { '2026-07-28': { captures: 3 } }),
      member('owner/beta', {}, {}),
    ],
    absent: ['owner/gamma (no file)'],
    generatedAt: '2026-07-28',
  });
  const text = renderFleetFile(file);
  assert.deepEqual(JSON.parse(text), file, 'whatever the whitespace, it is the same document');
  const lines = text.split('\n');
  assert.equal(lines.filter((l) => l.startsWith('      "2026-07-28"')).length, 1, 'one line per day row');
  assert.ok(lines.some((l) => l.startsWith('      "owner/alpha"')), 'and one per week x repo row');
  assert.ok(lines.some((l) => l.includes('"owner/beta": {}')), 'a member with no rows is written inline');
  assert.ok(text.endsWith('}\n'));
});
