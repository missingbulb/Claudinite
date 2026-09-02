import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import usageFold from '../../../tasks/usage-fold/task.mjs';
import { evaluatePrecondition, loadTaskTerms, preconditionSignals } from '../../../shared-code/preconditions.mjs';

// The usage-fold declaration and its precondition expression. The verdicts go
// through `evaluatePrecondition` — the same seam the executor calls at pick — so
// what these assert is what production evaluates, window and all; only the
// signals object is hand-built.

const TASK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../tasks/usage-fold');
const terms = await loadTaskTerms(TASK_DIR);
const verdict = (signals) => evaluatePrecondition({ decl: usageFold, terms }, signals);

// --- usage-fold (the skill-usage aggregate) ----------------------------------

test('usage-fold: daily/agentless/pr, on the two movement signals', () => {
  assert.equal(usageFold.id, 'usage-fold');
  // Daily since the cron went to two ticks a day: a frequency finer than the cron cannot be
  // honoured (tasks-dispatch DESIGN §17.1). The hour rows are still recomputed from source
  // across a three-day window, so only the newest rows' freshness moves.
  assert.equal(usageFold.frequency, 'daily');
  assert.equal(usageFold.agent_model, 'none');
  assert.equal(usageFold.expected_outcome, 'pr'); // its policy is proven against this pack's merge rules in merge-policy.test.mjs
  // Derived, never declared: the conditions name what they read.
  assert.equal(usageFold.precondition_signals, undefined);
  assert.deepEqual(preconditionSignals(usageFold.preconditions, terms), ['commits', 'conversationLogs']);
  // An agentless task's whole work is its preprocessing — with none it does nothing.
  assert.equal(usageFold.code_work, 'node worker.mjs');
  assert.ok(usageFold.code_work_timeout > 0);
});

test('usage-fold: a commit or a captured session in the window is what runs it', () => {
  const commit = verdict({ commits: { count: 2 }, conversationLogs: { newestLogAgeDays: 5 } });
  assert.equal(commit.run, true);
  assert.match(commit.reason, /2 default-branch commit\(s\)/);

  const captured = verdict({ commits: { count: 0 }, conversationLogs: { newestLogAgeDays: 0.02 } });
  assert.equal(captured.run, true);
  assert.match(captured.reason, /conversation log was captured/);
});

test('usage-fold: task-authored movement counts here, unlike every other task', () => {
  // `any-commit`, deliberately: this task measures the MACHINERY, so a task's own
  // delivery is exactly what the aggregate folds. Every other movement term reads a
  // field the collectors have already stripped task output out of.
  assert.ok(usageFold.preconditions.some((c) => c.includes('any-commit')));
  assert.ok(!usageFold.preconditions.some((c) => c.includes('substantive-change')));
});

test('usage-fold: a quiet period declines, and loses nothing by it', () => {
  // The run and queue reads are watermarked, so declining defers them rather than dropping
  // them, and the dashboard tops up its freshest hours from the run listing it already fetches.
  const quiet = verdict({ commits: { count: 0 }, conversationLogs: { present: true, logCount: 40, newestLogAgeDays: 3 } });
  assert.equal(quiet.run, false);
  assert.match(quiet.reason, /no default-branch commit/);
  assert.match(quiet.reason, /no conversation log was captured/);
});

test('usage-fold: an unknown signal is not movement — and does not wedge the task', () => {
  // `newestLogAgeDays` is null when the branch does not exist or carries no readable
  // stamp. Unknown must not read as "a session just captured", and a missing signal
  // must not throw: a precondition that cannot be evaluated stops the task forever.
  assert.equal(verdict({ conversationLogs: { present: false, newestLogAgeDays: null } }).run, false);
  assert.equal(verdict({}).run, false);
  assert.doesNotThrow(() => verdict({ commits: {}, conversationLogs: {} }));
});

test('usage-fold: a signal that could not be read is an ERROR, never a quiet decline', () => {
  // The whole fail direction. A decline is permanent silence nothing turns red over;
  // an error parks the item where the re-queue lever retries it.
  const failed = verdict({ commits: { error: 'the commits API answered 502' }, conversationLogs: {} });
  assert.equal(failed.run, undefined);
  assert.match(failed.error, /commits.*502/);
});
