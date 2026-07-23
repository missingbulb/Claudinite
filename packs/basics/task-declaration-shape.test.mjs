import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import rule from './task-declaration-shape.mjs';

const goodTask = `export default {
  id: 'growth-extract',
  frequency: 'daily-1h',
  precondition_signals: ['commits', 'prs'],
  agent_model: 'opus',
  expected_outcome: 'merged-pr',
  agent_instructions: 'task.md',
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
    .replace("agent_model: 'opus'", "agent_model: 'gpt'")
    .replace("expected_outcome: 'merged-pr'", "expected_outcome: 'push'");
  const whats = run({ [TASK]: bad }).map((f) => f.what).join(' | ');
  assert.match(whats, /"frequency" is "nightly", not a legal value/);
  assert.match(whats, /"agent_model" is "gpt", not a legal value/);
  assert.match(whats, /"expected_outcome" is "push", not a legal value/);
});

test('task-declaration-shape: flags missing required fields', () => {
  const bad = `export default {
  frequency: 'daily',
  agent_model: 'sonnet',
  expected_outcome: 'none',
};
`;
  const whats = run({ [TASK]: bad }).map((f) => f.what).join(' | ');
  assert.match(whats, /declares no string "id"/);
  assert.match(whats, /declares no string "agent_instructions"/);
  assert.match(whats, /declares no "precondition_signals" array/);
  assert.match(whats, /declares no "precondition" function/);
});

test('task-declaration-shape: flags a non-object export', () => {
  const f = run({ [TASK]: 'export default 42;\n' });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /does not default-export a declaration object/);
});
