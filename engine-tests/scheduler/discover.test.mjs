import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../helpers.mjs';
import { discoverTasks } from '../../engine/scheduler/discover.mjs';

const packMjs = (id) => `export default { id: '${id}' };\n`;
const taskMjs = (id, over = {}) => {
  const d = { id, frequency: 'daily', precondition_signals: ['commits'], agent_model: 'sonnet', expected_outcome: 'none', agent_instructions: 'task.md', agent_execution_timeout: 900, ...over };
  const fields = Object.entries(d).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ');
  return `export default { ${fields}, precondition() { return { run: false }; } };\n`;
};

test('discoverTasks finds a declared local pack\'s tasks with the repo-relative task path', async () => {
  const root = makeRepo({ changed: {
    '.claudinite/local/packs/mypack/pack.mjs': packMjs('mypack'),
    '.claudinite/local/packs/mypack/tasks/alpha/task.mjs': taskMjs('alpha', { frequency: 'daily-1h', agent_model: 'opus', expected_outcome: 'merged-pr' }),
    '.claudinite/local/packs/mypack/tasks/alpha/task.md': '# alpha worker\n',
    '.claudinite/local/packs/mypack/tasks/beta/task.mjs': taskMjs('beta', { frequency: 'weekly' }),
    '.claudinite/local/packs/mypack/tasks/beta/task.md': '# beta worker\n',
  } });
  try {
    const { tasks, errors } = await discoverTasks(root, { packs: ['local/mypack'] });
    assert.deepEqual(errors, []);
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
    assert.deepEqual(Object.keys(byId).sort(), ['alpha', 'beta']);
    assert.equal(byId.alpha.pack, 'mypack');
    assert.equal(byId.alpha.taskPath, '.claudinite/local/packs/mypack/tasks/alpha/task.md');
    assert.equal(byId.alpha.decl.frequency, 'daily-1h');
    assert.equal(byId.beta.decl.frequency, 'weekly');
  } finally { cleanup(root); }
});

test('discoverTasks skips tasks of an undeclared (inactive) pack', async () => {
  const root = makeRepo({ changed: {
    '.claudinite/local/packs/mypack/pack.mjs': packMjs('mypack'),
    '.claudinite/local/packs/mypack/tasks/alpha/task.mjs': taskMjs('alpha'),
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
    // bad frequency
    '.claudinite/local/packs/mypack/tasks/bad/task.mjs': taskMjs('bad', { frequency: 'nightly' }),
    '.claudinite/local/packs/mypack/tasks/bad/task.md': '# w\n',
    // dir name != declared id
    '.claudinite/local/packs/mypack/tasks/mismatch/task.mjs': taskMjs('other'),
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
