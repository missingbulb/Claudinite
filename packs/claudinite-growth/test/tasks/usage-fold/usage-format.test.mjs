import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  USAGE_FIELDS, USAGE_VERSION, COUNTER_GROUPS, encodeCounters, decodeCounters,
  encodeRow, decodeRow, encodeUsageFile, decodeUsageFile, isTupleFormat, fieldsOf, renderUsageFile,
  withoutStamp, hourKey,
} from '../../../tasks/usage-fold/usage-format.mjs';
import { TASK_RUN_OUTCOMES, TASK_EXEC_STATUSES } from '../../../../../engine/scheduler/run-record.mjs';

test('the task vocabularies are the scheduler\'s own, not a second spelling of them', () => {
  // Two homes for these words would drift the day an outcome is renamed, and the file
  // would then carry counters under names no run ever emits.
  assert.equal(USAGE_FIELDS.tasks, TASK_RUN_OUTCOMES);
  assert.equal(USAGE_FIELDS.taskExec, TASK_EXEC_STATUSES);
});

test('a counter row round-trips through its tuple', () => {
  const row = { runs: 30, failures: 9, errors: 0, blocking: 11, advisory: 0, ciRuns: 1, ciFailures: 1 };
  assert.deepEqual(decodeCounters(encodeCounters(row, USAGE_FIELDS.checks), USAGE_FIELDS.checks), row);
});

test('a field the row has no opinion about is null, and decodes back to no key', () => {
  // Unknown is a third state: a week frozen before `ciRuns` existed did not see zero
  // of them, it could not have seen any. Collapsing that into 0 would make the two
  // indistinguishable forever, since the week tier never recomputes.
  const tuple = encodeCounters({ runs: 5, failures: 1 }, USAGE_FIELDS.checks);
  assert.deepEqual(tuple, [5, 1, null, null, null, null, null]);
  assert.deepEqual(decodeCounters(tuple, USAGE_FIELDS.checks), { runs: 5, failures: 1 });
  assert.deepEqual(decodeCounters([5, 1], USAGE_FIELDS.checks), { runs: 5, failures: 1 },
    'a short tuple says the same thing');
});

test('an empty counter group is omitted from a row, never written as {}', () => {
  const encoded = encodeRow({ captures: 1, merges: 0, sessions: 1, userMessages: 4, userCommands: 0, skillLoads: {}, checks: {}, tasks: {} }, USAGE_FIELDS.day);
  assert.deepEqual(Object.keys(encoded), ['totals']);
  for (const group of COUNTER_GROUPS) assert.deepEqual(decodeRow(encoded, USAGE_FIELDS.day)[group], {});
});

test('a row decodes against the FILE\'s declared vocabulary, not this code\'s', () => {
  // This is what makes the format survive its own evolution: a file written when
  // `checks` was spelled in another order still reads as what it meant.
  const reversed = [...USAGE_FIELDS.checks].reverse();
  const row = { checks: { work: [1, 2, 3, 4, 5, 6, 7] } };
  const decoded = decodeRow(row, USAGE_FIELDS.day, { checks: reversed });
  assert.equal(decoded.checks.work[reversed[0]], 1);
  assert.equal(decoded.checks.work.runs, 7, 'the last slot is `runs` under that header');
});

test('a whole file round-trips, and version 1 decodes as itself', () => {
  const groups = { checks: {}, checkFindings: {}, tasks: {}, taskExec: {}, queue: {} };
  const named = {
    generated: '2026-07-27T04:00:00Z',
    foldedThrough: '2026-07-26',
    runsFoldedThrough: '2026-07-26T03:00:00Z',
    queueFoldedThrough: '2026-07-26T02:00:00Z',
    hours: { '2026-07-26T03': { scheduler: 2, executor: 1, agentic: 1, failed: 0, taskExec: {} } },
    days: { '2026-07-26': { captures: 2, merges: 2, sessions: 1, userMessages: 9, userCommands: 0, skillLoads: { s: 1 }, ...groups } },
    weeks: { '2026-W30': { days: 1, captures: 2, merges: 2, sessionDays: 1, userMessages: 9, userCommands: 0, skillLoads: { s: 1 }, ...groups } },
  };
  const file = encodeUsageFile(named);
  assert.equal(file.version, USAGE_VERSION);
  assert.equal(isTupleFormat(file), true);
  // An hour row carries only its own group; the decode fills the rest in empty, since
  // every consumer folds them key-wise.
  const back = decodeUsageFile(file);
  assert.deepEqual(back.hours['2026-07-26T03'], { ...named.hours['2026-07-26T03'], ...groups, skillLoads: {} });
  assert.deepEqual({ ...back, hours: named.hours }, named);

  const v1 = { version: 1, ...named };
  assert.equal(isTupleFormat(v1), false);
  assert.deepEqual(decodeUsageFile(v1).weeks, named.weeks, 'the original shape passes through untouched');
  assert.deepEqual(decodeUsageFile(v1).hours, {}, 'a file that predates the hour tier starts it empty');
});

test('the stamp is the one line the unchanged-compare ignores', () => {
  // The whole reason the file can carry a freshness stamp at all: it moves every run
  // by construction, so a compare that read it would open a PR an hour on a repo where
  // nothing happened.
  const of = (generated) => renderUsageFile(encodeUsageFile({ generated, foldedThrough: '2026-07-26' }));
  assert.notEqual(of('2026-07-27T04:00:00Z'), of('2026-07-27T05:00:00Z'));
  assert.equal(withoutStamp(of('2026-07-27T04:00:00Z')), withoutStamp(of('2026-07-27T05:00:00Z')));
  // …and it ignores ONLY that line: a day row that moved still reads as a change.
  const moved = renderUsageFile(encodeUsageFile({ generated: '2026-07-27T05:00:00Z', foldedThrough: '2026-07-27' }));
  assert.notEqual(withoutStamp(moved), withoutStamp(of('2026-07-27T04:00:00Z')));
});

test('fieldsOf defaults per key, so a truncated or hand-written header still reads', () => {
  const fields = fieldsOf({ version: 2, fields: { checks: ['runs'] } });
  assert.deepEqual(fields.checks, ['runs']);
  assert.deepEqual(fields.week, [...USAGE_FIELDS.week], 'a key the header omits falls back to this code\'s');
});

test('adding or removing a name is pure key presence — nothing is renumbered', () => {
  // The reason entity names are literal keys and not dictionary ids: week rows freeze
  // forever, so an id table renumbering under them would rewrite history silently.
  const row = (loads) => encodeRow({ captures: 1, skillLoads: loads }, USAGE_FIELDS.day);
  const before = row({ 'skill-a': 2, 'skill-b': 1 });
  const after = row({ 'skill-b': 1, 'skill-c': 4 });
  assert.deepEqual(Object.keys(before.skillLoads), ['skill-a', 'skill-b']);
  assert.deepEqual(Object.keys(after.skillLoads), ['skill-b', 'skill-c']);
  assert.deepEqual(before.totals, after.totals, 'and no other row content moves with it');
});

test('the file is written one line per row, and parses back to what went in', () => {
  const file = encodeUsageFile({
    foldedThrough: '2026-07-26',
    days: {
      '2026-07-26': { captures: 2, skillLoads: { s: 1 }, checks: { work: { runs: 9 } } },
      '2026-07-27': { captures: 1 },
    },
    weeks: { '2026-W30': { days: 1, captures: 2 } },
  });
  const text = renderUsageFile(file);
  assert.deepEqual(JSON.parse(text), file, 'whatever the whitespace, it is the same document');
  const lines = text.split('\n');
  assert.equal(lines.filter((l) => l.startsWith('    "2026-07-2')).length, 2, 'one line per day row');
  assert.ok(text.endsWith('}\n'), 'and the file ends with exactly one newline');
});

test('hourKey files a timestamp under its UTC hour', () => {
  assert.equal(hourKey('2026-08-21T10:41:07Z'), '2026-08-21T10');
  assert.equal(hourKey(null), '');
});

test('an empty row map is written inline, not as an empty block', () => {
  const text = renderUsageFile(encodeUsageFile({ foldedThrough: null }));
  assert.match(text, /"days": \{\},/);
  assert.match(text, /"weeks": \{\}\n/);
  assert.deepEqual(JSON.parse(text).weeks, {});
});

// The outcome words have been renamed twice (preprocess → prework → code-work) and
// the aggregate holds rows written under each. Expanding a row against the file's own
// header recovers the count under the word that file spelled; without a rename on top
// of that, the very next encode writes it against today's vocabulary, which has no
// such key, and the count reaches disk as null. It is a rename, not a retirement — the
// runs happened — so the count has to arrive under the new word.
test('a counter renamed since the row was written survives the round trip', () => {
  for (const legacy of ['prework', 'preprocess']) {
    const header = ['agent', legacy, 'skipped', 'failed', 'deferred'];
    const decoded = decodeRow({ totals: [], tasks: { 'p/t': [3, 7, 1, 0, 0] } }, USAGE_FIELDS.day, { tasks: header });
    assert.equal(decoded.tasks['p/t']['code-work'], 7, `${legacy} should decode under the canonical word`);
    assert.equal(decoded.tasks['p/t'][legacy], undefined, `${legacy} should not survive under its own name`);
    // Re-encoded against TODAY's vocabulary, the count is still on disk.
    const slot = USAGE_FIELDS.tasks.indexOf('code-work');
    assert.equal(encodeRow(decoded, USAGE_FIELDS.day).tasks['p/t'][slot], 7);
  }
});

// A row last written mid-rename can carry both spellings; they count the same thing.
test('both spellings in one row are summed, not overwritten', () => {
  const header = ['agent', 'prework', 'code-work', 'skipped', 'failed', 'deferred'];
  const decoded = decodeRow({ totals: [], tasks: { 'p/t': [0, 4, 5, 0, 0, 0] } }, USAGE_FIELDS.day, { tasks: header });
  assert.equal(decoded.tasks['p/t']['code-work'], 9);
});
