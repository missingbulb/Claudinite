import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import rule from './task-declaration-shape.mjs';

const goodTask = `export default {
  id: 'growth-extract',
  frequency: 'daily-1h',
  signals: ['commits', 'prs'],
  model: 'opus',
  outcome: 'merged-pr',
  worker: 'task.md',
  precondition(signals, config) { return { run: false }; },
};
`;
const TASK = '.claudinite/local/packs/mypack/tasks/growth-extract/task.mjs';

const run = (files) => {
  const root = makeRepo({ changed: files });
  try { return rule.run(buildContext({ root, mode: 'all' })); } finally { cleanup(root); }
};

test('task-declaration-shape: a well-formed task.mjs yields no findings', () => {
  assert.deepEqual(run({ [TASK]: goodTask }), []);
});

test('task-declaration-shape: is inert when no task.mjs exists', () => {
  assert.deepEqual(run({ 'src/app.js': 'x\n' }), []);
});

test('task-declaration-shape: flags illegal enum values', () => {
  const bad = goodTask
    .replace("frequency: 'daily-1h'", "frequency: 'nightly'")
    .replace("model: 'opus'", "model: 'gpt'")
    .replace("outcome: 'merged-pr'", "outcome: 'push'");
  const whats = run({ [TASK]: bad }).map((f) => f.what).join(' | ');
  assert.match(whats, /"frequency" is "nightly", not a legal value/);
  assert.match(whats, /"model" is "gpt", not a legal value/);
  assert.match(whats, /"outcome" is "push", not a legal value/);
});

test('task-declaration-shape: flags missing required fields', () => {
  const bad = `export default {
  frequency: 'daily',
  model: 'sonnet',
  outcome: 'none',
};
`;
  const whats = run({ [TASK]: bad }).map((f) => f.what).join(' | ');
  assert.match(whats, /declares no string "id"/);
  assert.match(whats, /declares no string "worker"/);
  assert.match(whats, /declares no "signals" array/);
  assert.match(whats, /declares no "precondition" function/);
});

test('task-declaration-shape: flags a non-object export', () => {
  const f = run({ [TASK]: 'export default 42;\n' });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /does not default-export a declaration object/);
});
