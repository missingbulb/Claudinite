import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import rule from '../worldRules/task-md-only-when-agentic.mjs';

const decl = (model, extra = '') => `export default {
  id: 'usage-fold',
  frequency: 'daily',
  precondition_signals: ['commits'],
  agent_model: '${model}',
  expected_outcome: 'pr',
  automerge: 'nothing',
${extra}  precondition(signals, config) { return { run: false }; },
};
`;

const AGENTIC = "  agent_instructions: 'task.md',\n  agent_execution_timeout: 1800,\n";
const CODE_WORK = "  code_work: 'node worker.mjs',\n  code_work_timeout: 600,\n";

const DIR = '.claudinite/local/packs/mypack/tasks/usage-fold/';

const run = (files) => {
  const root = makeRepo({ changed: files });
  try { return rule.run(buildContext({ root, mode: 'all' })); } finally { cleanup(root); }
};

test('task-md-only-when-agentic: an agentic task keeps its task.md', () => {
  assert.deepEqual(run({
    [`${DIR}task.mjs`]: decl('opus', AGENTIC),
    [`${DIR}task.md`]: '# worker\n',
  }), []);
});

test('task-md-only-when-agentic: an agentless task documented in a README is clean', () => {
  assert.deepEqual(run({
    [`${DIR}task.mjs`]: decl('none', CODE_WORK),
    [`${DIR}worker.mjs`]: 'export {};\n',
    [`${DIR}README.md`]: '# what the worker does\n',
  }), []);
});

test('task-md-only-when-agentic: is inert when the repo carries no tasks', () => {
  assert.deepEqual(run({ 'src/app.js': 'x\n' }), []);
});

test('task-md-only-when-agentic: flags a task.md beside an agentless declaration', () => {
  const findings = run({
    [`${DIR}task.mjs`]: decl('none', CODE_WORK),
    [`${DIR}worker.mjs`]: 'export {};\n',
    [`${DIR}task.md`]: '# what the worker does\n',
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'blocking');
  assert.equal(findings[0].file, `${DIR}task.md`);
  assert.match(findings[0].what, /agent_model: 'none'/);
  // The remedy is a rename: the content is the record of what the worker does,
  // and deleting it would lose that.
  assert.match(findings[0].fix, new RegExp(`rename it to ${DIR}README\\.md`));
});
