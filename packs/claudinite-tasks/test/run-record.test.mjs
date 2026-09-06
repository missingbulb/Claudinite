import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_RUN_OUTCOMES, TASK_RUN_TAG, emptyTaskRun, parseTaskRun, parseTaskRuns,
  TASK_EXEC_STATUSES, TASK_EXEC_TAG, renderTaskExec, parseTaskExec, parseTaskExecs,
} from '../run-record.mjs';
import { execRecordLine } from '../record-exec.mjs';

// --- the line format -----------------------------------------------------------

// The slot scheduler wrote these lines and is retired (#974); what survives is the
// READER, against the shape those runs left in logs still inside Actions retention.
// So the pins below are literal lines, not a round trip through a renderer that no
// longer exists.
test('a record of the shape the slot scheduler emitted parses to its four fields', () => {
  assert.deepEqual(parseTaskRun(`${TASK_RUN_TAG} v1 claudinite-growth/usage-fold [d2026-07-29] agent`), {
    pack: 'claudinite-growth', task: 'usage-fold', slotId: 'd2026-07-29', outcome: 'agent',
  });
});

test('a line parses through the Actions timestamp prefix a fetched log carries', () => {
  // Without this the fold reads every downloaded run log as having printed nothing.
  const line = `2026-07-29T04:44:12.3456789Z ${TASK_RUN_TAG} v1 basics/improve-comments [d2026-07-29] skipped`;
  assert.deepEqual(parseTaskRun(line), {
    pack: 'basics', task: 'improve-comments', slotId: 'd2026-07-29', outcome: 'skipped',
  });
});

test('a trailing carriage return does not defeat the parse', () => {
  assert.ok(parseTaskRun(`${TASK_RUN_TAG} v1 basics/baselining [h2026-07-29T04] code-work\r`));
});

test('both pre-rename outcome words still parse, normalized to code-work', () => {
  // Runs logged before the 2026-08-06 phase-language rename say `preprocess`;
  // the fold must count them under the canonical key, not drop them.
  assert.equal(parseTaskRun(`${TASK_RUN_TAG} v1 a/b [d2026-07-29] preprocess`).outcome, 'code-work');
  assert.equal(parseTaskRun(`${TASK_RUN_TAG} v1 a/b [d2026-07-29] prework`).outcome, 'code-work');
});

test('anything that is not a record of this version parses to null', () => {
  assert.equal(parseTaskRun('- claudinite-growth/usage-fold [d2026-07-29] run-inline — fold 3 logs'), null);
  assert.equal(parseTaskRun(`${TASK_RUN_TAG} v2 a/b [d2026-07-29] agent`), null, 'a future shape is not half-read');
  assert.equal(parseTaskRun(`${TASK_RUN_TAG} v1 a/b [d2026-07-29] exploded`), null, 'an unknown outcome mints no counter');
  assert.equal(parseTaskRun(''), null);
});

test('parseTaskRuns picks its own lines out of a whole job log', () => {
  const log = [
    '2026-07-29T04:44:01Z ## Claudinite scheduler',
    '2026-07-29T04:44:01Z - basics/improve-comments [d2026-07-29] create — no dispatch issue yet',
    `2026-07-29T04:44:02Z ${TASK_RUN_TAG} v1 basics/improve-comments [d2026-07-29] agent`,
    `2026-07-29T04:44:02Z ${TASK_RUN_TAG} v1 claudinite-growth/usage-fold [d2026-07-29] code-work`,
    '2026-07-29T04:44:03Z ##[endgroup]',
  ].join('\n');
  assert.deepEqual(parseTaskRuns(log).map((r) => `${r.task}:${r.outcome}`), ['improve-comments:agent', 'usage-fold:code-work']);
  assert.deepEqual(parseTaskRuns(''), []);
});

test('emptyTaskRun carries every outcome at zero, so a row shape never depends on history', () => {
  assert.deepEqual(Object.keys(emptyTaskRun()).sort(), [...TASK_RUN_OUTCOMES].sort());
  assert.ok(Object.values(emptyTaskRun()).every((n) => n === 0));
});

// --- executor-side execution records (the conversation-log census half) --------

test('renderTaskExec/parseTaskExec round-trip for every status', () => {
  for (const status of TASK_EXEC_STATUSES) {
    const line = renderTaskExec({ pack: 'basics', task: 'improve-comments', slotId: 'd2026-08-06', status });
    assert.deepEqual(parseTaskExec(line), { pack: 'basics', task: 'improve-comments', slotId: 'd2026-08-06', status });
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
  const line = renderTaskExec({ pack: 'basics', task: 'improve-comments', slotId: '#867', status: 'success' });
  assert.equal(line, `${TASK_EXEC_TAG} v1 basics/improve-comments [#867] success`);
  assert.deepEqual(parseTaskExec(line), { pack: 'basics', task: 'improve-comments', slotId: '#867', status: 'success' });

  // …and two items of the same task stay two records rather than collapsing, which is
  // exactly what a constant in that field costs the fold's (pack, task, slot, status) key.
  const other = renderTaskExec({ pack: 'basics', task: 'improve-comments', slotId: '#901', status: 'success' });
  assert.notEqual(parseTaskExec(other).slotId, parseTaskExec(line).slotId);
});
