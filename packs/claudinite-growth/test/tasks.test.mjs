import { test } from 'node:test';
import assert from 'node:assert/strict';
import proseToChecksJson from '../tasks/prose-to-checks-sweep/task.json' with { type: 'json' };
import extractJson from '../tasks/growth-extract/task.json' with { type: 'json' };
import dedupJson from '../tasks/growth-dedup/task.json' with { type: 'json' };
import logsPruneJson from '../tasks/logs-prune/task.json' with { type: 'json' };
import revalidationJson from '../tasks/rule-revalidation/task.json' with { type: 'json' };
import { evaluatePrecondition, loadTaskTerms, preconditionSignals } from '../../claudinite-tasks/shared-code/preconditions.mjs';
import { normalizeTaskDeclaration } from '../../claudinite-tasks/task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const proseToChecks = normalizeTaskDeclaration(proseToChecksJson);
const extract = normalizeTaskDeclaration(extractJson);
const dedup = normalizeTaskDeclaration(dedupJson);
const logsPrune = normalizeTaskDeclaration(logsPruneJson);
const revalidation = normalizeTaskDeclaration(revalidationJson);

const PACK_DIR = new URL('..', import.meta.url).pathname;
const logsPruneTerms = await loadTaskTerms(new URL('../tasks/logs-prune', import.meta.url).pathname);
// The cadence term reads the task's own run history at a chosen instant: an empty
// history holds, and the signal under test decides.
const SCHEDULE = { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 };
const AT = '2026-09-05T16:00:00Z';
const NO_RUNS = { runs: { list: [] } };
const verdictFor = async (task, signals, config, item) =>
  evaluatePrecondition({ decl: task, terms: await loadTaskTerms(`${PACK_DIR}tasks/${task.id}`) }, { ...NO_RUNS, ...signals }, config, item, AT, SCHEDULE);

// claudinite-growth per-repo task declarations + preconditions
// (per-project-scheduling redesign: prose-to-checks is a local, per-repo
// operation, not fleet-scoped).
//
// These are UNIT tests over pure preconditions: they hand-build the signals
// object, so they assert the DECISION and never that the scheduler can produce
// the input. `localPacks.present` and `conversationLogs.retentionDays` were both
// unreachable in a real run while the tests below stayed green — the shapes they
// construct were ones the collector could not emit. The reachability half is
// packs/claudinite-tasks/test/signal-context.test.mjs (real checkout → real ctx →
// these same preconditions). A new signal field needs both.

// --- prose-to-checks-sweep (per-repo, pack_paths config) ---------------------

test('prose-to-checks-sweep: sleeps on a silent repo and resumes on the first active window', async () => {
  // The subject is standing prose, but no new prose is written where nothing
  // happens — and an opus dispatch a week on a corpus that has not moved is what
  // the silence gate exists to stop.
  const quiet = await verdictFor(proseToChecks, {
    commits: { substantiveChange: false }, issues: { open: [], touched: [] }, prs: { touched: [] }, conversationLogs: {},
  });
  assert.equal(quiet.run, false);
  assert.match(quiet.reason, /silent in the window/);

  const active = await verdictFor(proseToChecks, {
    commits: { substantiveChange: true }, issues: { open: [], touched: [] }, prs: { touched: [] }, conversationLogs: {},
  });
  assert.equal(active.run, true);
});

// THE PINNED SUBJECTS each round delivers under. Held here rather than read out of
// either declaration so the tests below can disagree with the code.
const PROSE_SUBJECT = 'Claudinite growth: prose to checks';
const REVALIDATION_SUBJECT = 'Claudinite growth: rule revalidation';

// Both tasks work a STANDING backlog, so neither can be gated on movement — the
// sweep would halt with the backlog half-worked the moment prose stopped changing.
// Nor on the previous round: a round whose predecessor is still in review RUNS and
// appends to that PR, so one review covers several weeks of work instead of one.
for (const [task, subject] of [[proseToChecks, PROSE_SUBJECT], [revalidation, REVALIDATION_SUBJECT]]) {
  test(`${task.id}: a pending round never stands this one down`, async () => {
    const active = { commits: { substantiveChange: true }, issues: { open: [], touched: [] }, conversationLogs: {} };
    const pending = await verdictFor(task, { ...active, prs: { touched: [], open: [{ number: 42, title: `${subject} (2026-09-01)` }] } });
    assert.equal(pending.run, true, 'the round runs and joins the open PR');
  });
}

// --- growth-extract (the capture stage — BOTH sources in one task) -----------
//
// The activity half and the conversation half were two tasks firing in the same
// nightly anchor against the same local packs. They are one task now, so the
// precondition has two independent arms and the Context has to say WHICH halves
// are live — a run woken only by an aged log must not invent an activity window.

test('growth-extract: its signal is derived from its one condition — activity, never the logs', () => {
  // The logs signal left with the retention prune (logs-prune owns it now): this
  // task's only reason to run is activity, so a quiet night costs no opus dispatch.
  assert.deepEqual(preconditionSignals(extract.preconditions, new Map()), ['runs', 'commits']);
});

test('growth-extract: a SUBSTANTIVE default-branch change fires it (a bot bump does not)', async () => {
  // A bot bump / [skip ci] / nightly baselining commit advancing main is not a
  // lesson to extract — and neither, now, is another task's own delivery, which the
  // collector strips out before the condition ever sees it.
  assert.equal((await verdictFor(extract, { commits: { substantiveChange: false } })).run, false);
  assert.equal((await verdictFor(extract, {})).run, false);
  assert.equal((await verdictFor(extract, { commits: { substantiveChange: true, list: [] } })).run, true);
});

test('growth-extract: the trigger names the substantive commits, and only those', async () => {
  const v = await verdictFor(extract, {
    commits: { substantiveChange: true, list: [{ sha: 'abcdef1234', substantive: true }, { sha: '9999999999', substantive: false }] },
  });
  const ctx = v.context.join(' ');
  assert.match(ctx, /abcdef1/);
  assert.doesNotMatch(ctx, /9999999/); // the non-substantive commit is not a lesson
});

test('growth-extract: a quiet repo never fires it, however old its logs are', async () => {
  // The age arm is gone with the prune. A log ageing out is logs-prune's business,
  // and waking an opus dispatch for it was exactly what that arm cost.
  const v = await verdictFor(extract, {
    commits: { substantiveChange: false },
    conversationLogs: { present: true, retentionDays: 10, oldestLogAgeDays: 14 },
  });
  assert.equal(v.run, false);
  assert.match(v.reason, /no substantive default-branch change/);
});

// --- growth-dedup (the pruning stage) ----------------------------------------

test('growth-dedup: both signals are derived from its two conditions', () => {
  assert.deepEqual(preconditionSignals(dedup.preconditions, new Map()), ['runs', 'sharedMount', 'commits']);
});

// Presence is not asked: adoption seeds the repo's own local pack and the nightly
// never removes it, so movement is the whole gate.
// Presence is not asked: adoption seeds the repo's own local pack and the nightly
// never removes it, so movement is the whole gate. It reads that movement off the
// window's own changed paths — the generic `commits-under:` condition — rather than
// a collector field of its own.
test('growth-dedup: local-pack movement alone fires it, with no presence question', async () => {
  const moved = await verdictFor(dedup, { commits: { touchedPaths: ['.claudinite/local/packs/x/RULES.md'] }, sharedMount: { changedPacks: [] } });
  assert.equal(moved.run, true);
  assert.equal((await verdictFor(dedup, { commits: { touchedPaths: ['src/app.mjs'] }, sharedMount: { changedPacks: [] } })).run, false);
  assert.equal((await verdictFor(dedup, { commits: {}, sharedMount: { changedPacks: [] } })).run, false);
});

test('growth-dedup: a declared pack moving in the mount fires it (and names the packs)', async () => {
  const v = await verdictFor(dedup, { commits: { touchedPaths: [] }, sharedMount: { changedPacks: ['basics'] } });
  assert.equal(v.run, true);
  assert.match(v.reason, /basics/);
  assert.match(v.context.join(' '), /basics/);
});

// --- logs-prune (retention on the conversation-logs branch) ------------------

test('logs-prune: its signal is derived from its condition', () => {
  assert.deepEqual(preconditionSignals(logsPrune.preconditions, logsPruneTerms), ['runs', 'conversationLogs']);
});

test('logs-prune: fires on age alone, which is what makes it independent of activity', async () => {
  // A CLOCK crossing a boundary, and deliberately no repo-movement condition beside
  // it: the prune must keep firing on exactly the repos that went quiet, which is
  // where logs sit long enough to expire.
  const v = await verdictFor(logsPrune, {
    conversationLogs: { present: true, retentionDays: 10, oldestLogAgeDays: 14 },
  });
  assert.equal(v.run, true);
  assert.match(v.reason, /retention 10d/);
});

test('logs-prune: no branch, a declared opt-out, or nothing aged yet — all silent', async () => {
  assert.match((await verdictFor(logsPrune, { conversationLogs: { present: false } })).reason, /nothing captured/);
  assert.match((await verdictFor(logsPrune, {})).reason, /nothing captured/);
  // Capture-only is declared now, never inferred from a missing key (#1620): an
  // undeclared retention takes the default, and only a non-positive one is silent.
  assert.match((await verdictFor(logsPrune, { conversationLogs: { present: true, retentionDays: 0 } })).reason, /capture-only/);
  assert.match((await verdictFor(logsPrune, { conversationLogs: { present: true, oldestLogAgeDays: 30 } })).reason, /retention 10d/);
  for (const signals of [
    { conversationLogs: { present: true, retentionDays: 10, oldestLogAgeDays: 3 } },
    // The boundary: at exactly retention the log has not yet aged OUT.
    { conversationLogs: { present: true, retentionDays: 10, oldestLogAgeDays: 10 } },
    // A branch with retention set but no logs at all — no age to compare.
    { conversationLogs: { present: true, retentionDays: 10, oldestLogAgeDays: null } },
  ]) {
    const v = await verdictFor(logsPrune, signals);
    assert.equal(v.run, false);
    assert.match(v.reason, /nothing to prune/);
  }
});
