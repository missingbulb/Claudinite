import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderJson, renderJsonFile } from '../../engine/scheduler/render-json.mjs';

// The contract in one line: same bytes-in-bytes-out as JSON.stringify, different
// whitespace. Everything below is either that property or the whitespace rule.

test('the output parses back to exactly what went in', () => {
  const value = {
    version: 2,
    days: { '2026-07-19': { totals: [5, 5, 5, 16, 3], checks: { work: [19, 0, 0, null, 0, 0, 0] } } },
    empty: {}, none: null, list: [], text: 'a, b: c {d}',
  };
  assert.deepEqual(JSON.parse(renderJson(value)), JSON.parse(JSON.stringify(value)));
});

test('punctuation inside a string is never mistaken for structure', () => {
  // The inline form is built by joining, never by rewriting a stringified blob — a
  // comma or a colon inside a value must survive untouched.
  const value = { note: 'captures, merges: 3 — {"nested": [1,2]}' };
  assert.deepEqual(JSON.parse(renderJson(value)), value);
});

test('a row that fits stays on one line; one that does not is expanded', () => {
  const row = { totals: [5, 5, 5, 16, 3], checks: { work: [19, 0, 0, 0, 0, 0, 0] } };
  assert.equal(renderJson({ '2026-07-19': row }, { width: 70 }),
    '{\n  "2026-07-19": {\n    "totals": [5, 5, 5, 16, 3],\n'
    + '    "checks": {"work": [19, 0, 0, 0, 0, 0, 0]}\n  }\n}');
  const wide = renderJson({ checks: { work: [19, 0, 0, 0, 0, 0, 0] } }, { width: 20 });
  assert.match(wide, /"work": \[\n/, 'past the budget, each child gets its own line');
  assert.deepEqual(JSON.parse(wide), { checks: { work: [19, 0, 0, 0, 0, 0, 0] } });
});

test('the width budget counts the indent, so nesting still fits the page', () => {
  const deep = { a: { b: { c: { d: { e: [1, 2, 3] } } } } };
  for (const line of renderJson(deep, { width: 30 }).split('\n')) {
    assert.ok(line.length <= 30, `over budget: ${line}`);
  }
  // …and a key long enough on its own is the one thing the budget cannot fix.
  assert.match(renderJson({ 'a-very-long-key-indeed': [1, 2] }, { width: 10 }), /\[\n/);
});

test('undefined and functions are dropped from objects, exactly as JSON.stringify drops them', () => {
  const value = { kept: 1, gone: undefined, fn: () => 1 };
  assert.equal(renderJson(value), '{"kept": 1}');
  assert.deepEqual(JSON.parse(renderJson(value)), JSON.parse(JSON.stringify(value)));
});

test('random structures render identically to JSON.stringify, parsed', () => {
  // Fuzzed rather than enumerated: the failure mode this guards is a shape nobody
  // thought to write down, and the property is total.
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const build = (depth) => {
    const pick = rnd();
    if (depth > 3 || pick < 0.3) return [1, -2.5, 0, null, true, 'a, b', '', 'x'.repeat(40)][Math.floor(rnd() * 8)];
    if (pick < 0.65) return Array.from({ length: Math.floor(rnd() * 5) }, () => build(depth + 1));
    return Object.fromEntries(Array.from({ length: Math.floor(rnd() * 5) }, (_, i) => [`k${i}`, build(depth + 1)]));
  };
  for (let i = 0; i < 200; i += 1) {
    const value = build(0);
    for (const width of [1, 12, 40, 100]) {
      assert.deepEqual(JSON.parse(renderJson(value, { width })), JSON.parse(JSON.stringify(value)));
    }
  }
});

test('renderJsonFile terminates the file with exactly one newline', () => {
  const text = renderJsonFile({ a: 1 });
  assert.equal(text, '{"a": 1}\n');
  assert.ok(!renderJson({ a: 1 }).endsWith('\n'), 'the renderer itself adds none');
});
