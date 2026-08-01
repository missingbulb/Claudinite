import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_RUN_OUTCOMES, TASK_RUN_TAG, emptyTaskRun, taskRunOutcome,
  renderTaskRun, renderTaskRuns, parseTaskRun, parseTaskRuns,
} from '../../engine/scheduler/run-record.mjs';

const rec = (over = {}) => ({ pack: 'grow_with_claudinite', task: 'usage-fold', slotId: 'd2026-07-29', run: true, ...over });

// --- what a run did with a task -----------------------------------------------

test('a task its precondition skipped is a skip, whatever else it declared', () => {
  assert.equal(taskRunOutcome(rec({ run: false, reason: 'nothing to do' })), 'skipped');
  assert.equal(taskRunOutcome(rec({ run: false, inline: true, preprocessing: true })), 'skipped');
});

test('a filed dispatch is an agent run; a suppressed or already-filed one is a deferral', () => {
  assert.equal(taskRunOutcome(rec({ dispatch: { action: 'create' } })), 'agent');
  // at-most-one-open: the work was wanted and no new agent run started. Counting this
  // as an agent run would report executions that never happened; counting it as a
  // skip would hide a task whose dispatches are piling up unrun.
  assert.equal(taskRunOutcome(rec({ dispatch: { action: 'suppress', openIssue: 7 } })), 'deferred');
  assert.equal(taskRunOutcome(rec({ dispatch: { action: 'skip' } })), 'deferred');
});

test('a task deferred by another task\'s exclusive claim is a deferral, not a skip', () => {
  // Same reasoning as at-most-one-open above: the precondition DID find work, and
  // this run chose not to do it. Counting it as a skip would make a repo whose
  // nightly chain is repeatedly held back look exactly like one with nothing to do.
  assert.equal(taskRunOutcome(rec({ deferred: 'deferred — basics/baselining claimed this run exclusively' })), 'deferred');
  // Deferral is decided before preprocessing, so the flag can ride a record that
  // would otherwise have read as a preprocess run.
  assert.equal(taskRunOutcome(rec({ deferred: 'x', inline: true })), 'deferred');
});

test('an agentless task that ran its preprocessing is a preprocess run', () => {
  assert.equal(taskRunOutcome(rec({ inline: true, preprocessing: true, preprocessResult: { ok: true } })), 'preprocess');
});

test('an agentful task whose preprocessing requested no agent is a preprocess run, not a skip', () => {
  // The conditional-handoff case: the task RAN — it just absorbed its work into the
  // deterministic pass. Reporting it as a skip would make a task that quietly did its
  // job indistinguishable from one whose precondition said there was nothing to do.
  const quiet = rec({ preprocessing: true, preprocessResult: { ok: true }, agentRequested: false, dispatch: { action: 'create' } });
  assert.equal(taskRunOutcome(quiet), 'preprocess');
  const escalated = rec({ preprocessing: true, preprocessResult: { ok: true }, agentRequested: true, dispatch: { action: 'create' } });
  assert.equal(taskRunOutcome(escalated), 'agent');
});

test('failed preprocessing is its own outcome — never a quiet preprocess run', () => {
  // The one number here whose right value is zero. Folding it into `preprocess` would
  // make a task that fails every night look exactly like one that works every night.
  const failed = rec({ preprocessing: true, inline: true, preprocessResult: { ok: false, code: 1 } });
  assert.equal(taskRunOutcome(failed), 'failed');
  const failedAgentful = rec({ preprocessing: true, preprocessResult: { ok: false, timedOut: true }, dispatch: { action: 'create' } });
  assert.equal(taskRunOutcome(failedAgentful), 'failed');
});

test('every outcome the deriver can produce is in the declared vocabulary', () => {
  // The fold keys its counters on these words verbatim, so an outcome the vocabulary
  // does not list would be silently dropped there rather than counted.
  const cases = [
    rec({ run: false }), rec({ dispatch: { action: 'create' } }), rec({ dispatch: { action: 'suppress' } }),
    rec({ inline: true }), rec({ preprocessing: true, agentRequested: false }),
    rec({ preprocessResult: { ok: false } }),
  ];
  for (const c of cases) assert.ok(TASK_RUN_OUTCOMES.includes(taskRunOutcome(c)), taskRunOutcome(c));
});

// --- the line format -----------------------------------------------------------

test('render and parse round-trip — the whole point of them living in one file', () => {
  const r = rec({ dispatch: { action: 'create' } });
  assert.equal(renderTaskRun(r), `${TASK_RUN_TAG} v1 grow_with_claudinite/usage-fold [d2026-07-29] agent`);
  assert.deepEqual(parseTaskRun(renderTaskRun(r)), {
    pack: 'grow_with_claudinite', task: 'usage-fold', slotId: 'd2026-07-29', outcome: 'agent',
  });
});

test('a line parses through the Actions timestamp prefix a fetched log carries', () => {
  // Without this the fold reads every downloaded run log as having printed nothing.
  const line = `2026-07-29T04:44:12.3456789Z ${TASK_RUN_TAG} v1 tidy-repo/tidy-issues [d2026-07-29] skipped`;
  assert.deepEqual(parseTaskRun(line), {
    pack: 'tidy-repo', task: 'tidy-issues', slotId: 'd2026-07-29', outcome: 'skipped',
  });
});

test('a trailing carriage return does not defeat the parse', () => {
  assert.ok(parseTaskRun(`${TASK_RUN_TAG} v1 basics/baselining [h2026-07-29T04] preprocess\r`));
});

test('anything that is not a record of this version parses to null', () => {
  assert.equal(parseTaskRun('- grow_with_claudinite/usage-fold [d2026-07-29] run-inline — fold 3 logs'), null);
  assert.equal(parseTaskRun(`${TASK_RUN_TAG} v2 a/b [d2026-07-29] agent`), null, 'a future shape is not half-read');
  assert.equal(parseTaskRun(`${TASK_RUN_TAG} v1 a/b [d2026-07-29] exploded`), null, 'an unknown outcome mints no counter');
  assert.equal(parseTaskRun(''), null);
});

test('parseTaskRuns picks its own lines out of a whole job log', () => {
  const log = [
    '2026-07-29T04:44:01Z ## Claudinite scheduler',
    '2026-07-29T04:44:01Z - tidy-repo/tidy-issues [d2026-07-29] create — no dispatch issue yet',
    `2026-07-29T04:44:02Z ${TASK_RUN_TAG} v1 tidy-repo/tidy-issues [d2026-07-29] agent`,
    `2026-07-29T04:44:02Z ${TASK_RUN_TAG} v1 grow_with_claudinite/usage-fold [d2026-07-29] preprocess`,
    '2026-07-29T04:44:03Z ##[endgroup]',
  ].join('\n');
  assert.deepEqual(parseTaskRuns(log).map((r) => `${r.task}:${r.outcome}`), ['tidy-issues:agent', 'usage-fold:preprocess']);
  assert.deepEqual(parseTaskRuns(''), []);
});

test('renderTaskRuns emits one line per evaluation', () => {
  const lines = renderTaskRuns([rec({ dispatch: { action: 'create' } }), rec({ task: 'growth-extract', run: false })]).split('\n');
  assert.equal(lines.length, 2);
  assert.equal(parseTaskRuns(lines.join('\n')).length, 2);
});

test('emptyTaskRun carries every outcome at zero, so a row shape never depends on history', () => {
  assert.deepEqual(Object.keys(emptyTaskRun()).sort(), [...TASK_RUN_OUTCOMES].sort());
  assert.ok(Object.values(emptyTaskRun()).every((n) => n === 0));
});
