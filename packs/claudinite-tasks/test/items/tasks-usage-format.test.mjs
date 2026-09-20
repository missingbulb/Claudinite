// The tasks-usage file's on-disk shape: the round trip, the unknown-is-not-zero
// rule, and the two vocabularies the file re-spells that could drift from the code
// they describe.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUEUE_OUTCOMES, TASKS_USAGE_FIELDS, COUNTER_GROUPS, WEEK_GROUPS, HOUR_GROUPS,
  encodeRow, decodeRow, encodeTasksUsageFile, decodeTasksUsageFile, renderTasksUsageFile,
  fieldsOf,
} from '../../src/items/tasks-usage-format.mjs';
import {
  OUTCOME_DONE, OUTCOME_DELIVERED, OUTCOME_OBSOLETE, PARK_KINDS,
} from '../../public/task-constants.mjs';
import { outcomeOf } from '../../public/work-item-grammar.mjs';
import { ALL_RUN_PHASES } from '../../src/items/run-record.mjs';

test('the outcome words this file counts are exactly what a closed item decodes to', () => {
  // Re-spelled here rather than imported, because the engine and this pack land on
  // separate cycles — so the guard is this, driving the real decoder.
  const words = new Set([
    outcomeOf({ labels: [] }) ?? 'none',
    ...[OUTCOME_DONE, OUTCOME_DELIVERED, OUTCOME_OBSOLETE].map((l) => outcomeOf({ labels: [{ name: l }] }) ?? 'none'),
  ]);
  assert.deepEqual([...words].sort(), [...QUEUE_OUTCOMES].sort());
});

test('the park and phase vocabularies are the ones their own modules define', () => {
  // A counter key that drifted from the label a park actually wears, or from the
  // token a run actually prints, would count nothing at all.
  assert.deepEqual([...TASKS_USAGE_FIELDS.parks], [...PARK_KINDS]);
  for (const phase of ALL_RUN_PHASES) assert.ok(TASKS_USAGE_FIELDS.runCosts.includes(phase), phase);
});

test('a counter row round-trips through its tuple, and an absent field stays absent', () => {
  const row = { runs: 2, minutesBilled: 5, workflows: {}, runCosts: {}, queue: {}, parks: {}, latency: {} };
  const back = decodeRow(encodeRow(row, TASKS_USAGE_FIELDS.day), TASKS_USAGE_FIELDS.day);
  assert.equal(back.runs, 2);
  assert.equal(back.minutesBilled, 5);
  assert.ok(!('jobs' in back), 'a field nothing had an opinion on decodes to no key');
  assert.ok(!('spend' in back));
});

test('a row short of the current vocabulary decodes as far as it goes', () => {
  // A week frozen before a counter existed: the fold grows it from the first day
  // that carries the field rather than reading back NaN.
  const back = decodeRow({ totals: [3] }, TASKS_USAGE_FIELDS.day);
  assert.equal(back.runs, 3);
  assert.ok(!('minutesBilled' in back));
});

test('a file is decoded against the vocabulary it declares, not against this code', () => {
  // What lets a field added or retired on the writing side read correctly with no
  // coordinated release.
  const file = { version: 1, fields: { day: ['minutesBilled', 'runs'] }, days: { d: { totals: [9, 4] } } };
  const back = decodeTasksUsageFile(file);
  assert.equal(back.days.d.minutesBilled, 9);
  assert.equal(back.days.d.runs, 4);
});

test('fieldsOf falls back per key, so a truncated header still decodes the rest', () => {
  const fields = fieldsOf({ fields: { day: ['runs'] } });
  assert.deepEqual(fields.day, ['runs']);
  assert.deepEqual(fields.parks, TASKS_USAGE_FIELDS.parks);
});

test('an empty sub-map is omitted from the written row rather than written as {}', () => {
  const written = encodeRow({ runs: 1, workflows: {}, queue: {} }, TASKS_USAGE_FIELDS.day);
  assert.deepEqual(Object.keys(written), ['totals']);
});

test('the week tier drops the per-run map and the hour tier the item-derived ones', () => {
  // A week's keys are frozen forever, so a map keyed per occurrence cannot live
  // there; an hour is the live cost picture and has no use for outcomes.
  const row = {
    runs: 1,
    workflows: { executor: { runs: 1 } },
    runCosts: { 77: { apiCalls: 3 } },
    queue: { 'p/a': { done: 1 } },
    parks: {}, latency: {},
  };
  assert.ok(!('runCosts' in encodeRow(row, TASKS_USAGE_FIELDS.week, WEEK_GROUPS)));
  assert.ok('runCosts' in encodeRow(row, TASKS_USAGE_FIELDS.hour, HOUR_GROUPS));
  assert.ok(!('queue' in encodeRow(row, TASKS_USAGE_FIELDS.hour, HOUR_GROUPS)));
  assert.ok('runCosts' in encodeRow(row, TASKS_USAGE_FIELDS.day, COUNTER_GROUPS));
});

test('the rendered file is one line per row, so a diff reads per bucket', () => {
  const text = renderTasksUsageFile(encodeTasksUsageFile({
    generated: 'x', days: { '2026-09-15': { runs: 1, workflows: {}, runCosts: {}, queue: {}, parks: {}, latency: {} } },
  }));
  const dayLines = text.split('\n').filter((l) => l.includes('"2026-09-15"'));
  assert.equal(dayLines.length, 1);
  assert.doesNotThrow(() => JSON.parse(text));
});
