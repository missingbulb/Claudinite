// The improve-comments write-surface gate. The pass runs unattended against the
// repo's own source, so every case here is about what the gate GRANTS as much as
// what it reds: a permission read from the two file contents, never asserted.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { makeRepo, cleanup, deletePath } from '../../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../../../engine/checks/helpers/work.mjs';
import rules from '../../../skills/improve-comments/checks.mjs';
import taskJson from '../../../tasks/improve-comments/task.json' with { type: 'json' };
import { evaluatePrecondition } from '../../../../claudinite-tasks/shared-code/preconditions.mjs';
import { normalizeTaskDeclaration } from '../../../../claudinite-tasks/task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const task = normalizeTaskDeclaration(taskJson);

const [scope] = rules;
const RUN = 'Claudinite tidy: improve comments\n\nRefs #12';
const runScope = (root) => runRule(scope, buildContext({ root }));
const files = (findings) => findings.map((f) => f.file);

test('a comment-only edit to a code file is what this pass is for', () => {
  const root = makeRepo({
    base: { 'src/app.mjs': '// the old wrong note\ncall();\n' },
    changed: { 'src/app.mjs': '/* corrected, and moved to a block */\ncall();\n' },
    commitMsg: RUN,
  });
  try {
    assert.deepEqual(runScope(root), []);
  } finally { cleanup(root); }
});

test('deleting every comment in a file is comment-only too', () => {
  const root = makeRepo({
    base: { 'src/app.mjs': '// says what the next line says\ncall();\n' },
    changed: { 'src/app.mjs': 'call();\n' },
    commitMsg: RUN,
  });
  try {
    assert.deepEqual(runScope(root), []);
  } finally { cleanup(root); }
});

test('a code change riding along under the comment title is blocked', () => {
  const root = makeRepo({
    base: { 'src/app.mjs': '// note\ncall(a);\n' },
    changed: { 'src/app.mjs': '// a better note\ncall(b);\n' },
    commitMsg: RUN,
  });
  try {
    const findings = runScope(root);
    assert.deepEqual(files(findings), ['src/app.mjs']);
    assert.equal(findings[0].severity, 'blocking');
    assert.match(findings[0].what, /changed more than the comments/);
  } finally { cleanup(root); }
});

test('a README may be rewritten freely, and a new one added', () => {
  const root = makeRepo({
    base: { 'docs/README.md': '# Docs\n\nOld.\n' },
    changed: { 'docs/README.md': '# Docs\n\nEntirely rewritten.\n', 'src/README.md': '# Src\n' },
    commitMsg: RUN,
  });
  try {
    assert.deepEqual(runScope(root), []);
  } finally { cleanup(root); }
});

test('deleting a README is not an improvement to it', () => {
  const root = makeRepo({ base: { 'docs/README.md': '# Docs\n' }, changed: { 'src/app.mjs': 'call();\n' }, commitMsg: RUN });
  try {
    deletePath(root, 'docs/README.md', RUN);
    const findings = runScope(root);
    assert.ok(files(findings).includes('docs/README.md'));
    assert.match(findings.find((f) => f.file === 'docs/README.md').what, /deleted docs\/README\.md/);
  } finally { cleanup(root); }
});

test('an added or deleted code file is never comment-only, however little it holds', () => {
  const root = makeRepo({
    base: { 'src/old.mjs': 'gone();\n' },
    changed: { 'src/notes.mjs': '// nothing but a comment\n' },
    commitMsg: RUN,
  });
  try {
    deletePath(root, 'src/old.mjs', RUN);
    assert.deepEqual(files(runScope(root)), ['src/notes.mjs', 'src/old.mjs']);
  } finally { cleanup(root); }
});

test('a language the parser cannot read counts as code, and the remedy says so', () => {
  const root = makeRepo({
    base: { 'scripts/run.py': '# note\nrun()\n' },
    changed: { 'scripts/run.py': '# a better note\nrun()\n' },
    commitMsg: RUN,
  });
  try {
    const findings = runScope(root);
    assert.deepEqual(files(findings), ['scripts/run.py']);
    assert.match(findings[0].what, /whose language the comment parser cannot read/);
    assert.match(findings[0].fix, /revert scripts\/run\.py/);
  } finally { cleanup(root); }
});

test('an ordinary branch is not this rule\'s business, and neither is the default branch', () => {
  const ordinary = makeRepo({
    base: { 'src/app.mjs': 'call(a);\n' },
    changed: { 'src/app.mjs': 'call(b);\n' },
    commitMsg: 'Ordinary work\n\nRefs #12',
  });
  try {
    assert.deepEqual(runScope(ordinary), []);
  } finally { cleanup(ordinary); }

  const onMain = makeRepo({ base: { 'src/app.mjs': 'call(a);\n' } });
  try {
    assert.deepEqual(runScope(onMain), []);
  } finally { cleanup(onMain); }
});

test('the title the scope gate keys on is the one the worker doc pins', () => {
  // The gate's whole relevance is this subject, and a rename in one place and not
  // the other silently retires the guarantee rather than failing. The doc is the
  // other place now: a round finds the standing PR by this title and appends to it,
  // so the title is what makes several weeks of comment work one review.
  const subject = RUN.split('\n')[0];
  assert.ok(readFileSync(new URL(`../../../tasks/improve-comments/${task.agent_instructions}`, import.meta.url), 'utf8').includes(subject),
    'the worker doc must pin the same subject the scope gate keys on');
});

// `.claudinite/` is the mount, not the repo's own source. The vendored `shared/`
// half is already invisible to every check, so what the gate has to carry is
// `.claudinite/local/`, which a run can reach and edit. Both halves of the
// exclusion are asserted — the scope a round is handed, and the gate on the write.
test('a comment-only edit inside .claudinite/ is still outside this pass\'s surface', () => {
  const root = makeRepo({
    base: { '.claudinite/local/packs/x/hook.mjs': '// the old note\nrun();\n' },
    changed: { '.claudinite/local/packs/x/hook.mjs': '// a better note\nrun();\n' },
    commitMsg: RUN,
  });
  try {
    const findings = runScope(root);
    assert.deepEqual(files(findings), ['.claudinite/local/packs/x/hook.mjs']);
    assert.match(findings[0].what, /\.claudinite\//);
    assert.match(findings[0].fix, /revert \.claudinite\/local\/packs\/x\/hook\.mjs/);
  } finally { cleanup(root); }
});

test('the precondition never hands a round a .claudinite/ path, and stays silent when that is all there is', () => {
  // The cadence term reads an empty run history at a chosen instant, so it holds and
  // the touched paths decide.
  const S = (touched) => ({ runs: { list: [] }, prs: { open: [] }, commits: { substantiveChange: true, touchedPaths: touched } });
  const verdict = (touched) => evaluatePrecondition({ decl: task }, S(touched), {}, null, '2026-09-05T16:00:00Z', { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 });

  const mixed = verdict(['.claudinite/shared/packs/basics/RULES.md', 'src/app.mjs']);
  assert.equal(mixed.run, true);
  const scope = mixed.context.filter((line) => line.startsWith('Paths outside')).join(' ');
  assert.match(scope, /src\/app\.mjs/);
  assert.doesNotMatch(scope, /\.claudinite\/shared/);

  const mountOnly = verdict(['.claudinite/local/packs/x/RULES.md', '.claudinite/stamp.json']);
  assert.equal(mountOnly.run, false);
});
