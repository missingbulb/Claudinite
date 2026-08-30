import { test } from 'node:test';
import assert from 'node:assert/strict';
import usageFold from '../../../tasks/usage-fold/task.mjs';

// The usage-fold declaration and precondition. UNIT tests over a pure precondition:
// they hand-build the signals object, so they assert the DECISION and never that the
// scheduler can produce the input.

// --- usage-fold (the skill-usage aggregate) ----------------------------------

test('usage-fold: daily/agentless/merged-pr, on the two movement signals', () => {
  assert.equal(usageFold.id, 'usage-fold');
  // Daily since the cron went to two ticks a day: a frequency finer than the cron cannot be
  // honoured (tasks-dispatch DESIGN §17.1). The hour rows are still recomputed from source
  // across a three-day window, so only the newest rows' freshness moves.
  assert.equal(usageFold.frequency, 'daily');
  assert.equal(usageFold.agent_model, 'none');
  assert.equal(usageFold.expected_outcome, 'pr'); // its policy is proven against this pack's merge rules in merge-policy.test.mjs
  assert.deepEqual(usageFold.precondition_signals, ['commits', 'conversationLogs']);
  // An agentless task's whole work is its preprocessing — with none it does nothing.
  assert.equal(usageFold.code_work, 'node worker.mjs');
  assert.ok(usageFold.code_work_timeout > 0);
});

test('usage-fold: a commit or a captured session in the window is what runs it', () => {
  const commit = usageFold.precondition({ commits: { count: 2 }, conversationLogs: { newestLogAgeDays: 5 } });
  assert.equal(commit.run, true);
  assert.match(commit.reason, /2 commit\(s\)/);

  const captured = usageFold.precondition({ commits: { count: 0 }, conversationLogs: { newestLogAgeDays: 0.02 } });
  assert.equal(captured.run, true);
  assert.match(captured.reason, /a session captured/);

  const both = usageFold.precondition({ commits: { count: 1 }, conversationLogs: { newestLogAgeDays: 0.01 } });
  assert.match(both.reason, /and/, 'both movements are named, since the fold covers both');
});

test('usage-fold: a quiet period declines, and loses nothing by it', () => {
  // The run and queue reads are watermarked, so declining defers them rather than dropping
  // them, and the dashboard tops up its freshest hours from the run listing it already fetches.
  const quiet = usageFold.precondition({ commits: { count: 0 }, conversationLogs: { present: true, logCount: 40, newestLogAgeDays: 3 } });
  assert.equal(quiet.run, false);
  assert.match(quiet.reason, /nothing moved this period/);
});

test('usage-fold: an unknown signal is not movement — and does not wedge the task', () => {
  // `newestLogAgeDays` is null when the branch does not exist or carries no readable
  // stamp. Unknown must not read as "a session just captured", and a missing signal
  // must not throw: a precondition that cannot be evaluated stops the task forever.
  assert.equal(usageFold.precondition({ conversationLogs: { present: false, newestLogAgeDays: null } }).run, false);
  assert.equal(usageFold.precondition({}).run, false);
  assert.doesNotThrow(() => usageFold.precondition({ commits: {}, conversationLogs: {} }));
});
