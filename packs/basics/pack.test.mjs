import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, deletePath, cleanup, git, writeFiles, makeTranscript } from '../../checks/test/helpers.mjs';
import { buildContext } from '../../checks/lib/context.mjs';
import commentClassification from './comment-classification.mjs';
import referenceIntegrity from './reference-integrity.mjs';
import linkLabels from './markdown-link-labels.mjs';
import taskLifecycle from './task-lifecycle.mjs';
import warningSuppression from './warning-suppression.mjs';
import filePlacement from './file-placement.mjs';
import squashMergeHistory from './squash-merge-history.mjs';
import sharedConstants from './shared-constants.mjs';
import skillOwnership from './skill-ownership.mjs';
import claudeMdLength from './claude-md-length.mjs';
import generatedMergeDriver from './generated-merge-driver.mjs';
import catalogCompleteness from './catalog-completeness.mjs';

function run(rule, root, mode = 'changed') {
  const ctx = buildContext({ root, mode });
  return rule.run(ctx);
}

// The relevance gate for skill-ownership: both registries tracked = the repo IS the corpus.
const CORPUS_MARKERS = {
  'packs/registry.mjs': '// corpus marker\n',
  'skills/registry.mjs': '// corpus marker\n',
};

function runSkillOwnership(root, knownPacks) {
  const ctx = buildContext({ root, mode: 'all' });
  ctx.knownPacks = knownPacks; // attached by the runner in real sweeps
  return skillOwnership.run(ctx);
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
      'migrations/active_migrations/2026-01-01-old-relocation.mjs': `export default {
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
      '.claudinite/local_packs/proj/no-mute.mjs': '// detect: /eslint-disable/\nexport default {};\n',
      '.claudinite/local_packs/proj/skills/x/checks.mjs': 'const p = /@ts-ignore/;\nexport default [];\n',
      // but a run_daily script is ordinary code — a bare mute there still fires
      '.claudinite/local_packs/proj/run_daily/job.js': '// eslint-disable-next-line no-undef\ny();\n',
    },
  });
  try {
    const findings = run(warningSuppression, root, 'all');
    assert.equal(findings.length, 1);
    assert.match(findings[0].file, /run_daily\/job\.js/);
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

test('shared-constants: flags an entry whose files are all the same import-capable technology', () => {
  // Two JS files can share an import — a shared-constant is redundant.
  const redundant = { what: 'a slug', value: 'org/Repo', counts: { 'src/mod.js': 1, 'test/mod.test.js': 1 } };
  const bad = makeRepo({ changed: {
    '.claudinite-checks.json': `${JSON.stringify({ sharedConstants: [redundant] })}\n`,
    'src/mod.js': 'org/Repo\n',
    'test/mod.test.js': 'org/Repo\n',
  } });
  // A value spanning two technologies (a JS module and a YAML workflow) genuinely
  // can't share an import — legitimate, not flagged.
  const legit = { what: 'label', value: 'ci-label', counts: { 'a.js': 1, 'w.yml': 1 } };
  const good = makeRepo({ changed: {
    '.claudinite-checks.json': `${JSON.stringify({ sharedConstants: [legit] })}\n`,
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

test('skill-ownership: flags a skill no pack requires', () => {
  const root = makeRepo({
    changed: { ...CORPUS_MARKERS, 'skills/orphan/SKILL.md': '---\nname: orphan\n---\nbody\n' },
  });
  try {
    const findings = runSkillOwnership(root, [{ id: 'basics', skills: [] }]);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'skills/orphan/SKILL.md');
    assert.match(findings[0].what, /no pack requires/);
  } finally { cleanup(root); }
});

test('skill-ownership: passes when at least one pack requires the skill', () => {
  const root = makeRepo({
    changed: { ...CORPUS_MARKERS, 'skills/orphan/SKILL.md': '---\nname: orphan\n---\nbody\n' },
  });
  try {
    assert.equal(runSkillOwnership(root, [{ id: 'basics', skills: ['orphan'] }]).length, 0);
    // Required by several packs is fine too.
    assert.equal(runSkillOwnership(root, [
      { id: 'basics', skills: ['orphan'] },
      { id: 'node', skills: ['orphan'] },
    ]).length, 0);
  } finally { cleanup(root); }
});

test('skill-ownership: flags a pack requiring a skill that does not exist', () => {
  const root = makeRepo({ changed: { ...CORPUS_MARKERS } });
  try {
    const findings = runSkillOwnership(root, [{ id: 'node', skills: ['ghost'] }]);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'packs/node/pack.mjs');
    assert.match(findings[0].what, /"ghost"/);
  } finally { cleanup(root); }
});

test('skill-ownership: silent outside the corpus repo', () => {
  // A consumer never tracks the registries (the corpus lives under its
  // gitignored mount) — the rule must not fire there.
  const root = makeRepo({
    changed: { 'skills/orphan/SKILL.md': '---\nname: orphan\n---\nbody\n' },
  });
  try {
    assert.equal(runSkillOwnership(root, [{ id: 'basics', skills: [] }]).length, 0);
  } finally { cleanup(root); }
});

test('claude-md-length: flags a CLAUDE.md over 200 lines, passes a short one', () => {
  const long = makeRepo({ changed: { 'CLAUDE.md': `${'x\n'.repeat(250)}` } });
  const short = makeRepo({ changed: { 'CLAUDE.md': '# short\n\nfacts only\n' } });
  try {
    const findings = run(claudeMdLength, long, 'all');
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /25[0-9]|251 lines/);
    assert.equal(findings[0].severity, 'advisory');
    assert.equal(run(claudeMdLength, short, 'all').length, 0);
  } finally { cleanup(long); cleanup(short); }
});

test('claude-md-length: a long NON-root CLAUDE.md is not flagged (FP fix)', () => {
  // a fixture/example CLAUDE.md that never loads must not be flagged
  const root = makeRepo({ changed: { 'test/fixtures/CLAUDE.md': `${'x\n'.repeat(250)}` } });
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

test('catalog-completeness: flags a pack/skill dir missing from its catalog README', () => {
  const root = makeRepo({ changed: {
    ...CORPUS_MARKERS,
    'packs/README.md': '# packs\n\n[basics](basics/README.md)\n',
    'skills/README.md': '# skills\n\n`merge-to-main`\n',
    'packs/newpack/pack.mjs': 'export default { id: "newpack" };\n',
    'skills/newskill/SKILL.md': '---\nname: newskill\n---\nbody\n',
  } });
  try {
    const findings = run(catalogCompleteness, root, 'all');
    assert.equal(findings.length, 2);
    assert.ok(findings.some((f) => f.file === 'packs/README.md' && /newpack/.test(f.what)));
    assert.ok(findings.some((f) => f.file === 'skills/README.md' && /newskill/.test(f.what)));
  } finally { cleanup(root); }
});

test('catalog-completeness: silent when both catalogs list every member', () => {
  const root = makeRepo({ changed: {
    ...CORPUS_MARKERS,
    'packs/README.md': '# packs\n\n[basics](basics/README.md) [node](node/README.md)\n',
    'skills/README.md': '# skills\n\n`merge-to-main` `writing-tests`\n',
    'packs/basics/pack.mjs': 'export default { id: "basics" };\n',
    'packs/node/pack.mjs': 'export default { id: "node" };\n',
    'skills/merge-to-main/SKILL.md': '---\nname: merge-to-main\n---\nbody\n',
    'skills/writing-tests/SKILL.md': '---\nname: writing-tests\n---\nbody\n',
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

// --- comment-classification: the reply to the owner's latest comment must carry
// an explicit `Comment class:` line (conversation surface — Stop hook only).

function runWithTranscript(rule, root, entries) {
  const { path, cleanup: rmTranscript } = makeTranscript(entries);
  try {
    const ctx = buildContext({ root, mode: 'changed', transcriptPath: path });
    return rule.run(ctx);
  } finally { rmTranscript(); }
}

const owner = (text, timestamp = '2026-01-01T10:00:00Z') =>
  ({ type: 'user', timestamp, message: { role: 'user', content: text } });
const reply = (text, timestamp = '2026-01-01T10:01:00Z') =>
  ({ type: 'assistant', timestamp, message: { role: 'assistant', content: [{ type: 'text', text }] } });
const toolResult = () =>
  ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] } });

test('comment-classification: flags a reply with no classification line, passes an explicit one', () => {
  const root = makeRepo({ changed: { 'a.md': 'x\n' } });
  try {
    const bad = runWithTranscript(commentClassification, root, [
      owner('please add the widget'),
      reply('On it — adding the widget now.'),
    ]);
    assert.equal(bad.length, 1);
    assert.match(bad[0].what, /Comment class/);
    const good = runWithTranscript(commentClassification, root, [
      owner('please add the widget'),
      reply('**Comment class: feature** — routing this as a feature run.'),
    ]);
    assert.equal(good.length, 0);
  } finally { cleanup(root); }
});

test('comment-classification: judges the latest owner comment, not an earlier classified one', () => {
  const root = makeRepo({ changed: { 'a.md': 'x\n' } });
  try {
    const findings = runWithTranscript(commentClassification, root, [
      owner('please add the widget', '2026-01-01T10:00:00Z'),
      reply('Comment class: feature — starting the run.', '2026-01-01T10:01:00Z'),
      owner('also rename the button', '2026-01-01T10:05:00Z'),
      reply('Renaming it.', '2026-01-01T10:06:00Z'),
    ]);
    assert.equal(findings.length, 1);
  } finally { cleanup(root); }
});

test('comment-classification: a late marker in the same turn converges the finding', () => {
  const root = makeRepo({ changed: { 'a.md': 'x\n' } });
  try {
    const findings = runWithTranscript(commentClassification, root, [
      owner('also rename the button'),
      reply('Renaming it.'),
      reply('Comment class: feature — and the requirement is recorded.'),
    ]);
    assert.equal(findings.length, 0);
  } finally { cleanup(root); }
});

test('comment-classification: tool results, meta, and tag-wrapped turns are not owner comments', () => {
  const root = makeRepo({ changed: { 'a.md': 'x\n' } });
  try {
    const findings = runWithTranscript(commentClassification, root, [
      owner('please add the widget'),
      reply('Comment class: feature — on it.'),
      toolResult(),
      { type: 'user', isMeta: true, message: { role: 'user', content: [{ type: 'text', text: 'meta note' }] } },
      owner('<system-reminder>synthetic</system-reminder>'),
      reply('Continuing the run.'),
    ]);
    assert.equal(findings.length, 0);
  } finally { cleanup(root); }
});

test('comment-classification: silent without a transcript (CI) and on an empty conversation', () => {
  const root = makeRepo({ changed: { 'a.md': 'x\n' } });
  try {
    assert.equal(commentClassification.run(buildContext({ root, mode: 'changed' })).length, 0);
    assert.equal(runWithTranscript(commentClassification, root, [toolResult()]).length, 0);
  } finally { cleanup(root); }
});

// --- claudinite-isolation ----------------------------------------------------
import claudiniteIsolation from './claudinite-isolation.mjs';

test('claudinite-isolation: inert without the vendored mount; a consumer file referencing the canon fires; wiring files and local_packs stay open', () => {
  const violating = {
    'src/tool.mjs': 'const p = ".claudinite/shared/checks/run.mjs";\n',
  };
  const wiring = {
    '.claude/settings.json': '{ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claudinite/shared/checks/stop-hook.mjs" } ] } ] } }\n',
    'CLAUDE.md': '@.claudinite/shared/CLAUDE.md\n',
    '.gitignore': '/.claudinite/*\n!/.claudinite/shared/\n',
    '.github/workflows/claudinite-checks-ci.yml': 'run: node .claudinite/shared/checks/run.mjs\n',
    '.claudinite/local_packs/mine/check.mjs': 'import { run } from "../../shared/checks/run.mjs";\n',
  };
  const shared = {
    '.claudinite/shared/checks/run.mjs': 'engine\n',
    '.claudinite/shared/checks/stop-hook.mjs': 'engine\n',
    '.claudinite/shared/CLAUDE.md': 'index\n',
  };
  // No vendored mount → the gate keeps the rule inert even with a violating file.
  const off = makeRepo({ changed: { ...violating } });
  // Vendored mount present → the violating file fires; the wiring files do not.
  const on = makeRepo({ changed: { ...violating, ...wiring, ...shared } });
  try {
    assert.deepEqual(run(claudiniteIsolation, off, 'all'), []);
    const f = run(claudiniteIsolation, on, 'all');
    assert.equal(f.length, 1, JSON.stringify(f, null, 2));
    assert.equal(f[0].file, 'src/tool.mjs');
    assert.match(f[0].what, /\.claudinite\/shared\/checks\/run\.mjs/);
    assert.equal(f[0].severity, 'blocking');
  } finally { cleanup(off); cleanup(on); }
});
