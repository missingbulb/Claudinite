import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pack from '../../packs/basics/pack.mjs';
import update from '../../packs/core/tasks/update/task.mjs';

const TASK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../packs/core/tasks/update');

// The baseline scheduled task every repo runs. This file tested `baselining` until
// #768 Phase 5 retired it; `update` is the successor in the same slot, and what is
// asserted here is the DECLARATION — the contract the scheduler reads — not the
// worker, which update-worker.test.mjs owns.

// The `stamp` / `sharedMount` signal shapes (engine/scheduler/signals/index.mjs).
const S = (stamp = {}, changedPacks = []) => ({
  stamp: { ref: 'abc1234', canonHead: null, ageDays: 0, ...stamp },
  sharedMount: { changedPacks },
});

test('basics contributes the update task structurally, not as a pack.mjs slot', () => {
  // The task is found by the repo's scheduler at tasks/<name>/task.mjs (#394), so
  // the manifest names no task at all.
  assert.equal(pack.run_daily, undefined);
  assert.equal(update.id, 'update');
});

test('update declaration: the 02:00 anchor, an apply stage only when needed, deterministic code_work', () => {
  assert.equal(update.frequency, 'daily-2h'); // a repo's mount is converged before anything reads it
  assert.equal(update.agent_model, 'sonnet'); // the apply stage, requested only when a pack's rules moved
  assert.equal(update.expected_outcome, 'merged-pr');
  assert.deepEqual(update.precondition_signals, ['stamp', 'sharedMount']);
  assert.equal(update.code_work, 'node worker.mjs');
  assert.ok(existsSync(join(TASK_DIR, 'worker.mjs')), 'the deterministic update worker must exist');
  assert.ok(existsSync(join(TASK_DIR, update.agent_instructions)), `worker doc missing: ${update.agent_instructions}`);
});

test('update: self-skips a repo with no vendored mount (a pre-adoption repo)', () => {
  // No stamp means there is no vendored mount to update — expressed structurally
  // rather than by naming any particular repo.
  const v = update.precondition(S({ ref: null, ageDays: null }));
  assert.equal(v.run, false);
  assert.match(v.reason, /no vendored mount/);
});

test('update: quiet when it converged today and no pack moved', () => {
  const v = update.precondition(S({ ageDays: 0.4 }));
  assert.equal(v.run, false);
  assert.match(v.reason, /nothing due/);
});

test('update: runs when a declared pack\'s vendored files moved, however recent the converge', () => {
  const v = update.precondition(S({ ageDays: 0 }, ['basics', 'tidy-repo']));
  assert.equal(v.run, true);
});

test('update: runs once the converge is a day old', () => {
  assert.equal(update.precondition(S({ ageDays: 2.5 })).run, true);
  // An unstamped age is not "recent" — it is unknown, and unknown runs.
  assert.equal(update.precondition(S({ ageDays: null })).run, true);
});

test('update: the precondition decides only whether the worker RUNS', () => {
  // Which mechanism serves the repo is deliberately NOT decided here: the signals
  // carry the stamp, not the declaration, and `servedBy` answers that from the file.
  // A precondition guessing at it from a stamp would be a second, worse answer.
  const src = update.precondition.toString();
  assert.ok(!src.includes('mechanism'), 'the precondition must not re-derive the mechanism');
});

test('update: a run carries the agent\'s binding scope — the apply stage only', () => {
  const v = update.precondition(S({ ageDays: 2 }));
  const ctx = v.context.join(' ');
  assert.match(ctx, /deterministic flows have already run/);
  assert.match(ctx, /Do not re-run the mechanical converge/);
});

// Forcing is deliberately absent here: it is an engine decision (run.mjs
// FORCED_VERDICT) that skips the precondition entirely, so this task declares no
// override signal and has no force branch to test. `engine-tests/scheduler/
// run.test.mjs` owns that behaviour.
