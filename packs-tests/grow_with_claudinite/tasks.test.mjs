import { test } from 'node:test';
import assert from 'node:assert/strict';
import discover from '../../packs/grow_with_claudinite/tasks/growth-discover-packs/task.mjs';
import proseToChecks from '../../packs/grow_with_claudinite/tasks/prose-to-checks-sweep/task.mjs';

// grow_with_claudinite per-repo task declarations + preconditions
// (per-project-scheduling redesign: discover-packs and prose-to-checks are local,
// per-repo operations, not fleet-scoped).

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
