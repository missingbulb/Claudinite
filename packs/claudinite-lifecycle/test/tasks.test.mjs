import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pack from '../../basics/pack.mjs';
import update from '../tasks/update/task.mjs';

const TASK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../packs/claudinite-lifecycle/tasks/update');

// The baseline scheduled task every repo runs. This file tested `baselining` until
// #768 Phase 5 retired it; `update` is the successor in the same slot, and what is
// asserted here is the DECLARATION — the contract the scheduler reads — not the
// worker, which update-worker.test.mjs owns.

// The `stamp` / `sharedMount` signal shapes (engine/scheduler/signals/index.mjs).
const S = (stamp = {}, changedPacks = []) => ({
  stamp: { present: true, engineVersion: '60820.1', packVersions: {}, canonHead: null, convergedInWindow: false, ...stamp },
  sharedMount: { changedPacks },
});

test('basics contributes the update task structurally, not as a pack.mjs slot', () => {
  // The task is found by the repo's scheduler at tasks/<name>/task.mjs (#394), so
  // the manifest names no task at all.
  assert.equal(pack.run_daily, undefined);
  assert.equal(update.id, 'update');
});

test('update declaration: the 02:00 anchor, an apply stage only when needed, deterministic code_work', () => {
  // The head of the morning chain. What used to be an earlier clock hour is now `schedule_after:` on
  // everything that reads the mount this converges (tasks-dispatch DESIGN §17.1).
  assert.equal(update.frequency, 'daily');
  assert.equal(update.agent_model, 'sonnet'); // the apply stage, requested only when a pack's rules moved
  assert.equal(update.expected_outcome, 'merged-pr');
  assert.deepEqual(update.precondition_signals, ['stamp', 'sharedMount']);
  assert.equal(update.code_work, 'node worker.mjs');
  assert.ok(existsSync(join(TASK_DIR, 'worker.mjs')), 'the deterministic update worker must exist');
  assert.ok(existsSync(join(TASK_DIR, update.agent_instructions)), `worker doc missing: ${update.agent_instructions}`);
});

test('update: self-skips a repo with no vendored mount (a pre-adoption repo)', () => {
  // No installed versions means there is no vendored mount to update — expressed
  // structurally rather than by naming any particular repo.
  const v = update.precondition(S({ present: false, engineVersion: null }));
  assert.equal(v.run, false);
  assert.match(v.reason, /no vendored mount/);
});

// Newness from the mount's OWN movement in the window, never from a datetime in the
// declaration: the one that used to be stamped there recorded the last full
// re-vendor, so a member converging nightly read as permanently overdue (#1252).
test('update: quiet when the mount converged in this window and no pack moved', () => {
  const v = update.precondition(S({ convergedInWindow: true }));
  assert.equal(v.run, false);
  assert.match(v.reason, /nothing due/);
});

test('update: runs when a declared pack\'s vendored files moved, however recent the converge', () => {
  const v = update.precondition(S({ convergedInWindow: true }, ['basics', 'tidy-repo']));
  assert.equal(v.run, true);
});

test('update: runs when the mount did not move in this window', () => {
  assert.equal(update.precondition(S({ convergedInWindow: false })).run, true);
});

test('update: the precondition decides only whether the worker RUNS', () => {
  // It reads the collected signals and nothing else. In particular it never reaches
  // for a date: the only datetime a declaration ever carried was deleted in #1252
  // precisely because it answered a different question than the one asked of it.
  const src = update.precondition.toString();
  assert.ok(!src.includes('mechanism'), 'the precondition must not re-derive the mechanism');
  assert.ok(!/\bageDays\b|stamp\.updated/.test(src), 'newness comes from the window, never from a stamped date');
});

test('update: a run carries the agent\'s binding scope — the apply stage only', () => {
  const v = update.precondition(S());
  const ctx = v.context.join(' ');
  assert.match(ctx, /deterministic flows have already run/);
  assert.match(ctx, /Do not re-run the mechanical converge/);
});

// Forcing is deliberately absent here: it is an engine decision (run.mjs
// FORCED_VERDICT) that skips the precondition entirely, so this task declares no
// override signal and has no force branch to test. `engine-tests/scheduler/
// run.test.mjs` owns that behaviour.
