import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  summariseMember, summariseRuns, mountState, rankMembers, rollUp, packSpread, taskSpread,
  ciStatus, parseEngineVersion, parsePackVersion, attentionBreakdown,
  memberAttention, fleetAttention, estimateMinutes, MINUTES_PER_PARK,
} from '../../packs/claudinite-dashboard/fleet.mjs';
import { ENGINE_VERSION } from '../../engine/version.mjs';
import dashboardPack from '../../packs/claudinite-dashboard/pack.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
import {
  BLOCKED, READY, EXECUTING, AGENT, NEEDS_HUMAN, NEEDS_HUMAN_APPROVAL, NEEDS_HUMAN_DECISION,
  OUTCOME_DONE, OUTCOME_DELIVERED, OUTCOME_OBSOLETE, TASK_DONE,
} from '../../engine/scheduler/queue/work-item.mjs';

const NOW = Date.parse('2026-08-17T12:00:00Z');
const CANON = { repo: 'o/canon', ref: 'canonsha', engineVersion: 4, packVersions: { 'claudinite-lifecycle': 3, basics: 5 } };

// The stamp's `ref` and `updated` are deliberately ANCIENT here: the versioned flows
// stamp versions and nothing else, so those two hold the provenance of the last full
// re-vendor — a healthy member's fixtures must look exactly like this, and every
// test over `decl()` doubles as proof that neither field is ever judged.
const decl = (over = {}) => ({
  packs: ['claudinite-lifecycle', 'basics'],
  taskScheduler: { dailyHour: 4 },
  claudinite: {
    ref: 'a-january-full-revendor-sha', updated: '2026-01-05T00:00:00Z',
    engineVersion: 4, packVersions: { 'claudinite-lifecycle': 3, basics: 5 },
  },
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

// The triage split (tasks-dispatch DESIGN §4): only a failure park — or one an older
// engine left unclassified — holds its task's lane. The other three are a person's
// inbox, and a fleet view that alarms identically on all four teaches the reader to
// ignore the alarm.
test('an unclassified park is critical — it is holding the task\'s lane', () => {
  const s = summariseMember(read({ items: [item({ labels: [NEEDS_HUMAN] })] }), { now: NOW, canon: CANON });
  assert.equal(s.level, 'critical');
  assert.equal(s.parked, 1);
  assert.match(s.reasons[0].text, /holding.*lane/);
});

test('an action or decision park is serious, and an approval park is a waiting PR', () => {
  const decision = summariseMember(
    read({ items: [item({ labels: [NEEDS_HUMAN, NEEDS_HUMAN_DECISION] })] }), { now: NOW, canon: CANON },
  );
  assert.equal(decision.level, 'serious');
  assert.match(decision.reasons[0].text, /parked for a person/);

  const approval = summariseMember(
    read({ items: [item({ labels: [NEEDS_HUMAN, NEEDS_HUMAN_APPROVAL] })] }), { now: NOW, canon: CANON },
  );
  assert.equal(approval.level, 'warning');
  assert.match(approval.reasons[0].text, /waiting for approval/);
  assert.equal(approval.parked, 1, 'an approval park still counts as parked');
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

// The defect this whole block exists to keep out (#1065, same class as #786): the
// versioned flows stamp `engineVersion`/`packVersions` and nothing else, so `ref`
// and `updated` hold the provenance of the LAST FULL RE-VENDOR. A mount converging
// nightly carries a months-old ref and updated forever — judging either reads every
// healthy member as behind or stalled.
test('freshness is judged on versions, never on ref or updated', () => {
  const stamp = {
    ref: 'a-january-full-revendor-sha', updated: '2026-01-05T00:00:00Z',
    engineVersion: 4, packVersions: { 'claudinite-lifecycle': 3, basics: 5 },
  };
  assert.equal(mountState(stamp, CANON).state, 'current');
});

test('an older engine version outranks pack lag', () => {
  const stamp = { engineVersion: 3, packVersions: { basics: 4 } };
  const s = mountState(stamp, CANON);
  assert.equal(s.state, 'behind-engine');
  assert.equal(s.canonEngineVersion, 4);
});

test('a pack behind canon reads behind and names the pack', () => {
  const s = mountState({ engineVersion: 4, packVersions: { 'claudinite-lifecycle': 2, basics: 5 } }, CANON);
  assert.equal(s.state, 'behind');
  assert.deepEqual(s.behindPacks, [{ pack: 'claudinite-lifecycle', version: 2, canonVersion: 3 }]);
});

// The stored-data rename rule at this read: a stamp written before a pack rename
// still keys the version under the old spelling, and must compare — not read as an
// unknown pack.
test('a renamed pack\'s stamped spelling still compares against canon', () => {
  const s = mountState({ engineVersion: 4, packVersions: { core: 2, basics: 5 } }, CANON);
  assert.equal(s.state, 'behind');
  assert.deepEqual(s.behindPacks, [{ pack: 'claudinite-lifecycle', version: 2, canonVersion: 3 }]);
});

// A pack the canon reference cannot price (the read failed, or it is a local pack)
// is an unknown, never silently "current".
test('a pack canon carries no version for is counted unknown, not judged', () => {
  const s = mountState({ engineVersion: 4, packVersions: { basics: 5, 'some-new-pack': 1 } }, CANON);
  assert.equal(s.state, 'current');
  assert.equal(s.unknownPacks, 1);
  assert.equal(s.comparedPacks, 1);
});

test('with no canon configured freshness is unknown, not current', () => {
  const s = mountState({ engineVersion: 4, packVersions: { basics: 5 } }, null);
  assert.equal(s.state, 'unknown');
});

// A stamp with no versions at all predates the versioned flows — that member has not
// converged since they landed, which is worth a flag of its own.
test('a stamp carrying no versions reads unversioned', () => {
  assert.equal(mountState({ ref: 'x', updated: '2026-08-17T00:00:00Z' }, CANON).state, 'unversioned');
});

// The canon side of the comparison is lifted as text off the real files, so the
// parsers are proven against those files themselves — a fixture spelling the same
// pattern would only prove the matching.
test('the version parsers read the canon\'s own real files', async () => {
  const engineText = await readFile(resolve(ROOT, 'engine/version.mjs'), 'utf8');
  assert.equal(parseEngineVersion(engineText), ENGINE_VERSION);
  const packText = await readFile(resolve(ROOT, 'packs/claudinite-dashboard/pack.mjs'), 'utf8');
  assert.equal(parsePackVersion(packText), dashboardPack.version);
});

test('the version parsers answer null — never a guess — on text without the field', () => {
  assert.equal(parseEngineVersion('// ENGINE_VERSION = 9 in prose only\nexport const x = 1;\n'), null);
  assert.equal(parsePackVersion('export default { id: "x", agentVersion: 3 };\n'), null);
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

// The vocabulary migration's decode side: `task:done` is today's spelling and the
// `outcome:*` labels are the fielded engine's — a member mid-migration carries both,
// and the tallies must read them as one vocabulary.
test('outcomes decode every spelling to the canonical words', () => {
  const closed = (number, labels) => item({ number, state: 'closed', labels, closed_at: '2026-08-17T06:00:00Z' });
  const s = summariseMember(read({
    items: [closed(1, [OUTCOME_DONE]), closed(2, [TASK_DONE]), closed(3, [OUTCOME_DELIVERED]), closed(4, [OUTCOME_OBSOLETE])],
  }), { now: NOW, canon: CANON });
  assert.equal(s.outcomes.done, 2);
  assert.equal(s.outcomes.delivered, 1);
  assert.equal(s.outcomes.obsolete, 1);
  assert.equal(s.outcomes.none, 0);
});

test('taskSpread reads task:done as done', () => {
  const reads = [{ repo: 'o/a', items: [item({ state: 'closed', labels: [TASK_DONE] })] }];
  assert.equal(taskSpread(reads, NOW)[0].done, 1);
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

test('a behind mount is a reason that names the packs, at routine severity', () => {
  const s = summariseMember(
    read({ items: [item()], declaration: decl({ claudinite: { engineVersion: 4, packVersions: { 'claudinite-lifecycle': 2, basics: 5 } } }) }),
    { now: NOW, canon: CANON },
  );
  const reason = s.reasons.find((r) => /behind canon/.test(r.text));
  assert.equal(reason.level, 'info', 'behind is routine — the nightly converge catches it up');
  assert.match(reason.text, /claudinite-lifecycle/);
});

test('one declared task is not "1 tasks"', () => {
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

// --- what kind of human attention -------------------------------------------------

// The rollup counts MEMBERS, which is the length of the morning's list. What the list
// is made of is a separate question, and merging three merges to approve with three
// broken lanes into one word is what this exists to stop.
test('the attention breakdown names each kind of park separately', () => {
  const rows = attentionBreakdown({ broken: 1, decisions: 1, approvals: 3 });
  assert.deepEqual(rows.map((r) => r.text), [
    '1 task broken', '1 item needing a decision', '3 items needing approval',
  ]);
});

test('the breakdown is worst first, so the top line is the one to act on', () => {
  const rows = attentionBreakdown({
    approvals: 2, decisions: 1, broken: 1, schedulersFailing: 1,
    tripping: 1, schedulersNeverRan: 1,
  });
  assert.deepEqual(rows.map((r) => r.level),
    ['critical', 'critical', 'serious', 'serious', 'warning', 'serious']);
});

// A kind nobody is waiting on is ABSENT. A tile that lists "0 items needing approval"
// beside a real alarm is teaching its reader to skim the list.
test('a kind with nothing waiting on it is left out, not reported as zero', () => {
  assert.deepEqual(attentionBreakdown({}), []);
  assert.deepEqual(attentionBreakdown({ broken: 0, approvals: 0 }), []);
});

// One vocabulary, two callers. The row and the fleet tile itemise through the same
// function, so the two can never describe the same parks in different words.
test('a member and the fleet reach the breakdown through the same counts', () => {
  const one = summariseMember(
    read({ items: [item({ labels: [NEEDS_HUMAN, NEEDS_HUMAN_APPROVAL] })] }), { now: NOW, canon: CANON },
  );
  assert.deepEqual(memberAttention(one),
    { broken: 0, decisions: 0, approvals: 1, tripping: 0, schedulersFailing: 0, schedulersNeverRan: 0 });
  assert.deepEqual(attentionBreakdown(memberAttention(one)).map((r) => r.text), ['1 item needing approval']);

  // The fixture member has no scheduled runs, so the fleet side legitimately carries a
  // scheduler fact the member row's own counts do not — a member-shaped thing, counted
  // in members, and only the fleet has more than one member to count.
  const roll = fleetAttention(rollUp([one]));
  assert.equal(roll.approvals, 1);
  assert.deepEqual(attentionBreakdown(roll).map((r) => r.text),
    ['1 item needing approval', '1 scheduler never ran']);
});

test('the rollup carries the split the breakdown reads', () => {
  const roll = rollUp([
    summariseMember(read({ items: [item({ labels: [NEEDS_HUMAN, NEEDS_HUMAN_APPROVAL] })] }), { now: NOW, canon: CANON }),
    summariseMember(read({ repo: 'o/b', items: [item({ labels: [NEEDS_HUMAN] })] }), { now: NOW, canon: CANON }),
  ]);
  assert.equal(roll.parkedApprovals, 1);
  assert.equal(roll.parkedHolding, 1, 'an unclassified park falls back to failure, which holds the lane');
  assert.equal(roll.parkedInbox, 0);
});

// --- the estimate ------------------------------------------------------------------

// A flat rate, and the point of it is that it is visible and arguable rather than
// dressed up. What matters is that it is applied consistently and that nothing which
// is not a queue of work for a person is counted into it.
test('every parked item costs the same flat estimate', () => {
  assert.equal(estimateMinutes({ broken: 1, decisions: 1, approvals: 1, tripping: 1 }), 4 * MINUTES_PER_PARK);
  assert.equal(estimateMinutes({}), 0);
});

// A broken scheduler is not a queue of tasks to work through, and folding it in would
// make the figure mean two things at once.
test('a scheduler fault is not minutes of a person\'s time', () => {
  assert.equal(estimateMinutes({ schedulersFailing: 3, schedulersNeverRan: 2 }), 0);
  assert.ok(attentionBreakdown({ schedulersFailing: 3 }).length, 'but it is still reported');
});

// The reason a row can drop a park from its prose without losing it: the ranking
// reads every reason, and only the rendering filters by kind.
test('every reason carries the kind that says where the row shows it', () => {
  const s = summariseMember(
    read({ items: [item({ labels: [NEEDS_HUMAN, NEEDS_HUMAN_APPROVAL] })] }),
    { now: NOW, canon: { engineVersion: 99, packVersions: {} } },
  );
  assert.ok(s.reasons.length >= 2);
  for (const r of s.reasons) assert.ok(r.kind, `a reason with no kind cannot be placed: ${r.text}`);
  assert.ok(s.reasons.some((r) => r.kind === 'park'));
  assert.ok(s.reasons.some((r) => r.kind === 'mount'));
  assert.equal(s.level, 'serious', 'the level still weighs the reasons the row will not spell out');
});
