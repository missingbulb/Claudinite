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
import sharedConstants from '../../packs/universal/shared-constants.mjs';

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

test('file-placement: does not flag markdown prose links (code metric only)', () => {
  const root = makeRepo({
    base: { 'deep/far/other.md': 'x\n' },
    changed: { 'doc.md': 'see [other](../deep/far/other.md)\n' },
  });
  try {
    assert.equal(run(filePlacement, root).length, 0);
  } finally { cleanup(root); }
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

test('squash-merge-history: flags a merge the work introduces, silent on linear history and pre-existing main merges', () => {
  const linear = makeRepo({ changed: { 'f.txt': 'x\n' } });

  // A merge commit on the feature branch itself — the current change introduces it → fires.
  const introduced = makeRepo({ changed: { 'f.txt': 'x\n' } });
  git(introduced, 'checkout', '-q', '-b', 'side');
  writeFiles(introduced, { 's.txt': 'x\n' });
  git(introduced, 'add', '-A');
  git(introduced, 'commit', '-q', '-m', 'side work');
  git(introduced, 'checkout', '-q', 'feature');
  git(introduced, 'merge', '-q', '--no-ff', '-m', 'merge side into feature', 'side');

  // A merge commit already on main, before the branch's work — the repo's history, not the work → silent.
  const preexisting = makeRepo({ changed: {} });
  git(preexisting, 'checkout', '-q', 'main');
  git(preexisting, 'checkout', '-q', '-b', 'side');
  writeFiles(preexisting, { 's.txt': 'x\n' });
  git(preexisting, 'add', '-A');
  git(preexisting, 'commit', '-q', '-m', 'side work');
  git(preexisting, 'checkout', '-q', 'main');
  git(preexisting, 'merge', '-q', '--no-ff', '-m', 'merge side', 'side');
  git(preexisting, 'checkout', '-q', '-B', 'feature', 'main'); // branch fresh off post-merge main
  writeFiles(preexisting, { 'w.txt': 'x\n' });
  git(preexisting, 'add', '-A');
  git(preexisting, 'commit', '-q', '-m', 'feature work');

  try {
    const findings = run(squashMergeHistory, introduced);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /merge side into feature/);
    assert.match(findings[0].file, /^feature@/);
    assert.equal(run(squashMergeHistory, linear).length, 0);
    assert.equal(run(squashMergeHistory, preexisting).length, 0);
  } finally { cleanup(linear); cleanup(introduced); cleanup(preexisting); }
});

test('shared-constants: flags a count mismatch, passes when every declared count matches', () => {
  const entry = { what: 'repo slug', value: 'org/Repo', counts: { 'a.txt': 2, 'b.txt': 1 } };
  const config = (e) => `${JSON.stringify({ sharedConstants: [e] })}\n`;
  const bad = makeRepo({ changed: {
    '.claudinite-checks.json': config(entry),
    'a.txt': 'org/Repo appears just once\n', // expected 2, found 1
    'b.txt': 'org/Repo\n',
  } });
  const good = makeRepo({ changed: {
    '.claudinite-checks.json': config(entry),
    'a.txt': 'org/Repo and again org/Repo\n', // 2
    'b.txt': 'org/Repo\n',                    // 1
  } });
  try {
    const findings = run(sharedConstants, bad);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'a.txt');
    assert.match(findings[0].what, /expected 2 occurrence/);
    assert.equal(run(sharedConstants, good).length, 0);
  } finally { cleanup(bad); cleanup(good); }
});

test('shared-constants: flags a declared file that no longer exists', () => {
  const root = makeRepo({ changed: {
    '.claudinite-checks.json': `${JSON.stringify({ sharedConstants: [{ what: 'moved', value: 'V', counts: { 'gone.txt': 1 } }] })}\n`,
  } });
  try {
    const findings = run(sharedConstants, root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /gone\.txt.*does not exist/);
  } finally { cleanup(root); }
});

test('shared-constants: flags an entry missing its self-documenting "what"', () => {
  const root = makeRepo({ changed: {
    '.claudinite-checks.json': `${JSON.stringify({ sharedConstants: [{ value: 'V', counts: { 'a.txt': 1 } }] })}\n`,
    'a.txt': 'V\n',
  } });
  try {
    const findings = run(sharedConstants, root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /malformed/);
  } finally { cleanup(root); }
});

test('shared-constants: silent when no cases are declared', () => {
  const root = makeRepo({ changed: { 'a.txt': 'anything\n' } });
  try {
    assert.equal(run(sharedConstants, root).length, 0);
  } finally { cleanup(root); }
});

test('shared-constants: regex mode passes in sync, flags differing matched values', () => {
  const entry = { what: 'extension version', value: '"version": "\\d+\\.\\d+\\.\\d+"', regex: true, counts: { 'm.json': 1, 'p.json': 1 } };
  const config = `${JSON.stringify({ sharedConstants: [entry] })}\n`;
  const synced = makeRepo({ changed: {
    '.claudinite-checks.json': config,
    'm.json': '{ "version": "1.5.0" }\n',
    'p.json': '{ "version": "1.5.0" }\n',
  } });
  const drifted = makeRepo({ changed: {
    '.claudinite-checks.json': config,
    'm.json': '{ "version": "1.5.1" }\n', // 1 match, but differs from p.json
    'p.json': '{ "version": "1.5.0" }\n',
  } });
  try {
    assert.equal(run(sharedConstants, synced).length, 0);
    const findings = run(sharedConstants, drifted);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /differing values/);
  } finally { cleanup(synced); cleanup(drifted); }
});

test('shared-constants: regex mode still enforces the per-file count', () => {
  const entry = { what: 'version', value: '"version": "\\d+\\.\\d+\\.\\d+"', regex: true, counts: { 'm.json': 1, 'p.json': 1 } };
  const root = makeRepo({ changed: {
    '.claudinite-checks.json': `${JSON.stringify({ sharedConstants: [entry] })}\n`,
    'm.json': '{ "name": "x" }\n', // 0 matches, expected 1
    'p.json': '{ "version": "1.5.0" }\n',
  } });
  try {
    const findings = run(sharedConstants, root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'm.json');
    assert.match(findings[0].what, /expected 1 occurrence.*found 0/);
  } finally { cleanup(root); }
});

test('shared-constants: flags an invalid regex pattern', () => {
  const entry = { what: 'broken', value: '(', regex: true, counts: { 'a.txt': 1 } };
  const root = makeRepo({ changed: {
    '.claudinite-checks.json': `${JSON.stringify({ sharedConstants: [entry] })}\n`,
    'a.txt': 'anything\n',
  } });
  try {
    const findings = run(sharedConstants, root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /not a valid regular expression/);
  } finally { cleanup(root); }
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
