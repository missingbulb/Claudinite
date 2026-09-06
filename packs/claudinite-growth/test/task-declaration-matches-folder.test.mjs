import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import rule from '../worldRules/task-declaration-matches-folder.mjs';

const decl = (id, extra = {}) => `${JSON.stringify({
  id, preconditions: ['due:daily'], agent_model: 'opus', expected_outcome: 'fresh_pr', automerge: 'nothing',
  agent_instructions: 'task.md', agent_execution_timeout: 1800, ...extra,
}, null, 2)}\n`;

const DIR = '.claudinite/local/packs/mypack/tasks/growth-extract/';

const run = (files) => {
  const root = makeRepo({ changed: files });
  try { return rule.run(buildContext({ root, mode: 'all' })); } finally { cleanup(root); }
};

test('task-declaration-matches-folder: a task whose id and worker doc match its folder is clean', () => {
  assert.deepEqual(run({ [`${DIR}task.json`]: decl('growth-extract'), [`${DIR}task.md`]: '# worker\n' }), []);
});

test('task-declaration-matches-folder: is inert when no task declaration exists', () => {
  assert.deepEqual(run({ 'src/app.js': 'x\n' }), []);
});

test('task-declaration-matches-folder: flags an id that differs from the directory name', () => {
  const f = run({ [`${DIR}task.json`]: decl('growth-prune'), [`${DIR}task.md`]: '# worker\n' });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /declares id "growth-prune" but its directory is "growth-extract"/);
});

test('task-declaration-matches-folder: flags an agent_instructions that does not exist beside the declaration', () => {
  const f = run({ [`${DIR}task.json`]: decl('growth-extract', { agent_instructions: 'worker.md' }) });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /"worker.md", which does not exist/);
});

test('task-declaration-matches-folder: flags an agent_instructions that escapes the task folder', () => {
  const f = run({ [`${DIR}task.json`]: decl('growth-extract', { agent_instructions: '../shared/task.md' }), '.claudinite/local/packs/mypack/tasks/shared/task.md': '# w\n' });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /reaches outside the task directory/);
});

// An absent agent_instructions is the `task.md` default: nothing to resolve here,
// and whether that file should be there is `task-md-only-when-agentic`'s call.
test('task-declaration-matches-folder: an omitted agent_instructions is not a dangling one', () => {
  const { agent_instructions, ...rest } = JSON.parse(decl('growth-extract'));
  assert.deepEqual(run({ [`${DIR}task.json`]: `${JSON.stringify(rest)}\n` }), []);
});
