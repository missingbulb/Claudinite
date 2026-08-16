import { test } from 'node:test';
import assert from 'node:assert/strict';
import pack from '../../packs/grow_with_claudinite/pack.mjs';
import discover from '../../packs/grow_with_claudinite/tasks/growth-discover-packs/task.mjs';
import proseToChecks from '../../packs/grow_with_claudinite/tasks/prose-to-checks-sweep/task.mjs';
import extract from '../../packs/grow_with_claudinite/tasks/growth-extract/task.mjs';
import dedup from '../../packs/grow_with_claudinite/tasks/growth-dedup/task.mjs';
import usageFold from '../../packs/grow_with_claudinite/tasks/usage-fold/task.mjs';
import revalidation from '../../packs/grow_with_claudinite/tasks/rule-revalidation/task.mjs';

// grow_with_claudinite per-repo task declarations + preconditions
// (per-project-scheduling redesign: discover-packs and prose-to-checks are local,
// per-repo operations, not fleet-scoped).
//
// These are UNIT tests over pure preconditions: they hand-build the signals
// object, so they assert the DECISION and never that the scheduler can produce
// the input. `localPacks.present` and `conversationLogs.retentionDays` were both
// unreachable in a real run while the tests below stayed green — the shapes they
// construct were ones the collector could not emit. The reachability half is
// engine-tests/scheduler/signal-context.test.mjs (real checkout → real ctx →
// these same preconditions). A new signal field needs both.

test('the pack contributes its tasks structurally, not as a pack.mjs slot', () => {
  // The descriptors moved out of the manifest: the repo's scheduler finds
  // tasks/<name>/task.mjs structurally (#394).
  assert.equal(pack.run_daily, undefined);
});

// --- growth-discover-packs (local pack discovery) ----------------------------

test('growth-discover-packs: weekly/opus/open-pr, no signals (examines the checkout)', () => {
  assert.equal(discover.frequency, 'weekly');
  assert.equal(discover.agent_model, 'opus');
  // A new pack may carry new .mjs conformance checks, and a check can break CI —
  // reviewed, exactly as the sibling prose-to-checks-sweep is, and unlike extract
  // (which only adds prose/rules to territory a local pack already owns).
  assert.equal(discover.expected_outcome, 'open-pr');
  assert.deepEqual(discover.precondition_signals, []);
});

test('growth-discover-packs: fires weekly (standing reflection, worker no-ops when nothing new)', () => {
  assert.equal(discover.precondition().run, true);
});

// --- prose-to-checks-sweep (per-repo, pack_paths config) ---------------------

// WEEKLY, not daily: growth-extract now runs the prose-to-checks skill over its own
// additions on every capture run, so fresh prose never waits for this task. What is
// left is the standing backlog, which moves on a weekly clock.
test('prose-to-checks-sweep: weekly/opus/open-pr, no signals', () => {
  assert.equal(proseToChecks.frequency, 'weekly');
  assert.equal(proseToChecks.agent_model, 'opus');
  assert.equal(proseToChecks.expected_outcome, 'open-pr'); // a check can break CI → reviewed, not auto-merged
  assert.deepEqual(proseToChecks.precondition_signals, []);
});

test('prose-to-checks-sweep: defaults to the repo own local packs; config overrides the paths', () => {
  const def = proseToChecks.precondition({}, {});
  assert.equal(def.run, true);
  assert.match(def.context.join(' '), /\.claudinite\/local\/packs/);
  assert.doesNotMatch(def.context.join(' '), /(^|\s)packs(,|\s)/); // no core packs/ by default

  const canon = proseToChecks.precondition({}, { pack_paths: ['.claudinite/local/packs', 'packs'] });
  assert.match(canon.context.join(' '), /\.claudinite\/local\/packs.*packs|packs.*\.claudinite\/local\/packs/);
});

test('prose-to-checks-sweep: an empty/invalid pack_paths falls back to the default', () => {
  assert.match(proseToChecks.precondition({}, { pack_paths: [] }).context.join(' '), /\.claudinite\/local\/packs/);
  assert.match(proseToChecks.precondition({}, { pack_paths: 'nope' }).context.join(' '), /\.claudinite\/local\/packs/);
});

// --- rule-revalidation (re-probing environment claims, pack_paths config) ----

test('rule-revalidation: weekly/opus/open-pr, no signals (the calendar is the whole trigger)', () => {
  assert.equal(revalidation.id, 'rule-revalidation');
  assert.equal(revalidation.frequency, 'weekly');
  assert.equal(revalidation.agent_model, 'opus');
  // It rewrites the rules sessions obey, on evidence a reviewer cannot re-derive
  // from the diff — reviewed, like its two weekly siblings.
  assert.equal(revalidation.expected_outcome, 'open-pr');
  // Deliberately signal-less: the repo does NOT move when its claims expire, so a
  // signal arm would gate this task on exactly the wrong evidence.
  assert.deepEqual(revalidation.precondition_signals, []);
});

test('rule-revalidation: shares prose-to-checks-sweep pack_paths — local by default, canon by config', () => {
  const def = revalidation.precondition({}, {});
  assert.equal(def.run, true);
  assert.match(def.context.join(' '), /\.claudinite\/local\/packs/);
  assert.doesNotMatch(def.context.join(' '), /(^|\s)packs(,|\s)/); // no core packs/ by default

  const canon = revalidation.precondition({}, { pack_paths: ['.claudinite/local/packs', 'packs'] });
  assert.match(canon.context.join(' '), /\.claudinite\/local\/packs, packs/);
});

test('rule-revalidation: an empty/invalid pack_paths falls back to the default', () => {
  assert.match(revalidation.precondition({}, { pack_paths: [] }).context.join(' '), /\.claudinite\/local\/packs/);
  assert.match(revalidation.precondition({}, { pack_paths: 'nope' }).context.join(' '), /\.claudinite\/local\/packs/);
});

// The two probe rules are BINDING scope, not advice in task.md: the worst outcome
// available to this task is a session with narrow reach rewriting a rule into "you
// cannot do X", which is unfalsifiable afterwards. The dispatch issue has to carry
// both, on every run, whatever the paths are.
test('rule-revalidation: every run carries the read-only and unprobed rules as binding context', () => {
  for (const config of [{}, { pack_paths: ['packs'] }]) {
    const ctx = revalidation.precondition({}, config).context.join(' ');
    assert.match(ctx, /read-only/i);
    assert.match(ctx, /UNPROBED, not disproven/);
  }
});

// --- growth-extract (the capture stage — BOTH sources in one task) -----------
//
// The activity half and the conversation half were two tasks firing in the same
// nightly slot against the same local packs. They are one task now, so the
// precondition has two independent arms and the Context has to say WHICH halves
// are live — a run woken only by an aged log must not invent an activity window.

test('growth-extract: daily-1h/opus/merged-pr over the window AND the logs signals', () => {
  assert.equal(extract.frequency, 'daily-1h');
  assert.equal(extract.agent_model, 'opus');
  assert.equal(extract.expected_outcome, 'merged-pr'); // additive local-pack edits auto-merge after CI
  assert.deepEqual(extract.precondition_signals, ['commits', 'prs', 'issues', 'conversationLogs']);
});

test('growth-extract: a SUBSTANTIVE default-branch change fires it (a bot bump does not)', () => {
  // A bot bump / [skip ci] / nightly baselining commit advancing main is not a
  // lesson to extract — the same discrimination the legacy gate made.
  assert.equal(extract.precondition({ commits: { substantiveChange: false } }).run, false);
  assert.equal(extract.precondition({}).run, false);
  assert.equal(extract.precondition({ commits: { substantiveChange: true, list: [] } }).run, true);
});

test('growth-extract: carries the substantive shas and touched PR/issue numbers as binding scope', () => {
  const v = extract.precondition({
    commits: { substantiveChange: true, list: [{ sha: 'abcdef1234', substantive: true }, { sha: '9999999999', substantive: false }] },
    prs: { touched: [4] },
    issues: { touched: [5] },
  });
  const ctx = v.context.join(' ');
  assert.match(ctx, /abcdef1/);
  assert.doesNotMatch(ctx, /9999999/); // the non-substantive commit is not in scope
  assert.match(ctx, /#4/);
  assert.match(ctx, /#5/);
});

// The Context section is BINDING scope and task.md forbids widening past it, so a
// PR merged during the window is unreadable to the worker unless the precondition
// names it. Merged PRs carry the review discussion — usually the richest lesson
// source in the window — so they have to be in there explicitly.
test('growth-extract: merged-in-window PRs are named in the binding scope', () => {
  const v = extract.precondition({
    commits: { substantiveChange: true, list: [{ sha: 'abcdef1234', substantive: true }] },
    prs: { touched: [4], merged: [{ number: 9, title: 'fix the parser' }] },
  });
  const ctx = v.context.join(' ');
  assert.match(ctx, /#9/);
  assert.match(ctx, /merged/i);
  assert.match(ctx, /#4/); // the open-and-touched set is still there alongside
});

test('growth-extract: no merged PRs in the window adds no merged-PR line', () => {
  const v = extract.precondition({
    commits: { substantiveChange: true, list: [{ sha: 'abcdef1234', substantive: true }] },
    prs: { touched: [], merged: [] },
  });
  assert.doesNotMatch(v.context.join(' '), /PRs merged in the window/);
});

test('growth-extract: a substantive merge puts the conversation half in scope too', () => {
  // A merge means a fresh capture now sits on the logs branch — the reason the two
  // tasks always fired together.
  const ctx = extract.precondition({
    commits: { substantiveChange: true, list: [{ sha: 'abcdef1234', substantive: true }] },
  }).context.join(' ');
  assert.match(ctx, /Activity half IS in scope/);
  assert.match(ctx, /Conversation half IS in scope/);
});

test('growth-extract: the age-based prune fires on a quiet repo — with the activity half OFF', () => {
  // A log ages out on wall time, not on the repo changing. The Context must say the
  // activity half is out of scope, or the worker mines a window that never happened.
  const v = extract.precondition({
    commits: { substantiveChange: false },
    conversationLogs: { present: true, retentionDays: 10, oldestLogAgeDays: 14 },
  });
  assert.equal(v.run, true);
  assert.match(v.reason, /retention 10d/);
  const ctx = v.context.join(' ');
  assert.match(ctx, /Activity half is NOT in scope/);
  assert.match(ctx, /Retention prune IS due/);
});

// The regression this gate exists for: "a logs branch exists and retention is
// configured" is true on every capturing repo every day, so without the age test
// an opus agent was dispatched daily to find nothing.
test('growth-extract: a quiet repo whose logs are all YOUNGER than retention does NOT fire', () => {
  const v = extract.precondition({
    commits: { substantiveChange: false },
    conversationLogs: { present: true, retentionDays: 10, oldestLogAgeDays: 3 },
  });
  assert.equal(v.run, false);
  assert.match(v.reason, /nothing to extract or prune/);
  // The boundary: at exactly retention the log has not yet aged OUT.
  assert.equal(extract.precondition({
    commits: { substantiveChange: false },
    conversationLogs: { present: true, retentionDays: 10, oldestLogAgeDays: 10 },
  }).run, false);
});

test('growth-extract: quiet with no logs branch, retention unset, or an empty branch', () => {
  assert.equal(extract.precondition({ commits: {}, conversationLogs: { present: false } }).run, false);
  assert.equal(extract.precondition({ commits: {}, conversationLogs: { present: true } }).run, false);
  // A branch with retention set but no logs at all — no age to compare.
  assert.equal(extract.precondition({
    commits: {},
    conversationLogs: { present: true, retentionDays: 10, oldestLogAgeDays: null },
  }).run, false);
});

test('growth-extract: a substantive run with nothing prunable is told NOT to delete', () => {
  // Both halves live but the prune is not due — the Context says so positively, so
  // the run cannot read "conversation half in scope" as licence to delete.
  const configured = extract.precondition({
    commits: { substantiveChange: true, list: [] },
    conversationLogs: { present: true, retentionDays: 10, oldestLogAgeDays: 3 },
  }).context.join(' ');
  assert.match(configured, /Retention prune is NOT due.*Delete nothing/);

  const unset = extract.precondition({
    commits: { substantiveChange: true, list: [] },
    conversationLogs: { present: true },
  }).context.join(' ');
  assert.match(unset, /retention is unset.*Delete nothing/);
});

// --- growth-dedup (the pruning stage) ----------------------------------------

test('growth-dedup: weekly/opus/merged-pr — the prune PR is delivered to land', () => {
  // Weekly, not daily: a member's mount moves most nights, so a daily slot fired
  // this opus dispatch (and its PR) nearly every night for prunes nobody is
  // waiting on. Both signals are window-scoped, so the week's movement is
  // batched into one run, never missed.
  assert.equal(dedup.frequency, 'weekly');
  assert.equal(dedup.agent_model, 'opus');
  // A ceiling, not a promise: a `review`-delivery member degrades this to
  // open-pr, so the human gate is member config's call rather than hardcoded.
  assert.equal(dedup.expected_outcome, 'merged-pr');
  assert.deepEqual(dedup.precondition_signals, ['localPacks', 'sharedMount', 'commits']);
});

test('growth-dedup: prework detects the canon window diff before the agentic phase', () => {
  // The detection is deterministic code over commit records, so it is prework's
  // half — inside the pack, beside task.mjs. The bound stays under the executor's
  // claim leash, which validateTaskDeclaration enforces for every task.
  assert.equal(dedup.prework, 'node worker.mjs');
  assert.ok(Number.isInteger(dedup.prework_timeout) && dedup.prework_timeout > 0);
  // Prework + a non-`none` agent_model is the CONDITIONAL hand-off, so the model
  // has to stay declared or the judgment half never runs.
  assert.equal(dedup.agent_model, 'opus');
});

test('growth-dedup: no local packs → never runs, whatever else moved', () => {
  const none = { localPacks: { present: false, changedInWindow: true }, sharedMount: { changedPacks: ['basics'] } };
  assert.equal(dedup.precondition(none).run, false);
});

test('growth-dedup: with local packs, a declared pack moving in the mount fires it (and names the packs)', () => {
  const v = dedup.precondition({ localPacks: { present: true, changedInWindow: false }, sharedMount: { changedPacks: ['basics'] } });
  assert.equal(v.run, true);
  assert.match(v.reason, /basics/);
  assert.match(v.context.join(' '), /basics/);
});

test('growth-dedup: a local-pack change in the window fires it; a quiet repo does not', () => {
  assert.equal(dedup.precondition({ localPacks: { present: true, changedInWindow: true }, sharedMount: { changedPacks: [] } }).run, true);
  assert.equal(dedup.precondition({ localPacks: { present: true, changedInWindow: false }, sharedMount: { changedPacks: [] } }).run, false);
});

// --- usage-fold (the skill-usage aggregate) ----------------------------------

test('usage-fold: daily/agentless/merged-pr, on the conversationLogs signal alone', () => {
  assert.equal(usageFold.id, 'usage-fold');
  assert.equal(usageFold.frequency, 'daily');
  assert.equal(usageFold.agent_model, 'none');
  assert.equal(usageFold.expected_outcome, 'merged-pr');
  assert.deepEqual(usageFold.precondition_signals, ['conversationLogs']);
  // An agentless task's whole work is its preprocessing — with none it does nothing.
  assert.equal(usageFold.prework, 'node worker.mjs');
  assert.ok(usageFold.prework_timeout > 0);
});

test('usage-fold: a logs branch is the whole precondition — it runs on a quiet repo too', () => {
  // Deliberately NOT gated on fresh captures: advancing the week watermark past days
  // that have closed is work a quiet repo still needs done, and a run with nothing
  // new recomputes to a byte-identical file and opens no PR.
  const quiet = usageFold.precondition({ conversationLogs: { present: true, logCount: 4 } });
  assert.equal(quiet.run, true);
  assert.match(quiet.reason, /fold 4 captured log/);
});

test('usage-fold: no logs branch is no longer a skip — the scheduler run records are a second source', () => {
  // A repo whose sessions are all unattended may never have captured anything, and it
  // is exactly the repo whose task invocations are worth counting. The fold is agentless
  // and converges to a byte-identical file (no PR) when there is nothing new either way.
  const v = usageFold.precondition({ conversationLogs: { present: false } });
  assert.equal(v.run, true);
  assert.match(v.reason, /task-run records only/);
  assert.equal(usageFold.precondition({}).run, true, 'and a missing signal does not wedge it either');
});
