import { test } from 'node:test';
import assert from 'node:assert/strict';
import pack from '../../packs/grow_with_claudinite/pack.mjs';
import discover from '../../packs/grow_with_claudinite/tasks/growth-discover-packs/task.mjs';
import proseToChecks from '../../packs/grow_with_claudinite/tasks/prose-to-checks-sweep/task.mjs';
import extract from '../../packs/grow_with_claudinite/tasks/growth-extract/task.mjs';
import dedup from '../../packs/grow_with_claudinite/tasks/growth-dedup/task.mjs';
import conversationExtract from '../../packs/grow_with_claudinite/tasks/conversation-extract/task.mjs';

// grow_with_claudinite per-repo task declarations + preconditions
// (per-project-scheduling redesign: discover-packs and prose-to-checks are local,
// per-repo operations, not fleet-scoped).

test('the pack contributes its tasks structurally, not as a pack.mjs slot', () => {
  // The descriptors moved out of the manifest: the repo's scheduler finds
  // tasks/<name>/task.mjs structurally (#394).
  assert.equal(pack.run_daily, undefined);
});

// --- growth-discover-packs (local pack discovery) ----------------------------

test('growth-discover-packs: weekly/opus/merged-pr, no signals (examines the checkout)', () => {
  assert.equal(discover.frequency, 'weekly');
  assert.equal(discover.agent_model, 'opus');
  assert.equal(discover.expected_outcome, 'merged-pr'); // writes only own local packs → auto-merge like extract
  assert.deepEqual(discover.precondition_signals, []);
});

test('growth-discover-packs: fires weekly (standing reflection, worker no-ops when nothing new)', () => {
  assert.equal(discover.precondition().run, true);
});

// --- prose-to-checks-sweep (per-repo, pack_paths config) ---------------------

test('prose-to-checks-sweep: daily/opus/open-pr, no signals', () => {
  assert.equal(proseToChecks.frequency, 'daily');
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

// --- growth-extract (the capture stage) --------------------------------------

test('growth-extract: daily-1h/opus/merged-pr over the window signals', () => {
  assert.equal(extract.frequency, 'daily-1h');
  assert.equal(extract.agent_model, 'opus');
  assert.equal(extract.expected_outcome, 'merged-pr'); // additive local-pack edits auto-merge after CI
  assert.deepEqual(extract.precondition_signals, ['commits', 'prs', 'issues']);
});

test('growth-extract: fires only on a SUBSTANTIVE default-branch change', () => {
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

// --- growth-dedup (the pruning stage) ----------------------------------------

test('growth-dedup: daily+1h/opus/open-pr — a wrongful prune needs a human gate', () => {
  assert.equal(dedup.frequency, 'daily+1h');
  assert.equal(dedup.agent_model, 'opus');
  assert.equal(dedup.expected_outcome, 'open-pr'); // never auto-merged
  assert.deepEqual(dedup.precondition_signals, ['localPacks', 'sharedMount', 'commits']);
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

// --- conversation-extract ----------------------------------------------------

test('conversation-extract: daily-1h/opus/merged-pr over commits + the logs branch', () => {
  assert.equal(conversationExtract.frequency, 'daily-1h');
  assert.equal(conversationExtract.agent_model, 'opus');
  assert.equal(conversationExtract.expected_outcome, 'merged-pr');
  assert.deepEqual(conversationExtract.precondition_signals, ['commits', 'conversationLogs']);
});

test('conversation-extract: a substantive merge (a fresh capture) fires it', () => {
  const v = conversationExtract.precondition({ commits: { substantiveChange: true }, conversationLogs: { present: false } });
  assert.equal(v.run, true);
  assert.match(v.reason, /substantive merge/);
});

test('conversation-extract: the age-based prune fires on a quiet repo — the weekly-sweep crutch retires', () => {
  // A log ages out on wall time, not on the repo changing.
  const v = conversationExtract.precondition({ commits: { substantiveChange: false }, conversationLogs: { present: true, retentionDays: 10 } });
  assert.equal(v.run, true);
  assert.match(v.reason, /retention prune/);
});

test('conversation-extract: quiet with no logs branch, or with retention unset', () => {
  assert.equal(conversationExtract.precondition({ commits: {}, conversationLogs: { present: false } }).run, false);
  assert.equal(conversationExtract.precondition({ commits: {}, conversationLogs: { present: true } }).run, false);
});
