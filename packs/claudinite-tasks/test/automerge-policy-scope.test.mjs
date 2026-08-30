// The armed-auto-merge gate: quiet wherever no branch commit stamps the arming
// trailer, red wherever the stamped policy does not actually cover the diff.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import { makeRepo, cleanup, deletePath } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../engine/checks/helpers/work.mjs';
import rule from '../workRules/automerge-policy-scope.mjs';

const armed = (policy) => `Some delivery\n\nRefs #1.\n\nClaudinite-Automerge-Policy: ${policy}\n`;
const gate = (root) => runRule(rule, buildContext({ root }));

test('a branch with no trailer is not armed — the gate stays quiet whatever it changed', () => {
  const root = makeRepo({
    base: { 'src/a.mjs': 'a();\n' },
    changed: { 'src/a.mjs': 'b();\n', 'other/b.mjs': 'c();\n' },
    commitMsg: 'An ordinary change\n\nRefs #1.',
  });
  try {
    assert.deepEqual(gate(root), []);
  } finally { cleanup(root); }
});

test('an armed diff inside its policy is quiet', () => {
  const root = makeRepo({
    base: { 'src/a.mjs': '// old\ncall();\n', 'README.md': 'Old.\n' },
    changed: { 'src/a.mjs': '// new\ncall();\n', 'README.md': 'New.\n' },
    commitMsg: armed('comment-only-changes;readme-changes'),
  });
  try {
    assert.deepEqual(gate(root), []);
  } finally { cleanup(root); }
});

test('an armed diff outside its policy blocks, naming the file', () => {
  const root = makeRepo({
    base: { 'src/a.mjs': 'call(a);\n' },
    changed: { 'src/a.mjs': 'call(b);\n' },
    commitMsg: armed('comment-only-changes;readme-changes'),
  });
  try {
    const findings = gate(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].file, 'src/a.mjs');
    assert.match(findings[0].what, /armed auto-merge/);
    assert.match(findings[0].fix, /never widen the policy/);
  } finally { cleanup(root); }
});

test('a deleted file is judged as a deletion, not skipped', () => {
  const root = makeRepo({
    base: { 'docs/notes.md': 'a\n', 'src/a.mjs': '// x\ncall();\n' },
    changed: { 'src/a.mjs': '// y\ncall();\n' },
    commitMsg: armed('comment-only-changes;doc-changes'),
  });
  try {
    deletePath(root, 'docs/notes.md', armed('comment-only-changes;doc-changes'));
    const findings = gate(root);
    assert.deepEqual(findings.map((f) => f.file), ['docs/notes.md'], 'doc-changes does not cover a deletion');
  } finally { cleanup(root); }
});

test('markdown line-removals arm cleanly for a dedup-shaped branch', () => {
  const root = makeRepo({
    base: { 'notes/RULES.md': '- a\n- b\n- c\n' },
    changed: { 'notes/RULES.md': '- a\n- c\n' },
    commitMsg: armed('markdown-line-removals'),
  });
  try {
    assert.deepEqual(gate(root), []);
  } finally { cleanup(root); }
});

test('an unresolved rule name blocks at the branch — fail closed, loudly', () => {
  const root = makeRepo({
    base: { 'docs/a.md': 'a\n' },
    changed: { 'docs/a.md': 'b\n' },
    commitMsg: armed('no-such-rule'),
  });
  try {
    const findings = gate(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, '(branch)');
    assert.match(findings[0].what, /no-such-rule/);
  } finally { cleanup(root); }
});

test('the LAST trailer on the branch wins over an earlier one', () => {
  const root = makeRepo({
    base: { 'docs/a.md': 'a\n' },
    changed: { 'docs/a.md': 'b\n' },
    commitMsg: armed('comment-only-changes'),
  });
  try {
    // A later commit restates the intent with the policy that actually covers.
    execFileSync('git', ['-C', root, 'commit', '--allow-empty', '-q', '-m', armed('doc-changes')]);
    assert.deepEqual(gate(root), []);
  } finally { cleanup(root); }
});
