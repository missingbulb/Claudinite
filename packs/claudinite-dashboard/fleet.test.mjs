import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summariseMember, summariseRuns, mountState, rankMembers, rollUp, packSpread, taskSpread,
  ciStatus, MOUNT_STALE_MS,
} from '../../packs/claudinite-dashboard/fleet.mjs';
import {
  BLOCKED, READY, EXECUTING, AGENT, NEEDS_HUMAN,
  OUTCOME_DONE, OUTCOME_DELIVERED, OUTCOME_OBSOLETE,
} from '../../engine/scheduler/queue/work-item.mjs';

const NOW = Date.parse('2026-08-17T12:00:00Z');
const CANON = { repo: 'o/canon', ref: 'canonsha', engineVersion: 4 };

const decl = (over = {}) => ({
  packs: ['claudinite-lifecycle', 'basics'],
  taskScheduler: { dailyHour: 4 },
  claudinite: { ref: 'canonsha', engineVersion: 4, updated: '2026-08-17T00:00:00Z' },
  ...over,
});

const item = (over = {}) => ({
  number: 1,
  title: '[claudinite-work] basics/task-janitor',
  body: 'packs/basics/tasks/task-janitor/task.md\n',
  state: 'open',
  labels: [READY],
  created_at: '2026-08-17T04:00:00Z',
  updated_at: '2026-08-17T04:00:00Z',
  closed_at: null,
  comments: 0,
  ...over,
});

const read = (over = {}) => ({
  repo: 'o/a',
  declaration: decl(),
  items: [],
  runs: [],
  paths: ['packs/basics/tasks/task-janitor/task.mjs'],
  ...over,
});

// --- the three absences are three different answers -----------------------------

test('an unreadable member is its own state, not a broken one', () => {
  const s = summariseMember({ repo: 'o/a', error: { status: 404 } }, { now: NOW });
  assert.equal(s.status, 'unreadable');
  assert.match(s.reasons[0].text, /not visible to you/);
  // A repo you cannot see is a permissions fact, not an alarm — it must not compete
  // with a genuinely broken member for attention.
  assert.equal(s.level, 'info');
});

test('read failures are described by their cause', () => {
  const at = (status) => summariseMember({ repo: 'o/a', error: { status } }, { now: NOW }).reasons[0].text;
  assert.match(at(403), /forbidden/);
  assert.match(at(401), /credential was rejected/);
  assert.match(summariseMember({ repo: 'o/a', error: { message: 'boom' } }, { now: NOW }).reasons[0].text, /boom/);
});

test('a repo that does not run Claudinite is not-adopted, never zero-everything', () => {
  const s = summariseMember({ repo: 'o/a', declaration: null }, { now: NOW });
  assert.equal(s.status, 'not-adopted');
  assert.equal(s.level, 'info');
  assert.equal(s.open, undefined, 'it reports no counts at all rather than misleading zeros');
});

test('a healthy adopted member has no reasons and reads ok', () => {
  const s = summariseMember(read({ items: [item()] }), { now: NOW, canon: CANON });
  assert.equal(s.status, 'adopted');
  assert.equal(s.level, 'ok');
  assert.deepEqual(s.reasons, []);
});

// --- attention is earned ---------------------------------------------------------

test('a parked item is critical and names itself', () => {
  const s = summariseMember(read({ items: [item({ labels: [NEEDS_HUMAN] })] }), { now: NOW, canon: CANON });
  assert.equal(s.level, 'critical');
  assert.equal(s.parked, 1);
  assert.match(s.reasons[0].text, /parked for a human/);
});

test('an item past its leash is serious, and counted apart from parked', () => {
  const stale = new Date(NOW - 5 * 3600e3).toISOString();
  const s = summariseMember(read({ items: [item({ labels: [EXECUTING], updated_at: stale })] }), { now: NOW, canon: CANON });
  assert.equal(s.level, 'serious');
  assert.equal(s.warned, 1);
  assert.equal(s.parked, 0);
});

// One red run is noise; a run of them is a member that has stopped working, and the
// two must not read the same.
test('a single scheduler failure is serious and a streak is critical', () => {
  const runs = (concs) => concs.map((conclusion, i) => ({
    event: 'schedule', status: 'completed', conclusion,
    created_at: new Date(NOW - i * 3600e3).toISOString(),
  }));
  // The member must otherwise be healthy, or another rule supplies the level and the
  // assertion passes without the run signal doing anything.
  const at = (concs) => summariseMember(
    read({ items: [item()], runs: runs(concs) }), { now: NOW, canon: CANON },
  ).level;
  assert.equal(at(['failure', 'success']), 'serious');
  assert.equal(at(['failure', 'failure']), 'critical');
  assert.equal(at(['success', 'failure']), 'ok', 'an older failure below a success is spent');
});

// The signal no per-repo page can show you: the scheduler was never wired up at all.
test('declared tasks with no work item ever is surfaced', () => {
  const s = summariseMember(read({ items: [], paths: ['packs/basics/tasks/task-janitor/task.mjs'] }), { now: NOW, canon: CANON });
  assert.equal(s.level, 'serious');
  assert.match(s.reasons.find((r) => /no work item/.test(r.text)).text, /1 task declared/);
});

test('a member declaring no tasks is not accused of never running them', () => {
  const s = summariseMember(read({ items: [], paths: [] }), { now: NOW, canon: CANON });
  assert.equal(s.declaredTasks, 0);
  assert.equal(s.reasons.find((r) => /no work item/.test(r.text)), undefined);
});

// --- mount freshness -------------------------------------------------------------

test('a matching ref is current', () => {
  assert.equal(mountState({ ref: 'canonsha', engineVersion: 4 }, CANON).state, 'current');
});

test('an older engine version outranks merely being behind', () => {
  assert.equal(mountState({ ref: 'old', engineVersion: 3 }, CANON).state, 'behind-engine');
  assert.equal(mountState({ ref: 'old', engineVersion: 4 }, CANON).state, 'behind');
});

// The rule this encodes: a held stamp pins `updated` behind a pending note while the
// mount converges normally, so freshness is judged on ref/engineVersion — never on
// `updated` alone.
test('a stale updated date never makes a ref-matching mount look behind', () => {
  const ancient = { ref: 'canonsha', engineVersion: 4, updated: '2026-01-01T00:00:00Z' };
  assert.equal(mountState(ancient, CANON, NOW).state, 'current');
});

test('with no canon configured freshness is unknown, not current', () => {
  const s = mountState({ ref: 'x', engineVersion: 4, updated: new Date(NOW).toISOString() }, null, NOW);
  assert.equal(s.state, 'unknown');
});

// Without a canon to compare against, a mount that has not moved in a week still says
// something: the converge itself has stopped.
test('with no canon, a long-untouched mount reads as stalled', () => {
  const old = { ref: 'x', engineVersion: 4, updated: new Date(NOW - MOUNT_STALE_MS - 1).toISOString() };
  assert.equal(mountState(old, null, NOW).state, 'stalled');
});

test('a member declaring Claudinite with no stamp is flagged', () => {
  const s = summariseMember(read({ declaration: decl({ claudinite: undefined }) }), { now: NOW, canon: CANON });
  assert.equal(mountState(undefined).state, 'none');
  assert.ok(s.reasons.some((r) => /no mount stamp/.test(r.text)));
});

// --- runs ------------------------------------------------------------------------

test('only scheduled runs count toward scheduler health', () => {
  const runs = [
    { event: 'push', status: 'completed', conclusion: 'failure', created_at: '2026-08-17T11:00:00Z' },
    { event: 'schedule', status: 'completed', conclusion: 'success', created_at: '2026-08-17T10:00:00Z' },
  ];
  const s = summariseRuns(runs, NOW);
  assert.equal(s.consecutiveFailures, 0, 'a failing CI push is not a failing scheduler');
  assert.equal(s.scheduled, 1);
  assert.equal(s.everRan, true);
});

test('a cancelled run neither breaks nor clears a failure streak', () => {
  const runs = ['failure', 'cancelled', 'failure'].map((conclusion, i) => ({
    event: 'schedule', status: 'completed', conclusion, created_at: new Date(NOW - i * 3600e3).toISOString(),
  }));
  assert.equal(summariseRuns(runs, NOW).consecutiveFailures, 2);
});

test('never having run is distinct from passing', () => {
  const s = summariseRuns([], NOW);
  assert.equal(s.everRan, false);
  assert.equal(s.consecutiveFailures, 0);
  assert.equal(s.lastAt, null);
});

test('in-flight counts any event, since a run in progress is a run in progress', () => {
  assert.equal(summariseRuns([{ event: 'push', status: 'in_progress' }], NOW).inFlight, 1);
});

// --- ranking and rollup -----------------------------------------------------------

test('members rank worst first and ties are stable by name', () => {
  const s = (repo, level, parked = 0) => ({ repo, status: 'adopted', level, parked, warned: 0, open: { total: 0 } });
  const ranked = rankMembers([
    s('o/ok', 'ok'), s('o/bad', 'critical'), s('o/warn', 'serious'), s('o/also-bad', 'critical'),
  ]).map((x) => x.repo);
  assert.deepEqual(ranked, ['o/also-bad', 'o/bad', 'o/warn', 'o/ok']);
});

test('rollUp counts members needing attention, not raw items', () => {
  const summaries = [
    summariseMember(read({ repo: 'o/a', items: [item({ labels: [NEEDS_HUMAN] }), item({ number: 2, labels: [NEEDS_HUMAN] })] }), { now: NOW, canon: CANON }),
    summariseMember(read({ repo: 'o/b', items: [item()] }), { now: NOW, canon: CANON }),
    summariseMember({ repo: 'o/c', declaration: null }, { now: NOW }),
    summariseMember({ repo: 'o/d', error: { status: 404 } }, { now: NOW }),
  ];
  const r = rollUp(summaries);
  assert.equal(r.members, 4);
  assert.equal(r.adopted, 2);
  assert.equal(r.notAdopted, 1);
  assert.equal(r.unreadable, 1);
  assert.equal(r.parkedMembers, 1, 'one MEMBER needs you');
  assert.equal(r.parkedItems, 2, 'even though two items are parked');
  assert.equal(r.needAttention, 1);
});

test('rollUp never counts an unreadable member as healthy', () => {
  const r = rollUp([summariseMember({ repo: 'o/d', error: { status: 404 } }, { now: NOW })]);
  assert.equal(r.adopted, 0);
  assert.equal(r.needAttention, 0, 'nor as needing attention — it is simply unknown');
  assert.equal(r.unreadable, 1);
});

test('packSpread ranks packs by how many members carry them', () => {
  const spread = packSpread([
    { packs: ['claudinite-lifecycle', 'basics'] }, { packs: ['claudinite-lifecycle'] }, { packs: ['claudinite-lifecycle', 'tidy-repo'] },
  ]);
  assert.deepEqual(spread[0], { pack: 'claudinite-lifecycle', members: 3 });
  assert.deepEqual(spread.map((p) => p.pack), ['claudinite-lifecycle', 'basics', 'tidy-repo']);
});

// The fleet-only view: one task, everywhere it runs. A shared pack's task parked in
// several members at once is a canon problem that no single repo's page reveals.
test('taskSpread aggregates one task across members, parked first', () => {
  const reads = [
    { repo: 'o/a', items: [item({ title: '[claudinite-work] claudinite-lifecycle/update', labels: [NEEDS_HUMAN] })] },
    { repo: 'o/b', items: [item({ title: '[claudinite-work] claudinite-lifecycle/update', labels: [NEEDS_HUMAN] })] },
    { repo: 'o/c', items: [item({ title: '[claudinite-work] basics/task-janitor', state: 'closed', labels: [OUTCOME_DONE] })] },
  ];
  const spread = taskSpread(reads, NOW);
  assert.equal(spread[0].key, 'claudinite-lifecycle/update');
  assert.equal(spread[0].members, 2);
  assert.equal(spread[0].parked, 2);
  assert.equal(spread[1].key, 'basics/task-janitor');
  assert.equal(spread[1].done, 1);
});

test('taskSpread counts a closed item with no outcome as failed, and obsolete as neither', () => {
  const reads = [{
    repo: 'o/a',
    items: [
      item({ number: 1, title: '[claudinite-work] claudinite-lifecycle/update', state: 'closed', labels: [] }),
      item({ number: 2, title: '[claudinite-work] claudinite-lifecycle/update', state: 'closed', labels: [OUTCOME_OBSOLETE] }),
      item({ number: 3, title: '[claudinite-work] claudinite-lifecycle/update', state: 'closed', labels: [OUTCOME_DELIVERED] }),
    ],
  }];
  const [row] = taskSpread(reads, NOW);
  assert.equal(row.failed, 1);
  assert.equal(row.done, 1);
});

test('taskSpread ignores issues that are not work items', () => {
  const reads = [{ repo: 'o/a', items: [item({ title: 'Claudinite tracker: Tidy Issues' })] }];
  assert.deepEqual(taskSpread(reads, NOW), []);
});

// --- state mix --------------------------------------------------------------------

test('the open state mix is counted per state, with unknown states kept apart', () => {
  const items = [
    item({ number: 1, labels: [BLOCKED] }),
    item({ number: 2, labels: [READY] }),
    item({ number: 3, labels: [AGENT] }),
    item({ number: 4, labels: [] }),          // torn/unlabelled — a real repair case
  ];
  const s = summariseMember(read({ items }), { now: NOW, canon: CANON });
  assert.equal(s.open.total, 4);
  assert.equal(s.open.byState[BLOCKED], 1);
  assert.equal(s.open.byState[READY], 1);
  assert.equal(s.open.byState[AGENT], 1);
  assert.equal(s.open.byState.other, 1, 'an unlabelled item is not silently folded into a real state');
});

// Being behind canon is routine — members catch up within a day. Being behind AND not
// having converged in a week is a stopped converge, and the routine state must not
// mask it.
test('behind plus a week without converging reads as stalled, not merely behind', () => {
  const fresh = { ref: 'old', engineVersion: 4, updated: new Date(NOW - 3600e3).toISOString() };
  const stopped = { ref: 'old', engineVersion: 4, updated: new Date(NOW - MOUNT_STALE_MS - 1).toISOString() };
  assert.equal(mountState(fresh, CANON, NOW).state, 'behind');
  assert.equal(mountState(stopped, CANON, NOW).state, 'stalled');
});

test('an old engine outranks a stalled converge — it may be why the converge stopped', () => {
  const both = { ref: 'old', engineVersion: 3, updated: new Date(NOW - MOUNT_STALE_MS - 1).toISOString() };
  assert.equal(mountState(both, CANON, NOW).state, 'behind-engine');
});

test('a stalled mount says how long, and one declared task is not "1 tasks"', () => {
  const s = summariseMember(
    read({ items: [item()], declaration: decl({ claudinite: { ref: 'old', engineVersion: 4, updated: new Date(NOW - 9 * 86400e3).toISOString() } }) }),
    { now: NOW, canon: CANON },
  );
  assert.match(s.reasons.find((r) => /converged/.test(r.text)).text, /9 days/);

  const one = summariseMember(read({ items: [], paths: ['packs/basics/tasks/task-janitor/task.mjs'] }), { now: NOW, canon: CANON });
  assert.match(one.reasons.find((r) => /no work item/.test(r.text)).text, /^1 task declared/);
});

// --- the member grid's three groups ----------------------------------------------

test('CI is the default branch\'s own runs, never the scheduler\'s', () => {
  const runs = [
    { event: 'schedule', status: 'completed', conclusion: 'failure', head_branch: 'main', created_at: '2026-08-17T10:00:00Z' },
    { event: 'push', status: 'completed', conclusion: 'success', head_branch: 'main', created_at: '2026-08-17T09:00:00Z' },
  ];
  assert.equal(ciStatus(runs, 'main').state, 'passing');
});

test('CI reports failing, and a run in flight outranks the last conclusion', () => {
  const failed = [{ event: 'push', status: 'completed', conclusion: 'failure', head_branch: 'main', created_at: '2026-08-17T09:00:00Z' }];
  assert.equal(ciStatus(failed, 'main').state, 'failing');
  assert.equal(ciStatus([{ event: 'push', status: 'in_progress', head_branch: 'main', created_at: '2026-08-17T09:00:00Z' }, ...failed], 'main').state, 'running');
});

test('a branch that is not the default one says nothing about CI here', () => {
  const runs = [{ event: 'push', status: 'completed', conclusion: 'failure', head_branch: 'a-branch', created_at: '2026-08-17T09:00:00Z' }];
  assert.equal(ciStatus(runs, 'main').state, 'unknown');
});

test('a failing repo CI is a reason, and is not the scheduler failing', () => {
  const s = summariseMember(read({
    runs: [
      { event: 'push', status: 'completed', conclusion: 'failure', head_branch: 'main', created_at: '2026-08-17T09:00:00Z' },
      { event: 'schedule', status: 'completed', conclusion: 'success', head_branch: 'main', created_at: '2026-08-17T10:00:00Z' },
    ],
    defaultBranch: 'main',
  }), { now: NOW, canon: CANON });
  assert.equal(s.ci.state, 'failing');
  assert.equal(s.runs.consecutiveFailures, 0);
  assert.ok(s.reasons.some((r) => /own CI is failing/.test(r.text)));
});

test('the Work group counts issues that are not queue items, and open PRs', () => {
  const plain = { ...item(), number: 41, title: 'a plain issue', created_at: '2026-08-10T00:00:00Z' };
  const s = summariseMember(read({
    items: [item(), plain, { ...plain, number: 42, state: 'closed' }],
    prs: [
      { number: 7, title: 'a pr', created_at: '2026-08-12T00:00:00Z', draft: false },
      { number: 8, title: 'a draft', created_at: '2026-08-13T00:00:00Z', draft: true },
    ],
  }), { now: NOW, canon: CANON });

  assert.equal(s.work.issues, 1);
  assert.equal(s.work.issuesOldest, Date.parse('2026-08-10T00:00:00Z'));
  assert.equal(s.work.prs, 1);
  assert.equal(s.work.drafts, 1);
});

test('the head commit and the repo\'s stars ride along from reads already made', () => {
  const s = summariseMember(read({ head: { sha: 'abc', committedAt: '2026-08-16T00:00:00Z' }, stars: 12 }),
    { now: NOW, canon: CANON });
  assert.equal(s.stars, 12);
  assert.equal(s.lastCommit, Date.parse('2026-08-16T00:00:00Z'));
});
