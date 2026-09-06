import { test } from 'node:test';
import assert from 'node:assert/strict';
import dedupJson from '../tasks/growth-dedup/task.json' with { type: 'json' };
import logsPruneJson from '../tasks/logs-prune/task.json' with { type: 'json' };
import { evaluatePrecondition, loadTaskTerms } from '../../claudinite-tasks/shared-code/preconditions.mjs';
import { normalizeTaskDeclaration } from '../../claudinite-tasks/task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const dedup = normalizeTaskDeclaration(dedupJson);
const logsPrune = normalizeTaskDeclaration(logsPruneJson);

const PACK_DIR = new URL('..', import.meta.url).pathname;
const logsPruneTerms = await loadTaskTerms(new URL('../tasks/logs-prune', import.meta.url).pathname);
// The cadence term reads the task's own run history at a chosen instant: an empty
// history holds, and the signal under test decides.
const SCHEDULE = { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 };
const AT = '2026-09-05T16:00:00Z';
const NO_RUNS = { runs: { list: [] } };
const verdictFor = async (task, signals, config, item) =>
  evaluatePrecondition({ decl: task, terms: await loadTaskTerms(`${PACK_DIR}tasks/${task.id}`) }, { ...NO_RUNS, ...signals }, config, item, AT, SCHEDULE);

// --- growth-dedup (the pruning stage) ----------------------------------------
// Its precondition composes a built-in `mount-moved` with a built-in
// `commits-under:` via `||` — the pack's own design, so it is kept as a
// mechanism-level exercise rather than a unit test of either term.

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
// `log-past-retention` is this task's own precondition term (retention math and
// the opt-out reading live beside its declaration), so its decisions are kept.

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
