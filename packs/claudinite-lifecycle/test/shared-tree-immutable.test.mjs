import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup, makeTranscript, declaredCheck } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../engine/checks/helpers/work.mjs';
import sharedTreeImmutable from '../workRules/shared-tree-immutable.mjs';

// The work-scope backstop, over a branch that really committed the file.
const onBranch = (changed, commitMsg) => {
  const root = makeRepo({ changed, ...(commitMsg ? { commitMsg } : {}) });
  try { return runRule(sharedTreeImmutable, buildContext({ root, mode: 'changed' })).map((f) => f.file); }
  finally { cleanup(root); }
};

test('shared-tree-immutable flags a branch commit inside the mount', () => {
  assert.deepEqual(onBranch({
    '.claudinite/shared/packs/basics/RULES.md': '# edited\n',
    'docs/notes.md': 'x\n',
  }), ['.claudinite/shared/packs/basics/RULES.md']);
});

test('shared-tree-immutable exempts the update flow, which owns that tree', () => {
  assert.deepEqual(onBranch(
    { '.claudinite/shared/packs/basics/RULES.md': '# converged\n' },
    'Claudinite update: engine v1 → v2 and 1 pack upgraded',
  ), []);
});

test('shared-tree-immutable leaves the local packs beside the mount alone', () => {
  assert.deepEqual(onBranch({
    '.claudinite/local/packs/mine/RULES.md': '# mine\n',
    'engine/x.mjs': 'export {};\n',
  }), []);
});

// The PreToolUse guard, judged at Stop over the calls a transcript records.
const guarded = (calls) => {
  const rule = declaredCheck('packs/claudinite-lifecycle', 'shared-tree-edit-guard');
  const session = makeTranscript(calls.map(([name, input]) =>
    ({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } })));
  const root = makeRepo({ changed: { 'a.txt': 'x\n' } });
  try { return runRule(rule, buildContext({ root, mode: 'all', transcriptPath: session.path })).length; }
  finally { cleanup(root); session.cleanup(); }
};

test('shared-tree-edit-guard denies a file write into the mount', () => {
  assert.equal(guarded([
    ['Edit', { file_path: '/r/.claudinite/shared/packs/basics/RULES.md', old_string: 'a', new_string: 'b' }],
    ['Write', { file_path: '.claudinite/shared/engine/x.mjs', content: 'y' }],
    ['NotebookEdit', { file_path: '/r/.claudinite/shared/nb.ipynb' }],
  ]), 3);
});

test('shared-tree-edit-guard leaves a write beside the mount alone', () => {
  assert.equal(guarded([
    ['Edit', { file_path: '/r/.claudinite/local/packs/mine/RULES.md', old_string: 'a', new_string: 'b' }],
    ['Write', { file_path: '/r/packs/basics/RULES.md', content: 'y' }],
    ['Write', { file_path: '/r/docs/shared/notes.md', content: 'y' }],
  ]), 0);
});

test('shared-tree-edit-guard denies a shell write into the mount', () => {
  assert.equal(guarded([
    ['Bash', { command: "sed -i 's/a/b/' .claudinite/shared/packs/basics/RULES.md" }],
    ['Bash', { command: 'echo x > .claudinite/shared/engine/x.mjs' }],
    ['Bash', { command: 'rm -rf .claudinite/shared' }],
    ['Bash', { command: 'cat x | tee .claudinite/shared/a' }],
  ]), 4);
});

// The false-positive pass that matters: the corpus RUNS the mount constantly,
// and a guard that fires on reading it would be off within a week.
test('shared-tree-edit-guard leaves every read of the mount alone', () => {
  assert.equal(guarded([
    ['Bash', { command: 'node .claudinite/shared/engine/checks/check_the_world.mjs' }],
    ['Bash', { command: 'node .claudinite/shared/engine/converge-wiring.mjs owner/repo --badges' }],
    ['Bash', { command: 'grep -rn doc: .claudinite/shared/packs > /tmp/out.txt' }],
    ['Bash', { command: 'sed -n "1,20p" .claudinite/shared/packs/basics/RULES.md' }],
    ['Bash', { command: 'cat .claudinite/shared/VERSION && ls .claudinite/shared/' }],
    ['Bash', { command: 'rm -rf /tmp/scratch && node .claudinite/shared/engine/x.mjs' }],
  ]), 0);
});
