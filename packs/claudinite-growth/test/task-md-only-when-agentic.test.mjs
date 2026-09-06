import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { DEFAULT_AGENT_MODEL } from '../../claudinite-tasks/task-contract.mjs';
import rule, { runsAgent } from '../worldRules/task-md-only-when-agentic.mjs';

const decl = (extra) => `${JSON.stringify({
  id: 'usage-fold', preconditions: ['due:daily'], expected_outcome: 'fresh_pr', automerge: 'nothing', ...extra,
}, null, 2)}\n`;

const AGENTIC = { agent_instructions: 'task.md', agent_execution_timeout: 1800 };
const CODE_WORK = { code_work: 'node worker.mjs', code_work_timeout: 600 };

const DIR = '.claudinite/local/packs/mypack/tasks/usage-fold/';

const run = (files) => {
  const root = makeRepo({ changed: files });
  try { return rule.run(buildContext({ root, mode: 'all' })); } finally { cleanup(root); }
};

test('task-md-only-when-agentic: an agentic task with a task.md is clean', () => {
  assert.deepEqual(run({ [`${DIR}task.json`]: decl({ agent_model: 'opus', ...AGENTIC }), [`${DIR}task.md`]: '# spec\n' }), []);
});

test('task-md-only-when-agentic: a none task with a README beside its worker is clean', () => {
  assert.deepEqual(run({ [`${DIR}task.json`]: decl({ agent_model: 'none', ...CODE_WORK }), [`${DIR}README.md`]: '# what the worker does\n' }), []);
});

test('task-md-only-when-agentic: a none task carrying a task.md is flagged, naming the rename', () => {
  const f = run({ [`${DIR}task.json`]: decl({ agent_model: 'none', ...CODE_WORK }), [`${DIR}task.md`]: '# spec nobody reads\n' });
  assert.equal(f.length, 1);
  assert.equal(f[0].file, `${DIR}task.md`);
  assert.match(f[0].what, /runs no agent/);
  assert.match(f[0].fix, new RegExp(`rename it to ${DIR}README.md`));
});

// An absent agent_model is `none`: a declaration of only code_work is agentless
// and a task.md beside it is the same dead prose.
test('task-md-only-when-agentic: an omitted agent_model is no agent', () => {
  assert.equal(run({ [`${DIR}task.json`]: decl(CODE_WORK), [`${DIR}task.md`]: '# spec nobody reads\n' }).length, 1);
  assert.deepEqual(run({ [`${DIR}task.json`]: decl({ agent_model: 'sonnet', ...AGENTIC }), [`${DIR}task.md`]: '# spec\n' }), []);
});

// The rule spells the loader's default itself (this pack does not require
// claudinite-tasks); the two must agree.
test('task-md-only-when-agentic: runsAgent agrees with the contract\'s default', () => {
  const view = (c) => ({ has: (k) => c[k] !== undefined, str: (k) => (typeof c[k] === 'string' ? c[k] : null) });
  assert.equal(runsAgent(view({})), DEFAULT_AGENT_MODEL !== 'none');
  assert.equal(runsAgent(view({ agent_model: 'opus' })), true);
  assert.equal(runsAgent(view({ agent_model: 'none' })), false);
});

test('task-md-only-when-agentic: is inert when no task declaration exists', () => {
  assert.deepEqual(run({ 'src/app.js': 'x\n', 'docs/task.md': '# not a task folder\n' }), []);
});
