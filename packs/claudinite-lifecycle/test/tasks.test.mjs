import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pack from '../../basics/pack.mjs';
import updateJson from '../tasks/update/task.json' with { type: 'json' };
import { evaluatePrecondition } from '../../claudinite-tasks/shared-code/preconditions.mjs';
import { normalizeTaskDeclaration } from '../../claudinite-tasks/task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const update = normalizeTaskDeclaration(updateJson);

const TASK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../packs/claudinite-lifecycle/tasks/update');

// The baseline scheduled task every repo runs. This file tested `baselining` until
// #768 Phase 5 retired it; `update` is the successor in the same slot, and what is
// asserted here is the DECLARATION — the contract the scheduler reads — not the
// worker, which update-worker.test.mjs owns.

// The `stamp` / `sharedMount` signal shapes (packs/claudinite-tasks/signals/index.mjs).
const S = (stamp = {}, changedPacks = []) => ({
  stamp: { present: true, engineVersion: '60820.1', packVersions: {}, canonHead: null, convergedInWindow: false, ...stamp },
  sharedMount: { changedPacks },
});

test('basics contributes the update task structurally, not as a pack.mjs slot', () => {
  // The task is found by the repo's scheduler at tasks/<name>/task.json (#394), so
  // the manifest names no task at all.
  assert.equal(pack.run_daily, undefined);
  assert.equal(update.id, 'update');
});

test('update declaration: the 02:00 anchor, an apply stage only when needed, deterministic code_work', () => {
  // The head of the morning chain. What used to be an earlier clock hour is now `schedule_after:` on
  // everything that reads the mount this converges (tasks-dispatch DESIGN §17.1).
  assert.equal(update.frequency, 'daily');
  assert.equal(update.agent_model, 'sonnet'); // the apply stage, requested only when a pack's rules moved
  assert.equal(update.expected_outcome, 'supersede_existing_pr'); // one update PR alive at a time: the executor closes the previous cycle's once this one's exists
  assert.deepEqual(update.preconditions, ['none']);
  assert.equal(update.code_work, 'node worker.mjs');
  assert.ok(existsSync(join(TASK_DIR, 'worker.mjs')), 'the deterministic update worker must exist');
  assert.ok(existsSync(join(TASK_DIR, update.agent_instructions)), `worker doc missing: ${update.agent_instructions}`);
});

test('update: a repo with no vendored mount is settings, not a nightly question', () => {
  // "Has this repo a mount to update?" is a fact adoption settled, re-asked every
  // night for an answer that cannot change on its own. Repo shape is not a
  // precondition (task-preconditions DESIGN): such a repo names the task in its
  // `taskScheduler.disabledTasks` and the scheduler never instantiates it.
  const notes = readFileSync(join(TASK_DIR, 'README.md'), 'utf8');
  assert.match(notes, /taskScheduler\.disabledTasks/);
  assert.equal(evaluatePrecondition({ decl: update }, S({ present: false, engineVersion: null })).run, true);
});

// THE QUESTION THIS TASK EXISTS TO ASK — "am I behind the canon?" — CANNOT BE ASKED HERE.
// The scheduler Action deliberately does not read canon (DESIGN §3.3), so `canonHead` is
// always null and no signal carries the canon's versions. Local movement was standing in
// for the comparison, and it answers a different question: "did anything happen here
// lately?", which is equally true of a member that is current and one that canon moved
// past an hour after its converge. LaughCounter and TLDR sat four packs behind for a day
// declining their own updates on exactly that reading, and no forced wake could override
// it — the precondition is re-evaluated at pick (#1344).
//
// So the decline is gone. The asymmetry decides it: declining wrongly costs permanent,
// silent staleness that nothing in the member can repair, while running wrongly costs one
// converge that finds nothing and exits. The worker already owns that decision.
test('update: no repo-side condition may gate it — the input is the CANON', () => {
  // The canon moves when this repo does not, so a silent repo is exactly when the
  // mount most needs the pass, and every local reading of "is anything new?"
  // answers a different question. LaughCounter and TLDR sat four packs behind for a
  // day declining their own updates on exactly that reading (#1344).
  for (const signals of [
    S({ convergedInWindow: true }),
    S({ convergedInWindow: true }, ['basics', 'tidy-repo']),
    S({ convergedInWindow: false }),
    {},
  ]) {
    assert.equal(evaluatePrecondition({ decl: update }, signals).run, true);
  }
});

test('update: the apply stage\'s binding scope is task.md\'s, not a context line', () => {
  // Standing instruction, not a term-computed scope list: it says the same thing on
  // every run, so it belongs where the worker reads it.
  const worker = readFileSync(join(TASK_DIR, update.agent_instructions), 'utf8');
  assert.match(worker, /The deterministic half already ran/);
  assert.match(worker, /binding scope — do not widen it/);
});

// Forcing is deliberately absent here: it is an engine decision (run.mjs
// FORCED_VERDICT) that skips the precondition entirely, so this task declares no
// override signal and has no force branch to test. `packs/claudinite-tasks/test/
// run.test.mjs` owns that behaviour.
