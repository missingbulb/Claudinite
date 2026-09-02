import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { defaultAgentModel } from '../../claudinite-tasks/task-contract.mjs';
import rule, { runsAgent } from '../worldRules/task-md-only-when-agentic.mjs';

const decl = (extra) => `${JSON.stringify({
  id: 'usage-fold', frequency: 'daily', preconditions: ['none'], expected_outcome: 'pr', automerge: 'nothing', ...extra,
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

// The derived model: a declaration of only code_work is agentless without saying
// so, and a task.md beside it is the same dead prose.
test('task-md-only-when-agentic: a code_work-only declaration is agentless, an agentic field beside it is not', () => {
  const f = run({ [`${DIR}task.json`]: decl(CODE_WORK), [`${DIR}task.md`]: '# spec nobody reads\n' });
  assert.equal(f.length, 1);
  assert.deepEqual(run({ [`${DIR}task.json`]: decl({ ...CODE_WORK, agent_execution_timeout: 900 }), [`${DIR}task.md`]: '# spec\n' }), []);
  assert.deepEqual(run({ [`${DIR}task.json`]: decl({}), [`${DIR}task.md`]: '# spec\n' }), [], 'nothing declared runs at the default family');
});

// The rule spells the loader's derivation itself (this pack does not require
// claudinite-tasks); both directions of the real logic must agree.
test('task-md-only-when-agentic: runsAgent agrees with the contract\'s defaultAgentModel', () => {
  const cases = [
    {}, CODE_WORK, { ...CODE_WORK, agent_instructions: 'task.md' }, { ...CODE_WORK, agent_execution_timeout: 5 }, AGENTIC,
  ];
  for (const c of cases) {
    const view = { has: (k) => c[k] !== undefined, str: (k) => (typeof c[k] === 'string' ? c[k] : null) };
    assert.equal(runsAgent(view), defaultAgentModel(c) !== 'none', JSON.stringify(c));
  }
});

test('task-md-only-when-agentic: is inert when no task declaration exists', () => {
  assert.deepEqual(run({ 'src/app.js': 'x\n', 'docs/task.md': '# not a task folder\n' }), []);
});

test('task-md-only-when-agentic: the retired task.mjs form is judged too', () => {
  const mjs = "export default {\n  id: 'usage-fold',\n  agent_model: 'none', // agentless\n  code_work: 'node worker.mjs',\n};\n";
  assert.equal(run({ [`${DIR}task.mjs`]: mjs, [`${DIR}task.md`]: '# spec nobody reads\n' }).length, 1);
});
