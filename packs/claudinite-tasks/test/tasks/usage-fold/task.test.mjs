import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import usageFoldJson from '../../../tasks/usage-fold/task.json' with { type: 'json' };
import { evaluatePrecondition, loadTaskTerms, preconditionSignals } from '../../../shared-code/preconditions.mjs';
import { normalizeTaskDeclaration } from '../../../task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const usageFold = normalizeTaskDeclaration(usageFoldJson);

// The usage-fold declaration and its precondition expression. The verdicts go
// through `evaluatePrecondition` — the same seam the executor calls at pick — so
// what these assert is what production evaluates, window and all; only the
// signals object is hand-built.

const TASK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../tasks/usage-fold');
const terms = await loadTaskTerms(TASK_DIR);
// The cadence term reads the task's own run history at a chosen instant: an empty
// history holds, and the signal under test decides.
const SCHEDULE = { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 };
const AT = '2026-09-05T16:00:00Z';
const NO_RUNS = { runs: { list: [] } };
const verdict = (signals) => evaluatePrecondition({ decl: usageFold, terms }, { ...NO_RUNS, ...signals }, {}, null, AT, SCHEDULE);

// --- usage-fold (the skill-usage aggregate) ----------------------------------

test('usage-fold: the signals its gate reads are derived from its conditions', () => {
  // Derived, never declared: the conditions name what they read, and that is the
  // whole set the executor collects before asking.
  assert.deepEqual(preconditionSignals(usageFold.preconditions, terms), ['runs', 'commits', 'conversationLogs']);
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
  // This task measures the MACHINERY, so a task's own delivery is exactly what the
  // aggregate folds: a window whose only commit is non-substantive (a task's own)
  // still runs it, where every other movement-gated task would read it as silence.
  const machineryOnly = verdict({ commits: { count: 1, substantiveChange: false }, conversationLogs: { newestLogAgeDays: 5 } });
  assert.equal(machineryOnly.run, true);
  assert.match(machineryOnly.reason, /1 default-branch commit/);
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
