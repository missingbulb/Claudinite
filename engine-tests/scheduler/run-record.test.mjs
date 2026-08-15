import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_RUN_OUTCOMES, TASK_RUN_TAG, emptyTaskRun, taskRunOutcome,
  renderTaskRun, renderTaskRuns, parseTaskRun, parseTaskRuns,
  TASK_EXEC_STATUSES, TASK_EXEC_TAG, renderTaskExec, parseTaskExec, parseTaskExecs,
} from '../../engine/scheduler/run-record.mjs';
import { execRecordLine } from '../../engine/scheduler/record-exec.mjs';

const rec = (over = {}) => ({ pack: 'grow_with_claudinite', task: 'usage-fold', slotId: 'd2026-07-29', run: true, ...over });

// --- what a run did with a task -----------------------------------------------

test('a task its precondition skipped is a skip, whatever else it declared', () => {
  assert.equal(taskRunOutcome(rec({ run: false, reason: 'nothing to do' })), 'skipped');
  assert.equal(taskRunOutcome(rec({ run: false, inline: true, prework: true })), 'skipped');
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
  // Deferral is decided before prework, so the flag can ride a record that
  // would otherwise have read as a prework run.
  assert.equal(taskRunOutcome(rec({ deferred: 'x', inline: true })), 'deferred');
});

test('an agentless task that ran its prework is a prework run', () => {
  assert.equal(taskRunOutcome(rec({ inline: true, prework: true, preworkResult: { ok: true } })), 'prework');
});

test('an agentful task whose prework requested no agent is a prework run, not a skip', () => {
  // The conditional-handoff case: the task RAN — it just absorbed its work into the
  // deterministic pass. Reporting it as a skip would make a task that quietly did its
  // job indistinguishable from one whose precondition said there was nothing to do.
  const quiet = rec({ prework: true, preworkResult: { ok: true }, agentRequested: false, dispatch: { action: 'create' } });
  assert.equal(taskRunOutcome(quiet), 'prework');
  const escalated = rec({ prework: true, preworkResult: { ok: true }, agentRequested: true, dispatch: { action: 'create' } });
  assert.equal(taskRunOutcome(escalated), 'agent');
});

test('failed prework is its own outcome — never a quiet prework run', () => {
  // The one number here whose right value is zero. Folding it into `preprocess` would
  // make a task that fails every night look exactly like one that works every night.
  const failed = rec({ prework: true, inline: true, preworkResult: { ok: false, code: 1 } });
  assert.equal(taskRunOutcome(failed), 'failed');
  const failedAgentful = rec({ prework: true, preworkResult: { ok: false, timedOut: true }, dispatch: { action: 'create' } });
  assert.equal(taskRunOutcome(failedAgentful), 'failed');
});

test('every outcome the deriver can produce is in the declared vocabulary', () => {
  // The fold keys its counters on these words verbatim, so an outcome the vocabulary
  // does not list would be silently dropped there rather than counted.
  const cases = [
    rec({ run: false }), rec({ dispatch: { action: 'create' } }), rec({ dispatch: { action: 'suppress' } }),
    rec({ inline: true }), rec({ prework: true, agentRequested: false }),
    rec({ preworkResult: { ok: false } }),
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
  assert.ok(parseTaskRun(`${TASK_RUN_TAG} v1 basics/baselining [h2026-07-29T04] prework\r`));
});

test('the pre-rename outcome word still parses, normalized to prework', () => {
  // Runs logged before the 2026-08-06 phase-language rename say `preprocess`;
  // the fold must count them under the canonical key, not drop them.
  assert.equal(parseTaskRun(`${TASK_RUN_TAG} v1 a/b [d2026-07-29] preprocess`).outcome, 'prework');
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
    `2026-07-29T04:44:02Z ${TASK_RUN_TAG} v1 grow_with_claudinite/usage-fold [d2026-07-29] prework`,
    '2026-07-29T04:44:03Z ##[endgroup]',
  ].join('\n');
  assert.deepEqual(parseTaskRuns(log).map((r) => `${r.task}:${r.outcome}`), ['tidy-issues:agent', 'usage-fold:prework']);
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

// --- executor-side execution records (the conversation-log census half) --------

test('renderTaskExec/parseTaskExec round-trip for every status', () => {
  for (const status of TASK_EXEC_STATUSES) {
    const line = renderTaskExec({ pack: 'tidy-repo', task: 'tidy-issues', slotId: 'd2026-08-06', status });
    assert.deepEqual(parseTaskExec(line), { pack: 'tidy-repo', task: 'tidy-issues', slotId: 'd2026-08-06', status });
  }
});

test('an exec record embedded in a resolve-dispatch field line still parses', () => {
  // resolve-dispatch prints it as `record: <line>` inside its key:value block.
  const rec = parseTaskExec(`record: ${TASK_EXEC_TAG} v1 p/t [unknown] task-gone`);
  assert.deepEqual(rec, { pack: 'p', task: 't', slotId: 'unknown', status: 'task-gone' });
});

test('an unknown exec status is not a record', () => {
  assert.equal(parseTaskExec(`${TASK_EXEC_TAG} v1 p/t [d2026-08-06] exploded`), null);
  assert.equal(parseTaskExec(`${TASK_EXEC_TAG} v2 p/t [d2026-08-06] success`), null);
});

test('parseTaskExecs picks exec records out of a transcript blob', () => {
  const text = [
    'Task: p/t (slot d2026-08-06)',
    `${TASK_EXEC_TAG} v1 p/t [d2026-08-06] success`,
    'done.',
  ].join('\n');
  assert.deepEqual(parseTaskExecs(text), [{ pack: 'p', task: 't', slotId: 'd2026-08-06', status: 'success' }]);
});

test('execRecordLine validates its three arguments and renders the line', () => {
  assert.equal(execRecordLine(['p/t', 'd2026-08-06', 'success']).line, `${TASK_EXEC_TAG} v1 p/t [d2026-08-06] success`);
  assert.match(execRecordLine(['pt', 'd2026-08-06', 'success']).error, /<pack>\/<task>/);
  assert.match(execRecordLine(['p/t', 'd2026-08-06', 'won']).error, /must be one of/);
  assert.match(execRecordLine(['p/t']).error ?? execRecordLine(['p/t', '', 'success']).error, /slot/);
});

test('a queue-shaped record carries its item number through render and parse', () => {
  // #882: under the queue there is no slot, and the occurrence's identity is the work
  // item. The format has to survive an issue number in the bracketed field, because
  // that is the only join from a record back to the work it describes — the first
  // live queue session wrote `[unknown]` and lost it.
  const line = renderTaskExec({ pack: 'tidy-repo', task: 'tidy-issues', slotId: '#867', status: 'success' });
  assert.equal(line, `${TASK_EXEC_TAG} v1 tidy-repo/tidy-issues [#867] success`);
  assert.deepEqual(parseTaskExec(line), { pack: 'tidy-repo', task: 'tidy-issues', slotId: '#867', status: 'success' });

  // …and two items of the same task stay two records rather than collapsing, which is
  // exactly what a constant in that field costs the fold's (pack, task, slot, status) key.
  const other = renderTaskExec({ pack: 'tidy-repo', task: 'tidy-issues', slotId: '#901', status: 'success' });
  assert.notEqual(parseTaskExec(other).slotId, parseTaskExec(line).slotId);
});
