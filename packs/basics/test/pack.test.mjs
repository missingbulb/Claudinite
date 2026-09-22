import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, deletePath, cleanup, git, writeFiles, makeTranscript, declaredCheck } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../engine/checks/helpers/work.mjs';
import referenceIntegrity from '../workRules/reference-integrity.mjs';
import commentClassificationForm from '../workRules/comment-classification-form.mjs';
import workRequestNotStarted from '../workRules/work-request-not-started.mjs';
import linkLabels from '../worldRules/markdown-link-labels.mjs';
import sharedConstants from '../worldRules/shared-constants.mjs';
import claudeMdLength from '../worldRules/claude-md-length.mjs';

const squashMergeHistory = declaredCheck('packs/basics', 'squash-merge-history');
const warningSuppression = declaredCheck('packs/basics', 'warning-suppression');
const noConflictMarkers = declaredCheck('packs/basics', 'no-conflict-markers');
const rulesLineLength = declaredCheck('packs/basics', 'rules-line-length');
const skillDescriptionLength = declaredCheck('packs/basics', 'skill-description-length');
const generatedMergeDriver = declaredCheck('packs/basics', 'generated-merge-driver');
const catalogCompleteness = declaredCheck('packs/basics', 'catalog-completeness');

// The relevance gate for the corpus-integrity checks: the pack registry tracked
// = the repo IS the corpus.
const CORPUS_MARKERS = {
  'engine/pack_loader/pack-registry.mjs': '// corpus marker\n',
};

function run(rule, root, mode = 'changed') {
  const ctx = buildContext({ root, mode });
  return runRule(rule, ctx);
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

test('reference-integrity: the vendored shared mount is never a finding source for a deleted path', () => {
  // The corpus is canon-owned and structurally out of the sweep (vendoring/DESIGN.md item 6);
  // a canon doc mentioning a name the consumer's branch deletes (e.g. its own root file)
  // must not fire — only the consumer's own files may.
  const root = makeRepo({
    base: {
      'old.md': 'x\n',
      'index.md': 'see [old](old.md)\n',
      '.claudinite/shared/packs/basics/README.md': 'canon doc mentioning old.md generically\n',
    },
    changed: {},
  });
  try {
    deletePath(root, 'old.md');
    const findings = run(referenceIntegrity, root);
    assert.ok(findings.some(f => f.file === 'index.md'), 'the consumer file still fires');
    assert.ok(!findings.some(f => f.file.startsWith('.claudinite/shared/')),
      'a shared-mount file must never be a finding source');
  } finally { cleanup(root); }
});

test('reference-integrity: a migration record already in the tree governs the path it names', () => {
  // The record declares the legacy shape; whether THIS branch edits the record
  // says nothing about which paths it governs. The record also lives under the
  // pack that owns it, never at a top-level migrations/.
  const root = makeRepo({
    base: {
      '.github/workflows/legacy-release.yml': 'name: legacy\n',
      'packs/demo/migrations/2026-01-01-vendoring/migration.mjs':
        "export default { id: 'vendoring', materialize: [{ dest: '.github/workflows/legacy-release.yml' }] };\n",
      'packs/demo/notes.md': 'the consumer hosts `.github/workflows/legacy-release.yml`\n',
    },
    changed: {},
  });
  try {
    deletePath(root, '.github/workflows/legacy-release.yml');
    assert.deepEqual(run(referenceIntegrity, root), []);
  } finally { cleanup(root); }
});

test('reference-integrity: a migration record only mentioning a path in prose does not govern it', () => {
  // The record's declarations say what it governs; its narration does not, or a
  // record that merely names a file in passing silences the sweep for that file.
  const root = makeRepo({
    base: {
      '.github/workflows/legacy-release.yml': 'name: legacy\n',
      'packs/demo/migrations/2026-01-01-vendoring/migration.mjs':
        "// Superseded .github/workflows/legacy-release.yml, which nothing writes now.\nexport default { id: 'vendoring' };\n",
      'packs/demo/notes.md': 'the consumer hosts `.github/workflows/legacy-release.yml`\n',
    },
    changed: {},
  });
  try {
    deletePath(root, '.github/workflows/legacy-release.yml');
    const findings = run(referenceIntegrity, root);
    assert.ok(findings.some(f => f.file === 'packs/demo/notes.md'));
  } finally { cleanup(root); }
});

test('reference-integrity: does not flag a renamed file whose new path shares the old basename', () => {
  const root = makeRepo({
    base: { 'old.sh': 'x\n', 'mount/old.sh': 'y\n', 'doc.md': 'see mount/old.sh\n' },
    changed: {},
  });
  try {
    deletePath(root, 'old.sh');
    const findings = run(referenceIntegrity, root);
    assert.equal(findings.some(f => f.file === 'doc.md'), false);
  } finally { cleanup(root); }
});

test('reference-integrity: does not flag a deleted path already governed by an active baseline migration', () => {
  const root = makeRepo({
    base: {
      'old.sh': 'x\n',
      'consumer-docs.md': 'see `.vendored/old.sh` (or the legacy `.hooks/old.sh`)\n',
      'migrations/2026-01-01-old-relocation/migration.mjs': `export default {
  id: 'old-relocation',
  landed: '2026-01-01',
  aliases: [{ canonical: '.vendored/old.sh', legacy: ['.hooks/old.sh'] }],
};
`,
    },
    changed: {},
  });
  try {
    deletePath(root, 'old.sh');
    const findings = run(referenceIntegrity, root, 'all');
    assert.equal(findings.some(f => f.file === 'consumer-docs.md'), false);
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

test('warning-suppression: flags a newly added suppression marker', () => {
  const bad = makeRepo({ changed: { 'a.js': 'x();\n// eslint-disable-next-line no-undef\ny();\n' } });
  try {
    const findings = run(warningSuppression, bad);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'a.js');
    assert.match(findings[0].what, /eslint-disable/);
  } finally { cleanup(bad); }
});

test('warning-suppression: check-the-world — flags a pre-existing marker in an untouched file (all mode)', () => {
  const root = makeRepo({
    base: { 'a.js': '// eslint-disable-next-line no-undef\ny();\n' },
    changed: { 'b.js': 'clean();\n' },
  });
  try {
    // The whole-repo sweep sees the legacy suppression in a.js even though this
    // change never touched it; the diff-scoped `changed` mode would miss it.
    const findings = run(warningSuppression, root, 'all');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'a.js');
  } finally { cleanup(root); }
});

test('warning-suppression: a doc discussing markers is not a suppression', () => {
  const root = makeRepo({ changed: { 'notes.md': 'we detect `eslint-disable` markers\n' } });
  try {
    assert.equal(run(warningSuppression, root).length, 0);
  } finally { cleanup(root); }
});

test('warning-suppression: a local pack\'s check layer spells markers as patterns, not live mutes', () => {
  const root = makeRepo({
    changed: {
      // a local rule module and a bundled skill's checks.mjs spell the marker as
      // a detection pattern — exempt like the canon packs/ tree
      '.claudinite/local/packs/proj/no-mute.mjs': '// detect: /eslint-disable/\nexport default {};\n',
      '.claudinite/local/packs/proj/skills/x/checks.mjs': 'const p = /@ts-ignore/;\nexport default [];\n',
      // but a scheduled task's script is ordinary code — a bare mute there still fires
      '.claudinite/local/packs/proj/tasks/job/worker.js': '// eslint-disable-next-line no-undef\ny();\n',
    },
  });
  try {
    const findings = run(warningSuppression, root, 'all');
    assert.equal(findings.length, 1);
    assert.match(findings[0].file, /tasks\/job\/worker\.js/);
  } finally { cleanup(root); }
});

test('warning-suppression: skips linguist-vendored and linguist-generated files', () => {
  const root = makeRepo({ changed: {
    '.gitattributes': 'vendor/** linguist-vendored\ngen/** linguist-generated\n',
    'vendor/page.html': '<script>/* eslint-disable */\n</script>\n', // recorded third-party fixture
    'gen/out.js': '// @ts-nocheck\nx();\n',                          // machine-written
    'src/mine.js': '// eslint-disable-next-line no-undef\ny();\n',   // the project's own code
  } });
  try {
    // All three carry markers, but only the project's own file is a suppression it decided.
    const findings = run(warningSuppression, root, 'all');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'src/mine.js');
  } finally { cleanup(root); }
});

test('warning-suppression: passes a suppression that carries an inline reason', () => {
  const root = makeRepo({ changed: {
    'a.js': '// eslint-disable-next-line no-undef -- injected by the loader, not in scope here\ny();\n',
    'b.py': 'except Exception:  # noqa: BLE001 a bad frame must never crash the listen loop\n    pass\n',
    'c.py': 'value = untyped()  # type: ignore[assignment]  # third-party stub is wrong\n',
  } });
  try {
    // Every marker documents *why* on its own line — the reviewed decision the rule wants.
    assert.equal(run(warningSuppression, root, 'all').length, 0);
  } finally { cleanup(root); }
});

test('warning-suppression: passes a suppression explained by the comment immediately above', () => {
  const root = makeRepo({ changed: {
    'a.js': '// the loader injects this symbol at runtime; the linter can\'t see it\n// eslint-disable-next-line no-undef\ny();\n',
  } });
  try {
    assert.equal(run(warningSuppression, root, 'all').length, 0);
  } finally { cleanup(root); }
});

test('warning-suppression: still flags a bare marker with only a rule code (no reason)', () => {
  const root = makeRepo({ changed: {
    // A rule code names *which* warning, not *why* — still unexplained.
    'a.py': 'except Exception:  # noqa: BLE001\n    pass\n',
    // A blank line above is not a documenting comment.
    'b.js': '\n// eslint-disable-next-line no-undef\ny();\n',
    // The line above is another bare marker, not an explanation.
    'c.js': '// eslint-disable-next-line no-shadow\n// eslint-disable-next-line no-undef\ny();\n',
  } });
  try {
    const findings = run(warningSuppression, root, 'all');
    assert.equal(findings.length, 4); // one for a.py, one for b.js, two markers in c.js
    assert.ok(findings.every((f) => /no reason at the site/.test(f.what)));
  } finally { cleanup(root); }
});

// The markers are assembled rather than written out: a marker at the start of a
// line in this file would be a real violation of the rule this file tests.
const OURS = `${'<'.repeat(7)} HEAD`;
const BASE = `${'|'.repeat(7)} merged common ancestors`;
const THEIRS = `${'>'.repeat(7)} branch`;

test('no-conflict-markers: flags every conflict marker left in a scanned file', () => {
  const root = makeRepo({ changed: {
    'notes.md': [OURS, '- ours', '=======', '- theirs', THEIRS, ''].join('\n'),
  } });
  try {
    const findings = run(noConflictMarkers, root, 'all');
    assert.equal(findings.length, 2);
    assert.equal(findings[0].line, 1);
    assert.equal(findings[1].line, 5);
    assert.match(findings[0].what, /merge-conflict marker/);
  } finally { cleanup(root); }
});

test('no-conflict-markers: fires on the diff3 base marker too, in any scanned file', () => {
  const root = makeRepo({ changed: {
    'src/gen.js': [OURS, 'const a = 1;', BASE, 'const a = 2;', '=======', 'const a = 3;', THEIRS, ''].join('\n'),
  } });
  try {
    const findings = run(noConflictMarkers, root, 'all');
    assert.equal(findings.length, 3);
    assert.equal(findings[0].file, 'src/gen.js');
  } finally { cleanup(root); }
});

test('no-conflict-markers: stays quiet on a setext heading and on prose naming a marker', () => {
  const root = makeRepo({ changed: {
    'notes.md': ['Rules', '=======', '', `Delete the \`${OURS}\` line before staging.`, ''].join('\n'),
  } });
  try {
    assert.equal(run(noConflictMarkers, root, 'all').length, 0);
  } finally { cleanup(root); }
});

test('rules-line-length: one advisory per RULES.md whose lines run past 100 bytes', () => {
  const root = makeRepo({ changed: {
    'packs/demo/RULES.md': `- short rule\n- ${'x'.repeat(120)}\n`,
    'docs/notes.md': `${'x'.repeat(120)}\n`,
  } });
  try {
    const findings = runRule(rulesLineLength, buildContext({ root, mode: 'all' }));
    assert.deepEqual(findings.map((f) => [f.file, f.line]), [['packs/demo/RULES.md', 2]]);
    assert.match(findings[0].what, /1 line\(s\) over 100 bytes, longest 122/);
  } finally { cleanup(root); }
});

// The description is the one part of a skill that is in the window before anything asks
// for it, so the check has to reach the description LINE and nothing else in the file —
// a skill whose body runs long costs a session nothing until the skill loads.
const descWords = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
const skillFile = (name, words, bodyWords) => `---\nname: ${name}\ndescription: ${descWords(words)}\n---\n\n# ${name}\n\n${descWords(bodyWords)}\n`;

test('skill-description-length: flags a description past 60 words, and reads no other line in the file', () => {
  const root = makeRepo({ changed: {
    'packs/acme-pack/skills/acme-skill/SKILL.md': skillFile('acme-skill', 61, 10),
    // A short description over a long body: the body is what loads on demand, so it is
    // not this check's business and a finding here would be the check reading the file
    // rather than the declaration.
    'packs/acme-pack/skills/acme-other/SKILL.md': skillFile('acme-other', 40, 400),
  } });
  try {
    const found = runRule(skillDescriptionLength, buildContext({ root, mode: 'all' }));
    assert.deepEqual(found.map((f) => [f.file, f.line]), [['packs/acme-pack/skills/acme-skill/SKILL.md', 3]]);
  } finally { cleanup(root); }
});

// 60 and 61 are the only two inputs that tell `>60` apart from `>=60`, so they are the
// cases; sampling either side comfortably agrees with both and pins neither.
test('skill-description-length: 60 words is inside the cap, 61 is over it', () => {
  const root = makeRepo({ changed: {
    'packs/acme-pack/skills/acme-at-cap/SKILL.md': skillFile('acme-at-cap', 60, 5),
  } });
  try {
    assert.equal(runRule(skillDescriptionLength, buildContext({ root, mode: 'all' })).length, 0);
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
    '.claudinite-settings.json': config(entry),
    'a.txt': 'org/Repo appears just once\n', // expected 2, found 1
    'b.txt': 'org/Repo\n',
  } });
  const good = makeRepo({ changed: {
    '.claudinite-settings.json': config(entry),
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
    '.claudinite-settings.json': `${JSON.stringify({ sharedConstants: [{ what: 'moved', value: 'V', counts: { 'gone.txt': 1 } }] })}\n`,
  } });
  try {
    const findings = run(sharedConstants, root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /gone\.txt.*does not exist/);
  } finally { cleanup(root); }
});

test('shared-constants: flags an entry missing its self-documenting "what"', () => {
  const root = makeRepo({ changed: {
    '.claudinite-settings.json': `${JSON.stringify({ sharedConstants: [{ value: 'V', counts: { 'a.txt': 1 } }] })}\n`,
    'a.txt': 'V\n',
  } });
  try {
    const findings = run(sharedConstants, root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /malformed/);
  } finally { cleanup(root); }
});

test('shared-constants: flags an entry whose files are all the same import-capable technology', () => {
  // Two JS files can share an import — a shared-constant is redundant.
  const redundant = { what: 'a slug', value: 'org/Repo', counts: { 'src/mod.js': 1, 'test/mod.test.js': 1 } };
  const bad = makeRepo({ changed: {
    '.claudinite-settings.json': `${JSON.stringify({ sharedConstants: [redundant] })}\n`,
    'src/mod.js': 'org/Repo\n',
    'test/mod.test.js': 'org/Repo\n',
  } });
  // A value spanning two technologies (a JS module and a YAML workflow) genuinely
  // can't share an import — legitimate, not flagged.
  const legit = { what: 'label', value: 'ci-label', counts: { 'a.js': 1, 'w.yml': 1 } };
  const good = makeRepo({ changed: {
    '.claudinite-settings.json': `${JSON.stringify({ sharedConstants: [legit] })}\n`,
    'a.js': 'ci-label\n',
    'w.yml': 'ci-label\n',
  } });
  try {
    const findings = run(sharedConstants, bad);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /share an import/);
    assert.equal(run(sharedConstants, good).length, 0);
  } finally { cleanup(bad); cleanup(good); }
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
    '.claudinite-settings.json': config,
    'm.json': '{ "version": "1.5.0" }\n',
    'p.json': '{ "version": "1.5.0" }\n',
  } });
  const drifted = makeRepo({ changed: {
    '.claudinite-settings.json': config,
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
    '.claudinite-settings.json': `${JSON.stringify({ sharedConstants: [entry] })}\n`,
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
    '.claudinite-settings.json': `${JSON.stringify({ sharedConstants: [entry] })}\n`,
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

// What CLAUDE.md costs a session is what it BRINGS, not what it says: one `@` import
// line pulls a whole tree into every window, and a repo on Claudinite has exactly that
// — a CLAUDE.md of one line. Measuring the file alone is why the check could not fire
// on the corpus it was written to bound.
const budgetWords = (n) => `${Array.from({ length: n }, (_, i) => `w${i}`).join(' ')}\n`;

test('claude-md-length: weighs what CLAUDE.md imports, not only what it holds', () => {
  // A one-line CLAUDE.md pulling a tree well past the budget — the shape that was silent.
  const imported = makeRepo({ changed: {
    'CLAUDE.md': '@.claudinite/rules.md\n',
    '.claudinite/rules.md': `@../packs/acme-pack/RULES.md\n${budgetWords(4000)}`,
    'packs/acme-pack/RULES.md': budgetWords(14000),
  } });
  const small = makeRepo({ changed: {
    'CLAUDE.md': '@.claudinite/rules.md\n',
    '.claudinite/rules.md': budgetWords(200),
  } });
  try {
    const found = run(claudeMdLength, imported, 'all');
    assert.equal(found.length, 1);
    assert.equal(found[0].file, 'CLAUDE.md');
    // The finding names the tokens it counted, which is the unit the cost lands in.
    // 18,002 words — the two `@` lines count as words too — is 24,003 tokens.
    assert.match(found[0].what, /24,003 tokens \(budget 20,000\)/);
    assert.equal(run(claudeMdLength, small, 'all').length, 0);
  } finally { cleanup(imported); cleanup(small); }
});

test('claude-md-length: an import cycle is followed once, not forever', () => {
  const root = makeRepo({ changed: {
    'CLAUDE.md': '@a.md\n',
    'a.md': `@b.md\n${budgetWords(9000)}`,
    'b.md': `@a.md\n${budgetWords(9000)}`,
  } });
  try {
    // Each file counted once: 18,003 words is 24,004 tokens, not an unbounded walk.
    const found = run(claudeMdLength, root, 'all');
    assert.equal(found.length, 1);
    assert.match(found[0].what, /24,004 tokens/);
  } finally { cleanup(root); }
});

test('claude-md-length: an import that resolves to nothing is skipped, never counted or thrown on', () => {
  const root = makeRepo({ changed: { 'CLAUDE.md': `@gone/missing.md\n${budgetWords(100)}` } });
  try {
    assert.equal(run(claudeMdLength, root, 'all').length, 0);
  } finally { cleanup(root); }
});

test('claude-md-length: a long NON-root CLAUDE.md is not flagged (FP fix)', () => {
  // a fixture/example CLAUDE.md that never loads must not be flagged
  const root = makeRepo({ changed: { 'test/fixtures/CLAUDE.md': budgetWords(30000) } });
  try {
    assert.equal(run(claudeMdLength, root, 'all').length, 0);
  } finally { cleanup(root); }
});

test('generated-merge-driver: flags a GENERATED file lacking a merge=ours entry, passes when present', () => {
  const bad = makeRepo({ changed: { 'foo.GENERATED.json': '{}\n', 'src/a.mjs': 'export const x=1;\n' } });
  const good = makeRepo({
    changed: { 'foo.GENERATED.json': '{}\n', '.gitattributes': 'foo.GENERATED.json merge=ours\n' },
  });
  const noGenerated = makeRepo({ changed: { 'plain.json': '{}\n' } });
  try {
    const findings = run(generatedMergeDriver, bad, 'all');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'foo.GENERATED.json');
    assert.equal(run(generatedMergeDriver, good, 'all').length, 0);
    assert.equal(run(generatedMergeDriver, noGenerated, 'all').length, 0);
  } finally { cleanup(bad); cleanup(good); cleanup(noGenerated); }
});

test('generated-merge-driver: a glob merge=ours pattern covers matching files', () => {
  const root = makeRepo({
    changed: { 'a.GENERATED.md': 'x\n', '.gitattributes': '*.GENERATED.md merge=ours\n' },
  });
  try {
    assert.equal(run(generatedMergeDriver, root, 'all').length, 0);
  } finally { cleanup(root); }
});

test('generated-merge-driver: still inspects a GENERATED file that is also linguist-generated', () => {
  // The engine drops linguist-generated files from ctx.files, but this check reads
  // ctx.allFiles — so a GENERATED file carrying the attr (and lacking merge=ours) is
  // still caught rather than silently disappearing from the sweep.
  const root = makeRepo({ changed: {
    'foo.GENERATED.json': '{}\n',
    '.gitattributes': 'foo.GENERATED.json linguist-generated\n', // no merge=ours entry
  } });
  try {
    const findings = run(generatedMergeDriver, root, 'all');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'foo.GENERATED.json');
  } finally { cleanup(root); }
});

test('catalog-completeness: flags a pack dir missing from the catalog README', () => {
  // Skills have no catalog of their own (#385) — a bundled skill is its
  // pack's content, so only a pack missing from packs/README.md fires.
  const root = makeRepo({ changed: {
    ...CORPUS_MARKERS,
    'packs/README.md': '# packs\n\n[basics](basics/README.md)\n',
    'packs/newpack/pack.mjs': 'export default { id: "newpack" };\n',
    'packs/basics/skills/newskill/SKILL.md': '---\nname: newskill\n---\nbody\n',
  } });
  try {
    const findings = run(catalogCompleteness, root, 'all');
    assert.equal(findings.length, 1);
    assert.ok(findings.some((f) => f.file === 'packs/README.md' && /newpack/.test(f.what)));
  } finally { cleanup(root); }
});

test('catalog-completeness: silent when the catalog lists every pack', () => {
  const root = makeRepo({ changed: {
    ...CORPUS_MARKERS,
    'packs/README.md': '# packs\n\n[basics](basics/README.md) [acme-pack](acme-pack/README.md)\n',
    'packs/basics/pack.mjs': 'export default { id: "basics" };\n',
    'packs/acme-pack/pack.mjs': 'export default { id: "acme-pack" };\n',
    'packs/basics/skills/writing-tests/SKILL.md': '---\nname: writing-tests\n---\nbody\n',
  } });
  try {
    assert.equal(run(catalogCompleteness, root, 'all').length, 0);
  } finally { cleanup(root); }
});

test('catalog-completeness: silent outside the corpus repo (no registries tracked)', () => {
  const root = makeRepo({ changed: {
    'packs/README.md': '# packs\n',
    'packs/newpack/pack.mjs': 'export default { id: "newpack" };\n',
  } });
  try {
    assert.equal(run(catalogCompleteness, root, 'all').length, 0);
  } finally { cleanup(root); }
});

// --- comment-classification-form: the `Comment class:` line must carry the
// class alone — every class token on it is declared, however the line phrases them.

function runWithTranscript(rule, root, entries) {
  const { path, cleanup: rmTranscript } = makeTranscript(entries);
  try {
    const ctx = buildContext({ root, mode: 'changed', transcriptPath: path });
    return runRule(rule, ctx);
  } finally { rmTranscript(); }
}

const owner = (text, timestamp = '2026-01-01T10:00:00Z') =>
  ({ type: 'user', timestamp, message: { role: 'user', content: text } });
const reply = (text, timestamp = '2026-01-01T10:01:00Z') =>
  ({ type: 'assistant', timestamp, message: { role: 'assistant', content: [{ type: 'text', text }] } });

test('comment-classification-form: fires when the explanation smuggles another class on the same line', () => {
  const root = makeRepo({ changed: { 'a.md': 'x\n' } });
  try {
    const findings = runWithTranscript(commentClassificationForm, root, [
      owner('is this the right approach?'),
      reply('Comment class: other — unrelated to any feature request.'),
    ]);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /`feature`/);
    assert.match(findings[0].what, /`other`/);
  } finally { cleanup(root); }
});

test('comment-classification-form: fires when the menu is pasted verbatim', () => {
  const root = makeRepo({ changed: { 'a.md': 'x\n' } });
  try {
    const findings = runWithTranscript(commentClassificationForm, root, [
      owner('what should we do here?'),
      reply('Comment class: correction | feature | process-change | other'),
    ]);
    assert.equal(findings.length, 1);
  } finally { cleanup(root); }
});

test('comment-classification-form: passes a bare class alone on its own line, explanation on the next', () => {
  const root = makeRepo({ changed: { 'a.md': 'x\n' } });
  try {
    const findings = runWithTranscript(commentClassificationForm, root, [
      owner('is this the right approach?'),
      reply('Comment class: other\nNot a feature or a correction — just answering the question.'),
    ]);
    assert.equal(findings.length, 0);
  } finally { cleanup(root); }
});

test('comment-classification-form: passes markdown-emphasised bare class and a genuinely mixed comma list', () => {
  const root = makeRepo({ changed: { 'a.md': 'x\n' } });
  try {
    const bold = runWithTranscript(commentClassificationForm, root, [
      owner('please add the widget'),
      reply('**Comment class: other**\nActually a process note, not code.'),
    ]);
    assert.equal(bold.length, 0);
    const mixed = runWithTranscript(commentClassificationForm, root, [
      owner('please add the widget, and by the way that guard was wrong'),
      reply('Comment class: correction, feature'),
    ]);
    assert.equal(mixed.length, 0);
  } finally { cleanup(root); }
});

test('comment-classification-form: silent with no classification line at all, or no transcript (CI)', () => {
  const root = makeRepo({ changed: { 'a.md': 'x\n' } });
  try {
    const unclassified = runWithTranscript(commentClassificationForm, root, [
      owner('please add the widget'),
      reply('On it — adding the widget now.'),
    ]);
    assert.equal(unclassified.length, 0);
    assert.equal(runRule(commentClassificationForm, buildContext({ root, mode: 'changed' })).length, 0);
  } finally { cleanup(root); }
});

// --- work-request-not-started: a session that classified the owner's comment as
// work and then made no tool call at all has announced its intent and done nothing.

const replyWithTool = (text, name = 'Read', timestamp = '2026-01-01T10:01:00Z') =>
  ({ type: 'assistant', timestamp, message: { role: 'assistant', content: [
    { type: 'text', text }, { type: 'tool_use', id: 'tu1', name, input: {} },
  ] } });

test('work-request-not-started: fires on a work-classified reply that called nothing', () => {
  const root = makeRepo({ changed: { 'a.md': 'x\n' } });
  try {
    const findings = runWithTranscript(workRequestNotStarted, root, [
      owner("Let's move from github pages to deploy to Cloudflare. Adopt the relevant package and lets go."),
      reply("I'll start by getting oriented.\n\nLoaded Claudinite from repo missingbulb/EdFringeNow: 12 packs.\n\n**Comment class: process-change**"),
    ]);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /process-change/);
  } finally { cleanup(root); }
});

test('work-request-not-started: silent once the session has called a tool', () => {
  const root = makeRepo({ changed: { 'a.md': 'x\n' } });
  try {
    const findings = runWithTranscript(workRequestNotStarted, root, [
      owner('please add the widget'),
      replyWithTool('Comment class: feature\nStarting on it.'),
    ]);
    assert.equal(findings.length, 0);
  } finally { cleanup(root); }
});

test('work-request-not-started: silent on `other`, the class covering questions and command phrases', () => {
  const root = makeRepo({ changed: { 'a.md': 'x\n' } });
  try {
    const findings = runWithTranscript(workRequestNotStarted, root, [
      owner('why did that check fire?'),
      reply('Comment class: other\nBecause the line carried two class tokens.'),
    ]);
    assert.equal(findings.length, 0);
  } finally { cleanup(root); }
});

test('work-request-not-started: silent unclassified, and with no transcript (CI)', () => {
  const root = makeRepo({ changed: { 'a.md': 'x\n' } });
  try {
    const unclassified = runWithTranscript(workRequestNotStarted, root, [
      owner('please add the widget'),
      reply('On it.'),
    ]);
    assert.equal(unclassified.length, 0);
    assert.equal(runRule(workRequestNotStarted, buildContext({ root, mode: 'changed' })).length, 0);
  } finally { cleanup(root); }
});
