import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import pack from '../pack.mjs';
import vendoredPipeline, { CI_STUB_FILE, VENDORED_ACTIONS } from '../worldRules/vendored-pipeline.mjs';
import siteConfig from '../worldRules/site-config.mjs';
import versionScheme from '../worldRules/version-scheme.mjs';
import { parseConfig } from '../stubs/actions/read-site-config/read-config.mjs';
import { resolve, toGithubEnv } from '../stubs/actions/read-site-config/export-build-vars.mjs';

const run = (rule, root) => rule.run(buildContext({ root, mode: 'all' }));

const CONFIG = [
  'publish_root=.',
  'publish_paths=index.html assets',
  'version_files=package.json',
  'build_command=',
  'test_command=npm test',
  '',
].join('\n');

// A repo carrying the whole vendored set, its config, and a version on the
// scheme — the shape every rule here is quiet on. Nothing about how the site is
// SERVED: that is the serving pack's fixture, and none of these rules read it.
function siteRepo(overrides = {}) {
  const files = {
    [`.github/workflows/${CI_STUB_FILE}`]: 'name: CI\non:\n  pull_request:\n',
    '.github/site.config': CONFIG,
    'index.html': '<!doctype html><title>site</title>\n',
    'assets/style.css': 'body{}\n',
    'package.json': '{\n  "version": "1.60704.1"\n}\n',
  };
  for (const a of VENDORED_ACTIONS) files[`.github/actions/${a}/action.yml`] = `name: ${a}\n`;
  return makeRepo({ base: { ...files, ...overrides } });
}

test('sw/site-config: clean on a fully declared config', () => {
  const root = siteRepo();
  try {
    assert.deepEqual(run(siteConfig, root), []);
  } finally { cleanup(root); }
});

test('sw/site-config: a missing config file is blocking', () => {
  // Relevant through the OTHER signal: the vendored gate is here, the config is
  // not — which is exactly the case a config-only gate would pass in silence.
  const bare = makeRepo({
    base: {
      [`.github/workflows/${CI_STUB_FILE}`]: 'name: CI\non:\n  pull_request:\n',
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


// ---------------------------------------------------------------------------
// sw/vendored-pipeline — the pack's own vendored surface, and the two-signal
// relevance gate all four of its rules share.

test('sw/vendored-pipeline: clean on the fully vendored set', () => {
  const root = siteRepo();
  try {
    assert.deepEqual(run(vendoredPipeline, root), []);
  } finally { cleanup(root); }
});

test('sw/vendored-pipeline: names every missing composite action and the absent gate', () => {
  const root = makeRepo({ base: { '.github/site.config': CONFIG, 'index.html': '<!doctype html>\n' } });
  try {
    const findings = run(vendoredPipeline, root);
    const files = findings.map((f) => f.file);
    assert.equal(files.length, VENDORED_ACTIONS.length + 1,
      `expected one finding per action plus the gate, got: ${files.join(', ')}`);
    for (const a of VENDORED_ACTIONS) assert.ok(files.includes(`.github/actions/${a}/action.yml`), `expected a finding for ${a}`);
    assert.ok(files.includes(`.github/workflows/${CI_STUB_FILE}`), 'expected a finding for the missing PR gate');
    assert.ok(findings.every((f) => f.severity === 'blocking'));
  } finally { cleanup(root); }
});

test('sw/vendored-pipeline: a repo running its own CI workflow satisfies the gate', () => {
  // The gate requirement is that pull requests run SOMETHING, not that they run
  // this stub — a repo with its own suite is not asked to take a second one.
  const files = {
    '.github/site.config': CONFIG,
    '.github/workflows/my-ci.yml': 'name: My CI\non:\n  pull_request:\n',
    'index.html': '<!doctype html>\n',
    'assets/style.css': 'body{}\n',
    'package.json': '{\n  "version": "1.60704.1"\n}\n',
  };
  for (const a of VENDORED_ACTIONS) files[`.github/actions/${a}/action.yml`] = `name: ${a}\n`;
  const root = makeRepo({ base: files });
  try {
    assert.deepEqual(run(vendoredPipeline, root), []);
  } finally { cleanup(root); }
});

test('sw/vendored-pipeline: declaring build_vars on a pre-exporter vendored copy is blocking', () => {
  const root = siteRepo({ '.github/site.config': `${CONFIG}build_vars=SITE_TOKEN\n` });
  try {
    const files = run(vendoredPipeline, root).map((f) => f.file);
    assert.ok(files.includes('.github/actions/read-site-config/export-build-vars.mjs'));
    assert.ok(files.includes(`.github/workflows/${CI_STUB_FILE}`));
  } finally { cleanup(root); }
});

test('sw/vendored-pipeline: a vendored copy that honours build_vars is clean', () => {
  const root = siteRepo({
    '.github/site.config': `${CONFIG}build_vars=SITE_TOKEN\n`,
    '.github/actions/read-site-config/export-build-vars.mjs': '// vendored exporter\n',
    [`.github/workflows/${CI_STUB_FILE}`]: 'name: CI\non:\n  pull_request:\nrun: node .github/actions/read-site-config/export-build-vars.mjs\n',
  });
  try {
    assert.deepEqual(run(vendoredPipeline, root), []);
  } finally { cleanup(root); }
});

test('sw/vendored-pipeline: a repo that declares no build_vars is untouched by the exporter (FP guard)', () => {
  const root = siteRepo();
  try {
    assert.deepEqual(run(vendoredPipeline, root), []);
  } finally { cleanup(root); }
});

test('the pack is inert on a repo carrying neither signal (FP guard)', () => {
  // Neither the config nor the gate: nothing here has adopted the standard, so
  // every rule in the pack — including the one whose whole job is to report a
  // missing config — stays silent rather than demanding one of a repo that
  // never asked for it.
  const root = makeRepo({ base: { 'index.html': '<!doctype html>\n', 'package.json': '{"version": "1.2.3"}' } });
  try {
    for (const rule of [vendoredPipeline, siteConfig, versionScheme]) {
      assert.deepEqual(run(rule, root), [], `${rule.id} fired on a repo that has not adopted the standard`);
    }
    assert.equal(pack.detect(buildContext({ root, mode: 'all' })), false);
  } finally { cleanup(root); }
});

test('the pack fingerprints a repo carrying the site config', () => {
  const root = siteRepo();
  try {
    assert.equal(pack.detect(buildContext({ root, mode: 'all' })), true);
  } finally { cleanup(root); }
});
