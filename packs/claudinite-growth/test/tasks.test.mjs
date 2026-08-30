import { test } from 'node:test';
import assert from 'node:assert/strict';
import pack from '../pack.mjs';
import proseToChecks from '../tasks/prose-to-checks-sweep/task.mjs';
import extract from '../tasks/growth-extract/task.mjs';
import dedup from '../tasks/growth-dedup/task.mjs';
import logsPrune from '../tasks/logs-prune/task.mjs';
import revalidation from '../tasks/rule-revalidation/task.mjs';

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

test('the pack contributes its tasks structurally, not as a pack.mjs slot', () => {
  // The descriptors moved out of the manifest: the repo's scheduler finds
  // tasks/<name>/task.mjs structurally (#394).
  assert.equal(pack.run_daily, undefined);
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
// cannot do X", which is unfalsifiable afterwards. The work item has to carry
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
// nightly anchor against the same local packs. They are one task now, so the
// precondition has two independent arms and the Context has to say WHICH halves
// are live — a run woken only by an aged log must not invent an activity window.

test('growth-extract: daily/opus/merged-pr over the window signals alone', () => {
  assert.equal(extract.frequency, 'daily');
  // The offset only ever implied the ordering; this is what enforces it.
  assert.deepEqual(extract.schedule_after, ['claudinite-lifecycle/update']);
  assert.equal(extract.agent_model, 'opus');
  assert.equal(extract.expected_outcome, 'merged-pr'); // additive local-pack edits auto-merge after CI
  // The logs signal left with the retention prune (logs-prune owns it now): this
  // task's only reason to run is activity, so a quiet night costs no opus dispatch.
  assert.deepEqual(extract.precondition_signals, ['commits', 'prs', 'issues']);
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

test('growth-extract: a quiet repo never fires it, however old its logs are', () => {
  // The age arm is gone with the prune. A log ageing out is logs-prune's business,
  // and waking an opus dispatch for it was exactly what that arm cost.
  const v = extract.precondition({
    commits: { substantiveChange: false },
    conversationLogs: { present: true, retentionDays: 10, oldestLogAgeDays: 14 },
  });
  assert.equal(v.run, false);
  assert.match(v.reason, /nothing to extract/);
});

// --- growth-dedup (the pruning stage) ----------------------------------------

test('growth-dedup: weekly/opus/merged-pr — the prune PR is delivered to land', () => {
  // Weekly, not daily: a member's mount moves most nights, so a daily anchor started
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

test('growth-dedup: code_work detects the canon window diff before the agentic phase', () => {
  // The detection is deterministic code over commit records, so it is code-work's
  // half — inside the pack, beside task.mjs. The bound stays under the executor's
  // claim leash, which validateTaskDeclaration enforces for every task.
  assert.equal(dedup.code_work, 'node worker.mjs');
  assert.ok(Number.isInteger(dedup.code_work_timeout) && dedup.code_work_timeout > 0);
  // Code-work + a non-`none` agent_model is the CONDITIONAL hand-off, so the model
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

// --- logs-prune (retention on the conversation-logs branch) ------------------

test('logs-prune: daily/agentless/none — its whole write is on a non-default branch', () => {
  assert.equal(logsPrune.id, 'logs-prune');
  assert.equal(logsPrune.frequency, 'daily');
  assert.equal(logsPrune.agent_model, 'none');
  // No PR at all: remove commits on the logs branch sit outside the outcome taxonomy.
  assert.equal(logsPrune.expected_outcome, 'none');
  assert.deepEqual(logsPrune.precondition_signals, ['conversationLogs']);
  // An agentless task's whole work is its preprocessing — with none it does nothing.
  assert.equal(logsPrune.code_work, 'node worker.mjs');
  // One fetch and at most one push: the bound guards a hung network call, and is
  // nowhere near headroom for work.
  assert.ok(logsPrune.code_work_timeout > 0 && logsPrune.code_work_timeout <= 60);
});

test('logs-prune: fires on age alone, which is what makes it independent of activity', () => {
  // The arm growth-extract used to carry, in the task that can act on it without
  // an opus dispatch. A repo gone quiet still ages its logs out.
  const v = logsPrune.precondition({
    conversationLogs: { present: true, retentionDays: 10, oldestLogAgeDays: 14 },
  });
  assert.equal(v.run, true);
  assert.match(v.reason, /retention 10d/);
});

test('logs-prune: no branch, unset retention, or nothing aged yet — all silent', () => {
  assert.match(logsPrune.precondition({ conversationLogs: { present: false } }).reason, /nothing captured/);
  assert.match(logsPrune.precondition({}).reason, /nothing captured/);
  assert.match(logsPrune.precondition({ conversationLogs: { present: true } }).reason, /retention_days is unset/);
  for (const signals of [
    { conversationLogs: { present: true, retentionDays: 10, oldestLogAgeDays: 3 } },
    // The boundary: at exactly retention the log has not yet aged OUT.
    { conversationLogs: { present: true, retentionDays: 10, oldestLogAgeDays: 10 } },
    // A branch with retention set but no logs at all — no age to compare.
    { conversationLogs: { present: true, retentionDays: 10, oldestLogAgeDays: null } },
  ]) {
    const v = logsPrune.precondition(signals);
    assert.equal(v.run, false);
    assert.match(v.reason, /nothing to prune/);
  }
});
