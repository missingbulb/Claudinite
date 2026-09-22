import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTiming, parseTiming, parseTimings, TIMING_RULES } from '../../engine/checks/check-timing.mjs';

const many = (n) => Array.from({ length: n }, (_, i) => ({ id: `rule-${i}`, ms: i }));

test('renderTiming keeps the slowest rules, summing a rule that ran more than once', () => {
  const line = renderTiming('work', 1234.6, [
    { id: 'slow-rule', ms: 10.4 },
    { id: 'fast-rule', ms: 1.2 },
    { id: 'slow-rule', ms: 10.4 },
  ]);
  assert.equal(line, 'claudinite-check-timing v1 work total=1235 slow-rule=21 fast-rule=1');
});

test('renderTiming names at most the slowest eight, and total still covers the rest', () => {
  const record = parseTiming(renderTiming('world', 500, many(30)));
  assert.equal(record.rules.length, TIMING_RULES);
  assert.deepEqual(record.rules.map((r) => r.id), Array.from({ length: TIMING_RULES }, (_, i) => `rule-${29 - i}`));
  assert.equal(record.totalMs, 500, 'the rules the line drops are still inside total');
});

test('parseTiming reads back what renderTiming wrote, whatever else shares the line', () => {
  const record = parseTiming(renderTiming('work', 42, [{ id: 'a-rule', ms: 7 }]));
  assert.deepEqual(record, { scope: 'work', totalMs: 42, rules: [{ id: 'a-rule', ms: 7 }] });
  const logged = parseTiming(`2026-09-21T17:00:00Z run=12 Stop: ${renderTiming('work', 42, [{ id: 'a-rule', ms: 7 }])}`);
  assert.deepEqual(logged, record, 'the hook log stamps the line and must not change what it says');
});

test('parseTiming: a record with no rule at all still reads, and a non-record reads as none', () => {
  assert.deepEqual(parseTiming(renderTiming('work', 3, [])), { scope: 'work', totalMs: 3, rules: [] });
  for (const not of ['', null, undefined, 'claudinite checks: 3 findings', 'claudinite-check-timing v2 work total=3']) {
    assert.equal(parseTiming(not), null, `${not} carries no v1 record`);
  }
});

test('parseTimings picks the records out of a block holding both runners and other output', () => {
  const block = [
    'claudinite conformance checks failed',
    renderTiming('work', 10, [{ id: 'a', ms: 4 }]),
    '[BLOCKING] some-rule  packs/acme-pack/RULES.md',
    renderTiming('world', 20, [{ id: 'b', ms: 9 }]),
  ].join('\n');
  assert.deepEqual(parseTimings(block).map((r) => [r.scope, r.totalMs]), [['work', 10], ['world', 20]]);
});
