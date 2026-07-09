import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from './helpers.mjs';
import { buildContext } from '../lib/context.mjs';
import claudeMdLength from '../../packs/universal/claude-md-length.mjs';
import generatedMergeDriver from '../../packs/universal/generated-merge-driver.mjs';
import esbuildDependency from '../../packs/aws-sam/esbuild-dependency.mjs';

const run = (rule, root) => rule.run(buildContext({ root, mode: 'all' }));

test('claude-md-length: flags a CLAUDE.md over 200 lines, passes a short one', () => {
  const long = makeRepo({ changed: { 'CLAUDE.md': `${'x\n'.repeat(250)}` } });
  const short = makeRepo({ changed: { 'CLAUDE.md': '# short\n\nfacts only\n' } });
  try {
    const findings = run(claudeMdLength, long);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /25[0-9]|251 lines/);
    assert.equal(findings[0].severity, 'advisory');
    assert.equal(run(claudeMdLength, short).length, 0);
  } finally { cleanup(long); cleanup(short); }
});

test('claude-md-length: a long NON-root CLAUDE.md is not flagged (FP fix)', () => {
  // a fixture/example CLAUDE.md that never loads must not be flagged
  const root = makeRepo({ changed: { 'test/fixtures/CLAUDE.md': `${'x\n'.repeat(250)}` } });
  try {
    assert.equal(run(claudeMdLength, root).length, 0);
  } finally { cleanup(root); }
});

test('generated-merge-driver: flags a GENERATED file lacking a merge=ours entry, passes when present', () => {
  const bad = makeRepo({ changed: { 'foo.GENERATED.json': '{}\n', 'src/a.mjs': 'export const x=1;\n' } });
  const good = makeRepo({
    changed: { 'foo.GENERATED.json': '{}\n', '.gitattributes': 'foo.GENERATED.json merge=ours\n' },
  });
  const noGenerated = makeRepo({ changed: { 'plain.json': '{}\n' } });
  try {
    const findings = run(generatedMergeDriver, bad);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'foo.GENERATED.json');
    assert.equal(run(generatedMergeDriver, good).length, 0);
    assert.equal(run(generatedMergeDriver, noGenerated).length, 0);
  } finally { cleanup(bad); cleanup(good); cleanup(noGenerated); }
});

test('generated-merge-driver: a glob merge=ours pattern covers matching files', () => {
  const root = makeRepo({
    changed: { 'a.GENERATED.md': 'x\n', '.gitattributes': '*.GENERATED.md merge=ours\n' },
  });
  try {
    assert.equal(run(generatedMergeDriver, root).length, 0);
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
    const findings = run(generatedMergeDriver, root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'foo.GENERATED.json');
  } finally { cleanup(root); }
});

test('engine: ctx.files excludes vendored/generated files; ctx.allFiles keeps them', () => {
  // The default sweep is the project's own code — so every check skips third-party
  // and machine-written files for free, not just warning-suppression.
  const root = makeRepo({ changed: {
    '.gitattributes': 'vendor/** linguist-vendored\ngen/** linguist-generated\n',
    'vendor/page.html': '<div>recorded third-party fixture</div>\n',
    'gen/out.js': 'machineWritten();\n',
    'src/mine.js': 'projectCode();\n',
  } });
  try {
    const ctx = buildContext({ root, mode: 'all' });
    assert.ok(!ctx.files.includes('vendor/page.html'));
    assert.ok(!ctx.files.includes('gen/out.js'));
    assert.ok(ctx.files.includes('src/mine.js'));
    // The unfiltered set retains them for checks that reason about generated files.
    assert.ok(ctx.allFiles.includes('vendor/page.html'));
    assert.ok(ctx.allFiles.includes('gen/out.js'));
  } finally { cleanup(root); }
});

test('esbuild-dependency: flags devDependency esbuild under SAM esbuild build, passes as a regular dependency', () => {
  const tmpl = 'Resources:\n  Fn:\n    Metadata:\n      BuildMethod: esbuild\n';
  const bad = makeRepo({
    changed: { 'template.yaml': tmpl, 'package.json': JSON.stringify({ devDependencies: { esbuild: '^0.20' } }) },
  });
  const good = makeRepo({
    changed: { 'template.yaml': tmpl, 'package.json': JSON.stringify({ dependencies: { esbuild: '^0.20' } }) },
  });
  const noSam = makeRepo({
    changed: { 'package.json': JSON.stringify({ devDependencies: { esbuild: '^0.20' } }) },
  });
  try {
    const findings = run(esbuildDependency, bad);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(run(esbuildDependency, good).length, 0);
    assert.equal(run(esbuildDependency, noSam).length, 0);
  } finally { cleanup(bad); cleanup(good); cleanup(noSam); }
});

test('esbuild-dependency: a multi-package repo is not flagged (FP fix)', () => {
  // root esbuild devDep is legitimate tooling when the SAM function builds from
  // its own manifest — more than one package.json means skip
  const root = makeRepo({
    changed: {
      'template.yaml': 'Resources:\n  Fn:\n    Metadata:\n      BuildMethod: esbuild\n',
      'package.json': JSON.stringify({ devDependencies: { esbuild: '^0.20' } }),
      'fn/package.json': JSON.stringify({ dependencies: { esbuild: '^0.20' } }),
    },
  });
  try {
    assert.equal(run(esbuildDependency, root).length, 0);
  } finally { cleanup(root); }
});
