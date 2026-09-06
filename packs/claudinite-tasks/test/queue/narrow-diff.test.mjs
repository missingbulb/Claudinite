// The diff classifier behind the request mode's merge authorization (DESIGN
// §16.11): what counts as narrow, and what a real branch reads as.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { removeTree } from '../../../../engine/remove-tree.mjs';
import {
  classifyPath, commentOnly, narrowVerdict, diffEntries,
} from '../../queue/tasks/implement-request/narrow-diff.mjs';

test('classifyPath names docs, tests and code', () => {
  assert.equal(classifyPath('README.md'), 'doc');
  assert.equal(classifyPath('packs/claudinite-tasks/docs/tasks-dispatch/DESIGN.md'), 'doc');
  assert.equal(classifyPath('packs/claudinite-tasks/test/scheduler-run.test.mjs'), 'test');
  assert.equal(classifyPath('packs/basics/tests/fixture.json'), 'test');
  assert.equal(classifyPath('packs/basics/test/pack.test.mjs'), 'test');
  assert.equal(classifyPath('app/test_parser.py'), 'test');
  assert.equal(classifyPath('packs/claudinite-tasks/queue/scheduler-run.mjs'), 'code');
  // A whole-segment match, so a directory that merely CONTAINS the word is code.
  assert.equal(classifyPath('src/latest/index.mjs'), 'code');
});

test('commentOnly sees through comments, and only in languages it models', () => {
  const before = 'export const a = 1; // one\n\n/* block */\nexport const b = 2;\n';
  const after = '// a different comment\nexport const a = 1;\nexport const b = 2;\n';
  assert.equal(commentOnly('engine/x.mjs', before, after), true);
  assert.equal(commentOnly('engine/x.mjs', before, after.replace('= 2', '= 3')), false);
  // A `#`-comment language is not modeled: its comment-only change reads as code,
  // which is the safe end of the verdict.
  assert.equal(commentOnly('scripts/x.py', 'a = 1  # one\n', 'a = 1  # two\n'), false);
  // An added file has no "before" to compare against.
  assert.equal(commentOnly('engine/x.mjs', null, after), false);
});

test('narrowVerdict: docs, tests, comments and one code directory are narrow', () => {
  const v = narrowVerdict([
    { file: 'README.md', before: 'a', after: 'b' },
    { file: 'engine-tests/queue/scheduler-run.test.mjs', before: 'a', after: 'b' },
    { file: 'packs/claudinite-tasks/scheduler-run.mjs', before: 'const a = 1;\n', after: 'const a = 2;\n' },
    { file: 'packs/claudinite-tasks/queue/read.mjs', before: 'const a = 1; // x\n', after: 'const a = 1; // y\n' },
  ]);
  assert.equal(v.narrow, true);
  assert.deepEqual(v.codeDirs, ['packs/claudinite-tasks']);
});

test('narrowVerdict: code in two directories is not narrow, and says which', () => {
  const v = narrowVerdict([
    { file: 'engine/a.mjs', before: 'const a = 1;\n', after: 'const a = 2;\n' },
    { file: 'packs/basics/b.mjs', before: 'const b = 1;\n', after: 'const b = 2;\n' },
  ]);
  assert.equal(v.narrow, false);
  assert.deepEqual(v.codeDirs, ['engine', 'packs/basics']);
  assert.match(v.why, /2 directories/);
});

test('narrowVerdict: a diff with no code at all is narrow', () => {
  const v = narrowVerdict([{ file: 'docs/DESIGN.md', before: 'a', after: 'b' }]);
  assert.equal(v.narrow, true);
  assert.deepEqual(v.codeDirs, []);
});

test('diffEntries reads a real branch, added and deleted files included', () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'narrow-diff-'));
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    mkdirSync(path.join(repo, 'engine'));
    writeFileSync(path.join(repo, 'engine/a.mjs'), 'const a = 1; // one\n');
    writeFileSync(path.join(repo, 'engine/gone.mjs'), 'const g = 1;\n');
    git('add', '-A');
    git('commit', '-qm', 'base');

    git('checkout', '-q', '-b', 'work');
    writeFileSync(path.join(repo, 'engine/a.mjs'), 'const a = 1; // two\n');
    writeFileSync(path.join(repo, 'README.md'), 'hello\n');
    rmSync(path.join(repo, 'engine/gone.mjs'));
    git('add', '-A');
    git('commit', '-qm', 'work');

    const entries = diffEntries({ base: 'main', cwd: repo });
    assert.deepEqual(entries.map((e) => e.file).sort(), ['README.md', 'engine/a.mjs', 'engine/gone.mjs']);
    const added = entries.find((e) => e.file === 'README.md');
    assert.equal(added.before, null);
    const deleted = entries.find((e) => e.file === 'engine/gone.mjs');
    assert.equal(deleted.after, null);

    const v = narrowVerdict(entries);
    // The comment-only edit drops out; the DELETED module is a code change in its
    // directory, and it is the only one, so the diff is still narrow.
    assert.equal(v.narrow, true);
    assert.deepEqual(v.codeDirs, ['engine']);
  } finally {
    removeTree(repo);
  }
});
