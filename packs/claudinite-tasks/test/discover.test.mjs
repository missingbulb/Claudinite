import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { discoverTasks } from '../discover.mjs';

const packMjs = (id) => `export default { id: '${id}' };\n`;
const taskJson = (id, over = {}) => `${JSON.stringify({ id, preconditions: ['due:daily'], expected_outcome: 'no_code_changes', ...over })}\n`;

test('discoverTasks finds a declared local pack\'s tasks with the repo-relative task path', async () => {
  const root = makeRepo({ changed: {
    '.claudinite/local/packs/mypack/pack.mjs': packMjs('mypack'),
    '.claudinite/local/packs/mypack/tasks/alpha/task.json': taskJson('alpha', { frequency: 'daily', preconditions: ['none'], agent_model: 'opus', expected_outcome: 'fresh_pr', automerge: 'anything', agent_instructions: 'task.md', agent_execution_timeout: 900 }),
    '.claudinite/local/packs/mypack/tasks/alpha/task.md': '# alpha worker\n',
    '.claudinite/local/packs/mypack/tasks/beta/task.json': taskJson('beta', { preconditions: ['due:weekly'], code_work: 'node worker.mjs', code_work_timeout: 60 }),
    '.claudinite/local/packs/mypack/tasks/beta/task.md': '# beta worker\n',
  } });
  try {
    const { tasks, errors } = await discoverTasks(root, { packs: ['local/mypack'] });
    assert.deepEqual(errors, []);
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
    assert.deepEqual(Object.keys(byId).sort(), ['alpha', 'beta']);
    assert.equal(byId.alpha.pack, 'mypack');
    assert.equal(byId.alpha.taskPath, '.claudinite/local/packs/mypack/tasks/alpha/task.md');
    // The door: the retired `frequency` field is read where the declaration is LOADED as the
    // cadence term it meant, and nothing downstream ever sees the field (DESIGN §5).
    assert.deepEqual(byId.alpha.decl.preconditions, ['due:daily']);
    assert.deepEqual(byId.beta.decl.preconditions, ['due:weekly']);
    assert.equal(byId.alpha.decl.frequency, undefined);
  } finally { cleanup(root); }
});

test('discoverTasks skips tasks of an undeclared (inactive) pack', async () => {
  const root = makeRepo({ changed: {
    '.claudinite/local/packs/mypack/pack.mjs': packMjs('mypack'),
    '.claudinite/local/packs/mypack/tasks/alpha/task.json': taskJson('alpha'),
    '.claudinite/local/packs/mypack/tasks/alpha/task.md': '# w\n',
  } });
  try {
    const { tasks } = await discoverTasks(root, { packs: [] }); // pack not declared
    assert.deepEqual(tasks, []);
  } finally { cleanup(root); }
});

test('discoverTasks reports a malformed declaration and a dir/id mismatch as errors, not tasks', async () => {
  const root = makeRepo({ changed: {
    '.claudinite/local/packs/mypack/pack.mjs': packMjs('mypack'),
    // bad cadence
    '.claudinite/local/packs/mypack/tasks/bad/task.json': taskJson('bad', { preconditions: ['due:nightly'] }),
    '.claudinite/local/packs/mypack/tasks/bad/task.md': '# w\n',
    // dir name != declared id
    '.claudinite/local/packs/mypack/tasks/mismatch/task.json': taskJson('other', { code_work: 'node worker.mjs', code_work_timeout: 60 }),
    '.claudinite/local/packs/mypack/tasks/mismatch/task.md': '# w\n',
  } });
  try {
    const { tasks, errors } = await discoverTasks(root, { packs: ['local/mypack'] });
    assert.deepEqual(tasks, []);
    assert.equal(errors.length, 2);
    assert.match(errors.map((e) => e.what).join(' | '), /not a valid task declaration/);
    assert.match(errors.map((e) => e.what).join(' | '), /declares id "other" but its directory is "mismatch"/);
  } finally { cleanup(root); }
});

test('discoverTasks reads a task.json, with the defaults filled at the door', async () => {
  const root = makeRepo({ changed: {
    '.claudinite/local/packs/mypack/pack.mjs': packMjs('mypack'),
    '.claudinite/local/packs/mypack/tasks/alpha/task.json': taskJson('alpha', { $schema: '../../../../../shared/packs/claudinite-tasks/task.schema.json', agent_model: 'sonnet', agent_instructions: 'task.md', agent_execution_timeout: 900 }),
    '.claudinite/local/packs/mypack/tasks/alpha/task.md': '# alpha worker\n',
    '.claudinite/local/packs/mypack/tasks/beta/task.json': taskJson('beta', { code_work: 'node w.mjs', code_work_timeout: 60 }),
    '.claudinite/local/packs/mypack/tasks/broken/task.json': '{ "id": \n',
  } });
  try {
    const { tasks, errors } = await discoverTasks(root, { packs: ['local/mypack'] });
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
    assert.deepEqual(Object.keys(byId).sort(), ['alpha', 'beta']);
    assert.deepEqual(byId.alpha.decl.preconditions, ['due:daily'], 'the expression is the author\'s — it has no default');
    assert.equal(byId.alpha.decl.$schema, undefined);
    assert.equal(byId.beta.decl.agent_model, 'none', 'no agent, by default');
    assert.equal(byId.alpha.taskPath, '.claudinite/local/packs/mypack/tasks/alpha/task.md');
    assert.equal(errors.length, 1);
    assert.match(errors[0].what, /broken\/task\.json failed to load/);
  } finally { cleanup(root); }
});
