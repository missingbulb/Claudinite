import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import rule from '../../packs/basics/task-declaration-matches-folder.mjs';

const decl = (id, extra = "  agent_instructions: 'task.md',\n") => `export default {
  id: '${id}',
  frequency: 'daily',
  precondition_signals: ['commits'],
  agent_model: 'opus',
  expected_outcome: 'open-pr',
${extra}  agent_execution_timeout: 1800,
  precondition(signals, config) { return { run: false }; },
};
`;

const DIR = '.claudinite/local/packs/mypack/tasks/growth-extract/';

const run = (files) => {
  const root = makeRepo({ changed: files });
  try { return rule.run(buildContext({ root, mode: 'all' })); } finally { cleanup(root); }
};

test('task-declaration-matches-folder: a task whose id and worker doc match its folder is clean', () => {
  assert.deepEqual(run({
    [`${DIR}task.mjs`]: decl('growth-extract'),
    [`${DIR}task.md`]: '# worker\n',
  }), []);
});

test('task-declaration-matches-folder: is inert when the repo schedules no tasks', () => {
  assert.deepEqual(run({ 'src/app.js': 'x\n' }), []);
});

test('task-declaration-matches-folder: flags an id that disagrees with the directory name', () => {
  const findings = run({
    [`${DIR}task.mjs`]: decl('growth-extraction'),
    [`${DIR}task.md`]: '# worker\n',
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'blocking');
  assert.match(findings[0].what, /declares id "growth-extraction" but its directory is "growth-extract"/);
});

test('task-declaration-matches-folder: flags an agent_instructions worker doc that is not there', () => {
  const findings = run({ [`${DIR}task.mjs`]: decl('growth-extract') });
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /agent_instructions "task\.md", which does not exist/);
});

test('task-declaration-matches-folder: a worker doc reaching outside the task folder is dangling', () => {
  const findings = run({
    [`${DIR}task.mjs`]: decl('growth-extract', "  agent_instructions: '../shared/worker.md',\n"),
    '.claudinite/local/packs/mypack/tasks/shared/worker.md': '# worker\n',
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /reaches outside the task directory/);
});

test('task-declaration-matches-folder: an agentless task declares no worker doc and stays clean', () => {
  assert.deepEqual(run({
    [`${DIR}task.mjs`]: decl('growth-extract', '').replace("agent_model: 'opus'", "agent_model: 'none'"),
  }), []);
});
