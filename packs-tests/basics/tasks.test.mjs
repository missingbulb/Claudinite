import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pack from '../../packs/basics/pack.mjs';
import baselining from '../../packs/basics/tasks/baselining/task.mjs';

const TASK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../packs/basics/tasks/baselining');

// The `stamp` / `sharedMount` signal shapes (engine/scheduler/signals/index.mjs).
const S = (stamp = {}, changedPacks = [], overrides = {}) => ({
  stamp: { ref: 'abc1234', canonHead: null, ageDays: 0, ...stamp },
  sharedMount: { changedPacks },
  overrides,
});

test('basics contributes baselining structurally, not as a pack.mjs slot', () => {
  // The task moved out of the manifest: the repo's scheduler finds
  // tasks/<name>/task.mjs structurally (#394).
  assert.equal(pack.run_daily, undefined);
  assert.equal(baselining.id, 'baselining');
});

test('baselining declaration: the 02:00 slot, sonnet residual stage, deterministic preprocessing', () => {
  assert.equal(baselining.frequency, 'daily-2h'); // a repo's mount is converged before anything reads it
  assert.equal(baselining.agent_model, 'sonnet'); // the residual judgment stage, requested only when needed
  assert.equal(baselining.expected_outcome, 'merged-pr');
  assert.deepEqual(baselining.precondition_signals, ['stamp', 'sharedMount', 'overrides']);
  assert.equal(baselining.agent_preprocessing, 'node worker.mjs');
  assert.ok(existsSync(join(TASK_DIR, 'worker.mjs')), 'the deterministic converge worker must exist');
  assert.ok(existsSync(join(TASK_DIR, baselining.agent_instructions)), `worker doc missing: ${baselining.agent_instructions}`);
});

test('baselining: self-skips a repo with no vendored mount (the canon\'s own repo, a pre-adoption repo)', () => {
  // The legacy gate's `isHome` skip, now expressed structurally: no stamp means
  // there is no vendored mount to refresh.
  const v = baselining.precondition(S({ ref: null, ageDays: null }));
  assert.equal(v.run, false);
  assert.match(v.reason, /no vendored mount/);
});

test('baselining: runs when the mount is behind the canon head', () => {
  const v = baselining.precondition(S({ ref: 'abc1234', canonHead: 'def5678' }));
  assert.equal(v.run, true);
  assert.match(v.reason, /behind canon head/);
});

test('baselining: falls back to stamp age when the canon head is unknown (the everyday trigger)', () => {
  assert.equal(baselining.precondition(S({ canonHead: null, ageDays: 2.5 })).run, true);
  assert.equal(baselining.precondition(S({ canonHead: null, ageDays: 0.5 })).run, false);
});

test('baselining: runs when a declared pack\'s vendored files moved', () => {
  const v = baselining.precondition(S({ canonHead: 'abc1234' }, ['basics', 'tidy-repo']));
  assert.equal(v.run, true);
  assert.match(v.reason, /basics, tidy-repo/);
});

// ── FORCE_BASELINING, the manual override ───────────────────────────────────
// The age gate means a repo that baselined this morning is not due again for over
// a day, so a canon fix worth propagating TODAY had no lever short of editing
// each repo's stamp by hand. These pin the override's exact contract.

test('baselining: FORCE_BASELINING=true runs a mount far too fresh to be due', () => {
  const quiet = S({ canonHead: 'abc1234', ageDays: 0.1 });
  assert.equal(baselining.precondition(quiet).run, false, 'guard: this is the not-due case');

  const v = baselining.precondition(S({ canonHead: 'abc1234', ageDays: 0.1 }, [], { FORCE_BASELINING: 'true' }));
  assert.equal(v.run, true);
  assert.match(v.reason, /FORCE_BASELINING/);
  // Forcing must not widen what the agent may do — the binding scope is the same.
  assert.deepEqual(v.context, baselining.precondition(S({ canonHead: 'def5678' })).context);
});

test('baselining: only the literal "true" forces — a present key is not consent', () => {
  const notDue = { canonHead: 'abc1234', ageDays: 0.1 };
  for (const bag of [{ FORCE_BASELINING: 'false' }, { FORCE_BASELINING: '' }, { FORCE_BASELINING: 'yes' }, { FORCE_BASELINING: '1' }]) {
    assert.equal(baselining.precondition(S(notDue, [], bag)).run, false, `${JSON.stringify(bag)} must not force`);
  }
});

test('baselining: forcing never overrides the no-vendored-mount guard', () => {
  // Ordering matters: the canon repo has no mount, and a forced fleet-wide run
  // must not make it try to refresh one it does not have.
  const v = baselining.precondition(S({ ref: null, ageDays: null }, [], { FORCE_BASELINING: 'true' }));
  assert.equal(v.run, false);
  assert.match(v.reason, /no vendored mount/);
});

test('baselining: another task\'s override key is not this task\'s business', () => {
  const v = baselining.precondition(S({ canonHead: 'abc1234', ageDays: 0.1 }, [], { FORCE_SOMETHING_ELSE: 'true' }));
  assert.equal(v.run, false);
});

test('baselining: quiet when the mount is at the canon head and nothing moved', () => {
  const v = baselining.precondition(S({ ref: 'abc1234', canonHead: 'abc1234' }));
  assert.equal(v.run, false);
});

test('baselining: a run carries the agent\'s binding scope — residual judgment only', () => {
  const v = baselining.precondition(S({ canonHead: 'def5678' }));
  const ctx = v.context.join(' ');
  assert.match(ctx, /Preprocessing has already converged/);
  assert.match(ctx, /Do not re-run the mechanical converge/);
});
