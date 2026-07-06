import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, deletePath, cleanup, git, writeFiles } from './helpers.mjs';
import { buildContext } from '../lib/context.mjs';
import referenceIntegrity from '../../packs/universal/reference-integrity.mjs';
import linkLabels from '../../packs/universal/markdown-link-labels.mjs';
import taskLifecycle from '../../packs/universal/task-lifecycle.mjs';
import warningSuppression from '../../packs/universal/warning-suppression.mjs';
import filePlacement from '../../packs/universal/file-placement.mjs';
import packDeclaration from '../../packs/universal/pack-declaration.mjs';
import squashMergeHistory from '../../packs/universal/squash-merge-history.mjs';

function run(rule, root, mode = 'changed') {
  const ctx = buildContext({ root, mode });
  return rule.run(ctx);
}

test('reference-integrity: flags a dangling relative link, passes a resolving one', () => {
  const bad = makeRepo({ changed: { 'doc.md': '[gone](missing/file.md)\n' } });
  const good = makeRepo({ changed: { 'doc.md': '[ok](README.md)\n' } });
  try {
    const findings = run(referenceIntegrity, bad);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /missing\/file\.md/);
    assert.equal(run(referenceIntegrity, good).length, 0);
  } finally { cleanup(bad); cleanup(good); }
});

test('reference-integrity: flags surviving references to a deleted file', () => {
  const root = makeRepo({
    base: { 'old.md': 'x\n', 'index.md': 'see [old](old.md)\n' },
    changed: {},
  });
  try {
    deletePath(root, 'old.md');
    const findings = run(referenceIntegrity, root);
    assert.ok(findings.some(f => f.file === 'index.md' && /old\.md/.test(f.what)));
  } finally { cleanup(root); }
});

test('markdown-link-labels: flags a path-like label that contradicts the target', () => {
  const bad = makeRepo({
    base: { 'a/new.md': 'x\n' },
    changed: { 'doc.md': '[`a/old.md`](a/new.md)\n' },
  });
  const good = makeRepo({
    base: { 'a/new.md': 'x\n' },
    changed: { 'doc.md': '[`a/new.md`](a/new.md) and [prose label](a/new.md)\n' },
  });
  try {
    const findings = run(linkLabels, bad);
    assert.equal(findings.length, 1);
    assert.equal(run(linkLabels, good).length, 0);
  } finally { cleanup(bad); cleanup(good); }
});

test('task-lifecycle: flags a branch with no issue reference, passes a referencing one', () => {
  const bad = makeRepo({ changed: { 'f.txt': 'x\n' }, commitMsg: 'no reference here' });
  const good = makeRepo({ changed: { 'f.txt': 'x\n' }, commitMsg: 'work Refs #12' });
  try {
    const findings = run(taskLifecycle, bad);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /issue/i);
    assert.equal(run(taskLifecycle, good).length, 0);
  } finally { cleanup(bad); cleanup(good); }
});

test('task-lifecycle: silent on main itself', () => {
  const root = makeRepo({ changed: { 'f.txt': 'x\n' }, commitMsg: 'no reference here' });
  try {
    git(root, 'checkout', '-q', 'main');
    assert.equal(run(taskLifecycle, root).length, 0);
  } finally { cleanup(root); }
});

test('warning-suppression: flags a newly added suppression marker, ignores pre-existing ones', () => {
  const bad = makeRepo({ changed: { 'a.js': 'x();\n// eslint-disable-next-line no-undef\ny();\n' } });
  const preexisting = makeRepo({
    base: { 'a.js': '// eslint-disable-next-line no-undef\ny();\n' },
    changed: { 'b.js': 'clean();\n' },
  });
  try {
    const findings = run(warningSuppression, bad);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'a.js');
    assert.equal(run(warningSuppression, preexisting).length, 0);
  } finally { cleanup(bad); cleanup(preexisting); }
});

test('warning-suppression: a doc discussing markers is not a suppression', () => {
  const root = makeRepo({ changed: { 'notes.md': 'we detect `eslint-disable` markers\n' } });
  try {
    assert.equal(run(warningSuppression, root).length, 0);
  } finally { cleanup(root); }
});

test('file-placement: flags a distance-3+ reference, exempts tests and mandated locations', () => {
  const bad = makeRepo({
    base: { 'deep/far/util.mjs': 'export const x = 1;\n' },
    changed: { 'src/mod.mjs': "import { x } from '../deep/far/util.mjs';\nexport { x };\n" },
  });
  const exempt = makeRepo({
    base: { 'deep/far/util.mjs': 'export const x = 1;\n' },
    changed: {
      'test/deep/mod.test.mjs': "import { x } from '../../deep/far/util.mjs';\n",
      '.github/workflows/helper.mjs': "import { x } from '../../deep/far/util.mjs';\n",
    },
  });
  try {
    const findings = run(filePlacement, bad);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /distance 3/);
    assert.equal(run(filePlacement, exempt).length, 0);
  } finally { cleanup(bad); cleanup(exempt); }
});

test('pack-declaration: flags an unknown declared pack', () => {
  const root = makeRepo({
    changed: { '.claudinite-checks.json': '{ "packs": ["no-such-pack"] }\n' },
  });
  try {
    const findings = run(packDeclaration, root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /no-such-pack/);
  } finally { cleanup(root); }
});

test('pack-declaration: silent when declaration matches reality', () => {
  const root = makeRepo({ changed: { '.claudinite-checks.json': '{ "packs": [] }\n' } });
  try {
    assert.equal(run(packDeclaration, root).length, 0);
  } finally { cleanup(root); }
});

test('squash-merge-history: flags a merge commit on main, silent on linear history', () => {
  const linear = makeRepo({ changed: { 'f.txt': 'x\n' } });
  const merged = makeRepo({ changed: {} });
  try {
    git(merged, 'checkout', '-q', 'main');
    git(merged, 'checkout', '-q', '-b', 'side');
    writeFiles(merged, { 's.txt': 'x\n' });
    git(merged, 'add', '-A');
    git(merged, 'commit', '-q', '-m', 'side work');
    git(merged, 'checkout', '-q', 'main');
    git(merged, 'merge', '-q', '--no-ff', '-m', 'merge side', 'side');
    git(merged, 'checkout', '-q', 'feature');

    const findings = run(squashMergeHistory, merged);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /merge side/);
    assert.match(findings[0].file, /^main@/);
    assert.equal(run(squashMergeHistory, linear).length, 0);
  } finally { cleanup(linear); cleanup(merged); }
});

test('changed-mode scoping: pre-existing violations elsewhere are not reported', () => {
  const root = makeRepo({
    base: { 'legacy.md': '[dangling](nowhere.md)\n' },
    changed: { 'fresh.md': '[ok](README.md)\n' },
  });
  try {
    assert.equal(run(referenceIntegrity, root).length, 0);
    writeFiles(root, { 'fresh2.md': '[bad](gone.md)\n' });
    const findings = run(referenceIntegrity, root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'fresh2.md');
  } finally { cleanup(root); }
});
