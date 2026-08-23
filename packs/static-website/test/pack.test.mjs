import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import pack from '../pack.mjs';
import releaseWorkflows, { VENDORED_ACTIONS, VENDORED_WORKFLOWS } from '../worldRules/release-workflows.mjs';
import siteConfig from '../worldRules/site-config.mjs';
import versionScheme from '../worldRules/version-scheme.mjs';
import { parseConfig } from '../stubs/actions/read-site-config/read-config.mjs';
import { resolve, toGithubEnv } from '../stubs/actions/read-site-config/export-build-vars.mjs';

const run = (rule, root) => rule.run(buildContext({ root, mode: 'all' }));

const ORCHESTRATOR = [
  'name: Release static site',
  'on:',
  '  push:',
  '    branches: [main]',
  '  workflow_dispatch:',
  'jobs:',
  '  release:',
  '    uses: ./.github/workflows/static-site-publish.yml',
  '',
].join('\n');

const CONFIG = [
  'publish_root=.',
  'publish_paths=index.html assets',
  'version_files=package.json',
  'build_command=',
  'test_command=npm test',
  '',
].join('\n');

// A repo carrying the whole vendored pipeline, its config, and a version on the
// scheme — the shape every rule here is quiet on.
function siteRepo(overrides = {}) {
  const files = {
    '.github/workflows/static-site-release.yml': ORCHESTRATOR,
    '.github/workflows/static-site-ci.yml': 'name: CI\non:\n  pull_request:\n',
    '.github/site.config': CONFIG,
    'index.html': '<!doctype html><title>site</title>\n',
    'assets/style.css': 'body{}\n',
    'package.json': '{\n  "version": "1.60704.1"\n}\n',
  };
  for (const wf of VENDORED_WORKFLOWS) files[`.github/workflows/${wf}`] = `name: reusable ${wf}\n`;
  for (const a of VENDORED_ACTIONS) files[`.github/actions/${a}/action.yml`] = `name: ${a}\n`;
  return makeRepo({ base: { ...files, ...overrides } });
}

test('static-website: the pack fingerprints a repo carrying the orchestrator, and only that', () => {
  const root = siteRepo();
  try {
    assert.equal(pack.detect(buildContext({ root, mode: 'all' })), true);
  } finally { cleanup(root); }

  // Same file, a different workflow's name — not this standard's orchestrator.
  const other = siteRepo({ '.github/workflows/static-site-release.yml': 'name: Something else\non:\n  push:\n' });
  try {
    assert.equal(pack.detect(buildContext({ root: other, mode: 'all' })), false);
  } finally { cleanup(other); }
});

test('sw/release-workflows: clean on the fully vendored pipeline', () => {
  const root = siteRepo();
  try {
    assert.deepEqual(run(releaseWorkflows, root), []);
  } finally { cleanup(root); }
});

test('sw/release-workflows: names every missing leg of the pipeline', () => {
  const root = makeRepo({ base: { '.github/workflows/static-site-release.yml': ORCHESTRATOR } });
  try {
    const findings = run(releaseWorkflows, root);
    const files = findings.map((f) => f.file);
    for (const wf of VENDORED_WORKFLOWS) assert.ok(files.includes(`.github/workflows/${wf}`), `expected a finding for ${wf}`);
    for (const a of VENDORED_ACTIONS) assert.ok(files.includes(`.github/actions/${a}/action.yml`), `expected a finding for ${a}`);
    assert.ok(files.includes('.github/workflows/static-site-ci.yml'), 'expected a finding for the missing PR gate');
    assert.ok(findings.every((f) => f.severity === 'blocking'));
  } finally { cleanup(root); }
});

test('sw/release-workflows: an orchestrator that lost its push trigger or its call is flagged', () => {
  const root = siteRepo({
    '.github/workflows/static-site-release.yml': 'name: Release static site\non:\n  workflow_dispatch:\njobs:\n  release:\n    runs-on: ubuntu-latest\n',
  });
  try {
    const what = run(releaseWorkflows, root).map((f) => f.what).join('\n');
    assert.match(what, /does not call the local/);
    assert.match(what, /no push: trigger/);
  } finally { cleanup(root); }
});

test('sw/release-workflows: inert on a repo that does not ship the pipeline (FP guard)', () => {
  // A site that deploys somewhere other than Pages declares the pack for the
  // versioning and CI half and carries no orchestrator — nothing to say.
  const root = makeRepo({ base: { 'index.html': '<!doctype html>\n', '.github/workflows/deploy.yml': 'name: Deploy elsewhere\n' } });
  try {
    assert.deepEqual(run(releaseWorkflows, root), []);
    assert.deepEqual(run(siteConfig, root), []);
  } finally { cleanup(root); }
});

test('sw/site-config: clean on a fully declared config', () => {
  const root = siteRepo();
  try {
    assert.deepEqual(run(siteConfig, root), []);
  } finally { cleanup(root); }
});

test('sw/site-config: a missing config file is blocking', () => {
  const bare = makeRepo({
    base: {
      '.github/workflows/static-site-release.yml': ORCHESTRATOR,
      'index.html': '<!doctype html>\n',
    },
  });
  try {
    const findings = run(siteConfig, bare);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, '.github/site.config');
    assert.match(findings[0].what, /missing/);
  } finally { cleanup(bare); }
});

test('sw/site-config: an unknown key, a missing key and a publish path that matches nothing', () => {
  const root = siteRepo({
    '.github/site.config': 'publish_root=.\npublish_paths=index.html gone\nversion_files=package.json\nbuild_command=\npublish_pathz=oops\n',
  });
  try {
    const what = run(siteConfig, root).map((f) => f.what).join('\n');
    assert.match(what, /unknown key 'publish_pathz'/);
    assert.match(what, /required key 'test_command' is missing/);
    assert.match(what, /publish path "gone" matches nothing/);
  } finally { cleanup(root); }
});

test('sw/site-config: publishing a tooling directory is refused', () => {
  const root = siteRepo({
    '.github/site.config': CONFIG.replace('publish_paths=index.html assets', 'publish_paths=index.html .claudinite'),
  });
  try {
    const what = run(siteConfig, root).map((f) => f.what).join('\n');
    assert.match(what, /publishes "\.claudinite"/);
  } finally { cleanup(root); }
});

test('sw/site-config: a publish set with no index.html would serve a 404 at /', () => {
  const root = siteRepo({
    '.github/site.config': CONFIG.replace('publish_paths=index.html assets', 'publish_paths=assets'),
  });
  try {
    const what = run(siteConfig, root).map((f) => f.what).join('\n');
    assert.match(what, /no publish path carries an index\.html/);
  } finally { cleanup(root); }
});

test('sw/site-config: a publish_root subdirectory resolves paths under it', () => {
  const root = siteRepo({
    '.github/site.config': 'publish_root=site\npublish_paths=index.html\nversion_files=package.json\nbuild_command=\ntest_command=\n',
    'site/index.html': '<!doctype html>\n',
  });
  try {
    assert.deepEqual(run(siteConfig, root), []);
  } finally { cleanup(root); }
});

test('sw/version-scheme: clean on the scheme, flags the bare-MMDD form it replaces', () => {
  const ok = siteRepo();
  try {
    assert.deepEqual(run(versionScheme, ok), []);
  } finally { cleanup(ok); }

  const legacy = siteRepo({ 'package.json': '{\n  "version": "1.1231.3"\n}\n' });
  try {
    const findings = run(versionScheme, legacy);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'package.json');
    assert.match(findings[0].what, /is not <major>\.<ymmdd>\.<n>/);
  } finally { cleanup(legacy); }
});

test('sw/version-scheme: version records that disagree are flagged', () => {
  const root = siteRepo({
    '.github/site.config': CONFIG.replace('version_files=package.json', 'version_files=package.json VERSION'),
    VERSION: '1.60704.2\n',
  });
  try {
    const findings = run(versionScheme, root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'VERSION');
    assert.match(findings[0].what, /disagrees with package\.json/);
  } finally { cleanup(root); }
});

test('sw/version-scheme: inert with no site config (FP guard)', () => {
  const root = makeRepo({ base: { 'package.json': '{"version": "1.2.3"}' } });
  try {
    assert.deepEqual(run(versionScheme, root), []);
  } finally { cleanup(root); }
});

// ---------------------------------------------------------------------------
// build_vars — the optional key, its exporter, and the drift guard that makes
// declaring it safe on a repo whose vendored copy is older than the feature.

test('site.config: build_vars is optional — an untouched five-key config stays valid', () => {
  const { values, errors } = parseConfig(CONFIG);
  assert.deepEqual(errors, []);
  assert.equal(values.has('build_vars'), false);
});

test('site.config: build_vars entries must be variable names, not values', () => {
  const { errors } = parseConfig(`${CONFIG}build_vars=GOOD_ONE not-a-name\n`);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /'not-a-name' is not a variable name/);
});

test('sw/site-config: a build_vars entry that is not a variable name is blocking', () => {
  const root = siteRepo({ '.github/site.config': `${CONFIG}build_vars=TOKEN=secretvalue\n` });
  try {
    const what = run(siteConfig, root).map((f) => f.what).join('\n');
    assert.match(what, /is not a variable name/);
  } finally { cleanup(root); }
});

test('export-build-vars: resolves the declared names and reports the ones with no value', () => {
  const { resolved, missing } = resolve('PRESENT BLANK ABSENT', { PRESENT: 'yes', BLANK: '' });
  assert.deepEqual(resolved, [['PRESENT', 'yes']]);
  // Empty is not "set" — an exported blank is the silent half-configured build.
  assert.deepEqual(missing, ['BLANK', 'ABSENT']);
});

test('export-build-vars: undeclared repo variables are never exported', () => {
  const { resolved } = resolve('WANTED', { WANTED: 'a', OTHER: 'b' });
  assert.deepEqual(resolved, [['WANTED', 'a']]);
});

test('export-build-vars: a multi-line value is written in the heredoc form', () => {
  assert.equal(toGithubEnv([['ONE', 'a']]), 'ONE=a');
  assert.equal(
    toGithubEnv([['KEY', 'line1\nline2']]),
    'KEY<<__EOF_KEY__\nline1\nline2\n__EOF_KEY__',
  );
});

test('sw/release-workflows: declaring build_vars on a pre-exporter vendored copy is blocking', () => {
  const root = siteRepo({ '.github/site.config': `${CONFIG}build_vars=SITE_TOKEN\n` });
  try {
    const findings = run(releaseWorkflows, root);
    const files = findings.map((f) => f.file);
    assert.ok(files.includes('.github/actions/read-site-config/export-build-vars.mjs'));
    assert.ok(files.includes('.github/workflows/static-site-deploy-pages.yml'));
    assert.ok(files.includes('.github/workflows/static-site-ci.yml'));
  } finally { cleanup(root); }
});

test('sw/release-workflows: a vendored copy that honours build_vars is clean', () => {
  const root = siteRepo({
    '.github/site.config': `${CONFIG}build_vars=SITE_TOKEN\n`,
    '.github/actions/read-site-config/export-build-vars.mjs': '// vendored exporter\n',
    '.github/workflows/static-site-deploy-pages.yml': 'name: deploy\nrun: node .github/actions/read-site-config/export-build-vars.mjs\n',
    '.github/workflows/static-site-ci.yml': 'name: CI\non:\n  pull_request:\nrun: node .github/actions/read-site-config/export-build-vars.mjs\n',
  });
  try {
    assert.deepEqual(run(releaseWorkflows, root), []);
  } finally { cleanup(root); }
});

test('sw/release-workflows: a repo that declares no build_vars is untouched by the exporter (FP guard)', () => {
  const root = siteRepo();
  try {
    assert.deepEqual(run(releaseWorkflows, root), []);
  } finally { cleanup(root); }
});
