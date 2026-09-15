// The `claudinite-run-cost` record: the line format both directions, and the
// stopwatch that builds it. Round-tripped rather than pinned as literal text,
// because unlike the retired task-run line this one has a live renderer, and the
// property worth holding is that what a run prints is what a fold reads back.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RUN_COST_TAG, RUN_WORKFLOWS, RUN_PHASES, ALL_RUN_PHASES,
  renderRunCost, parseRunCost, parseRunCosts, startRunCost,
} from '../../src/items/run-record.mjs';

test('a rendered record parses back to the counters it was given', () => {
  const line = renderRunCost({
    workflow: 'scheduler', runId: '34956185618', apiCalls: 42,
    phaseMs: { list: 1200, ask: 3400, drain: 150 },
  });
  assert.deepEqual(parseRunCost(line), {
    workflow: 'scheduler', runId: '34956185618', apiCalls: 42,
    phaseMs: { list: 1200, ask: 3400, drain: 150 },
  });
});

test('a phase that did not happen leaves no key, and an unread call count no field', () => {
  const line = renderRunCost({ workflow: 'executor', runId: '7', phaseMs: { pick: 210 } });
  assert.equal(line, `${RUN_COST_TAG} v1 executor [7] pick=210`);
  assert.deepEqual(parseRunCost(line), {
    workflow: 'executor', runId: '7', apiCalls: null, phaseMs: { pick: 210 },
  });
});

test('a zero phase is a measurement and is written, unlike an absent one', () => {
  // The distinction the whole file turns on: `converge=0` says the converge took
  // under a millisecond, where no key at all says it never ran.
  const line = renderRunCost({ workflow: 'executor', runId: '7', phaseMs: { converge: 0 } });
  assert.match(line, /converge=0$/);
  assert.deepEqual(parseRunCost(line).phaseMs, { converge: 0 });
});

test('a record parses through the Actions timestamp prefix a fetched log carries', () => {
  // Without this the fold reads every downloaded tick log as having printed nothing.
  const line = `2026-09-15T10:08:02.1234567Z ${RUN_COST_TAG} v1 scheduler [99] calls=3 ask=10`;
  assert.deepEqual(parseRunCost(line), {
    workflow: 'scheduler', runId: '99', apiCalls: 3, phaseMs: { ask: 10 },
  });
});

test('an unknown workflow word is not a record — there is no row to count it under', () => {
  assert.equal(parseRunCost(`${RUN_COST_TAG} v1 janitor [1] calls=2`), null);
});

test('an unknown phase word is dropped and the rest of the record still counts', () => {
  // What lets a record printed by a NEWER engine be read for the phases this one
  // knows, rather than thrown away whole.
  const rec = parseRunCost(`${RUN_COST_TAG} v1 executor [8] calls=5 pick=1 telepathy=9`);
  assert.deepEqual(rec.phaseMs, { pick: 1 });
  assert.equal(rec.apiCalls, 5);
});

test('a v2 line is not read as a v1 record', () => {
  assert.equal(parseRunCost(`${RUN_COST_TAG} v2 executor [8] calls=5`), null);
});

test('parseRunCosts picks its own lines out of a whole job log', () => {
  const log = [
    '## Claudinite scheduler run',
    '- asked p/a: no',
    `${RUN_COST_TAG} v1 scheduler [12] calls=4 list=100 ask=200 drain=300`,
    'some trailing noise',
  ].join('\n');
  assert.equal(parseRunCosts(log).length, 1);
  assert.equal(parseRunCosts(log)[0].runId, '12');
});

test('every phase word a workflow can time is one a reader expands a record against', () => {
  // Two lists that could drift independently: a phase a run times but a reader
  // cannot name would be measured and then counted nowhere.
  for (const workflow of RUN_WORKFLOWS) {
    for (const phase of RUN_PHASES[workflow]) assert.ok(ALL_RUN_PHASES.includes(phase), phase);
  }
});

// --- the stopwatch ---------------------------------------------------------------

test('a phase re-opened adds to itself rather than replacing it', () => {
  // The executor passes through pick, claim and converge once per ITEM while the
  // record is the RUN's, so the second pick must not erase the first.
  let t = 0;
  const cost = startRunCost({ workflow: 'executor', runId: '3', apiCalls: () => 0, now: () => t });
  let end = cost.phase('pick'); t = 10; end();
  end = cost.phase('pick'); t = 25; end();
  assert.deepEqual(parseRunCost(cost.record()).phaseMs, { pick: 25 });
});

test('the record is a snapshot of counters that only grow, read afresh each time', () => {
  // What lets the fold key several stamps of one run by its id and keep the largest.
  let t = 0;
  let calls = 1;
  const cost = startRunCost({ workflow: 'executor', runId: '3', apiCalls: () => calls, now: () => t });
  const end = cost.phase('claim'); t = 5; end();
  const first = parseRunCost(cost.record());
  calls = 9;
  const end2 = cost.phase('converge'); t = 8; end2();
  const second = parseRunCost(cost.record());

  assert.equal(first.apiCalls, 1);
  assert.deepEqual(first.phaseMs, { claim: 5 });
  assert.equal(second.apiCalls, 9);
  assert.deepEqual(second.phaseMs, { claim: 5, converge: 3 });
});

test('a run whose caller offers no call counter prints no calls field', () => {
  const cost = startRunCost({ workflow: 'scheduler', runId: '3', now: () => 0 });
  assert.equal(parseRunCost(cost.record()).apiCalls, null);
});
