import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pack from '../../packs/basics/pack.mjs';
import baselining from '../../packs/basics/tasks/baselining/task.mjs';

const TASK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../packs/basics/tasks/baselining');

// The `stamp` / `sharedMount` signal shapes (engine/scheduler/signals/index.mjs).
const S = (stamp = {}, changedPacks = []) => ({
  stamp: { ref: 'abc1234', canonHead: null, ageDays: 0, ...stamp },
  sharedMount: { changedPacks },
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
  assert.deepEqual(baselining.precondition_signals, ['stamp', 'sharedMount']);
  assert.equal(baselining.prework, 'node worker.mjs');
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

// Forcing is deliberately absent here: it is an engine decision (run.mjs
// FORCED_VERDICT) that skips the precondition entirely, so this task declares no
// override signal and has no force branch to test. `engine-tests/scheduler/
// run.test.mjs` owns that behaviour.

// ── The exclusive claim (#619) ───────────────────────────────────────────────
// A late/dropped cron fire piles every daily slot into one run, so baselining
// would dispatch beside the tasks it exists to converge the mount for. When the
// mount is genuinely overdue it takes the run instead — what the ENGINE then does
// with `exclusive` is run.test.mjs's business; these pin when this task asks.

test('baselining: claims the run exclusively when the mount is more than a day stale', () => {
  const v = baselining.precondition(S({ canonHead: null, ageDays: 2 }));
  assert.equal(v.run, true);
  assert.equal(v.exclusive, true);
});

test('baselining: a converge that landed within the day claims nothing', () => {
  // The routine nightly pass has no standing to hold the chain up — and this is
  // the common case, so a claim here would defer the fleet's daily work every day.
  const v = baselining.precondition(S({ canonHead: 'def5678', ageDays: 0.4 }));
  assert.equal(v.run, true);
  assert.equal(v.exclusive, false);
  // Exactly at the boundary is not "more than a day".
  assert.equal(baselining.precondition(S({ canonHead: 'def5678', ageDays: 1 })).exclusive, false);
});

test('baselining: stops claiming once the mount is stale enough to be wedged', () => {
  // Days-stale is an unmerged maintenance PR or a broken converge, not a missed
  // fire. Holding every other task back another night does not fix it — it just
  // stops the repo doing anything at all, silently and for as long as it lasts.
  assert.equal(baselining.precondition(S({ canonHead: null, ageDays: 3 })).exclusive, true);
  assert.equal(baselining.precondition(S({ canonHead: null, ageDays: 3.5 })).exclusive, false);
  assert.equal(baselining.precondition(S({ canonHead: null, ageDays: 40 })).run, true, 'it still runs — it just runs alongside');
});

test('baselining: an unstamped mount claims nothing (there is no age to judge)', () => {
  const v = baselining.precondition(S({ canonHead: 'def5678', ageDays: null }));
  assert.equal(v.exclusive, false);
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
