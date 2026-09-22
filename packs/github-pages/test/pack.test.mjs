import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import pack from '../pack.mjs';
import { CONFIG_PATH, DEPLOY_WORKFLOW_PATH, parseConfig, publishSet } from '../lib.mjs';
import { assemble, main as buildSite, resolveBuildVars } from '../build-site.mjs';
import siteConfig from '../worldRules/site-config.mjs';
import deployWorkflow from '../worldRules/deploy-workflow.mjs';
import { runRule } from '../../../engine/checks/helpers/work.mjs';

const run = (rule, root) => runRule(rule, buildContext({ root, mode: 'all' }));

const CONFIG = 'publish_root=.\npublish_paths=index.html assets\nbuild_command=\n';
const DEPLOY = readFileSync(new URL('../stubs/workflows/github-pages-deploy.yml', import.meta.url), 'utf8');

// A repo carrying the config and the vendored deploy workflow — the shape every rule
// here is quiet on.
function pagesRepo(overrides = {}) {
  return makeRepo({ base: {
    [CONFIG_PATH]: CONFIG,
    [DEPLOY_WORKFLOW_PATH]: DEPLOY,
    'index.html': '<!doctype html><title>site</title>\n',
    'assets/style.css': 'body{}\n',
    ...overrides,
  } });
}

// Fixtures cannot delete a file, so the "without" cases are built without it.
function without(path, overrides = {}) {
  const files = { [CONFIG_PATH]: CONFIG, [DEPLOY_WORKFLOW_PATH]: DEPLOY, 'index.html': '<!doctype html>\n', ...overrides };
  delete files[path];
  return makeRepo({ base: files });
}

test('the pack fingerprints a repo carrying the site config, and is inert without either signal', () => {
  const root = pagesRepo();
  try { assert.equal(pack.detect(buildContext({ root, mode: 'all' })), true); } finally { cleanup(root); }
  const plain = makeRepo({ base: { 'index.html': '<!doctype html>\n' } });
  try {
    const ctx = buildContext({ root: plain, mode: 'all' });
    assert.equal(pack.detect(ctx), false);
    for (const rule of [siteConfig, deployWorkflow]) assert.deepEqual(runRule(rule, ctx), [], `${rule.id} fired on a repo that never adopted the standard`);
  } finally { cleanup(plain); }
});

// A site is served from Pages or from something else, never both, so no other
// hosting pack is named — and the manifest reaches public-website only by name.
test('the manifest names no other hosting pack', () => {
  assert.doesNotMatch(JSON.stringify(pack.ruleRoutingGuidance) + pack.requires.join(' '), /cloudflare/i);
});

test('gp/site-config: clean on a fully declared config', () => {
  const root = pagesRepo();
  try { assert.deepEqual(run(siteConfig, root), []); } finally { cleanup(root); }
});

// The two-signal gate: the workflow alone is enough to demand the config.
test('gp/site-config: a missing config beside the vendored workflow is blocking', () => {
  const root = without(CONFIG_PATH);
  try {
    const out = run(siteConfig, root);
    assert.equal(out.length, 1);
    assert.match(out[0].what, /missing/);
    assert.equal(out[0].file, CONFIG_PATH);
  } finally { cleanup(root); }
});

test('gp/site-config: an unknown key, a missing key and a publish path that matches nothing', () => {
  const root = pagesRepo({ [CONFIG_PATH]: 'publish_root=.\npublish_paths=index.html missing-dir\nversion_files=package.json\n' });
  try {
    const whats = run(siteConfig, root).map((f) => f.what);
    assert.ok(whats.some((w) => /unknown key 'version_files'/.test(w)), whats.join('\n'));
    assert.ok(whats.some((w) => /required key 'build_command' is missing/.test(w)), whats.join('\n'));
    assert.ok(whats.some((w) => /"missing-dir" matches nothing tracked/.test(w)), whats.join('\n'));
  } finally { cleanup(root); }
});

test('gp/site-config: publishing a tooling directory or the whole repo root is refused', () => {
  const root = pagesRepo({ [CONFIG_PATH]: 'publish_root=.\npublish_paths=index.html .claudinite\nbuild_command=\n' });
  try {
    assert.match(run(siteConfig, root).map((f) => f.what).join('\n'), /publishes "\.claudinite"/);
  } finally { cleanup(root); }
  const whole = pagesRepo({ [CONFIG_PATH]: 'publish_root=.\npublish_paths=.\nbuild_command=\n' });
  try {
    assert.match(run(siteConfig, whole).map((f) => f.what).join('\n'), /whole repo root/);
  } finally { cleanup(whole); }
});

test('gp/site-config: a publish set with no index.html would serve a 404 at /', () => {
  const root = pagesRepo({ [CONFIG_PATH]: 'publish_root=.\npublish_paths=assets\nbuild_command=\n' });
  try { assert.match(run(siteConfig, root).map((f) => f.what).join('\n'), /no publish path carries an index\.html/); } finally { cleanup(root); }
});

test('gp/site-config: a publish_root subdirectory resolves paths under it, and "." publishes it whole', () => {
  const root = pagesRepo({
    [CONFIG_PATH]: 'publish_root=site\npublish_paths=.\nbuild_command=\n',
    'site/index.html': '<!doctype html>\n',
  });
  try { assert.deepEqual(run(siteConfig, root), []); } finally { cleanup(root); }
});

test('gp/deploy-workflow: clean on the vendored workflow, blocking when it is missing', () => {
  const root = pagesRepo();
  try { assert.deepEqual(run(deployWorkflow, root), []); } finally { cleanup(root); }
  const missing = without(DEPLOY_WORKFLOW_PATH);
  try {
    const out = run(deployWorkflow, missing);
    assert.equal(out.length, 1);
    assert.match(out[0].fix, /stubs\/workflows\/github-pages-deploy\.yml/);
  } finally { cleanup(missing); }
});

test('gp/deploy-workflow: a push trigger, a foreign workflow under the name, and a second publisher are all refused', () => {
  const pushed = pagesRepo({ [DEPLOY_WORKFLOW_PATH]: DEPLOY.replace('on:\n  workflow_dispatch:', 'on:\n  push:\n    branches: [main]\n  workflow_dispatch:') });
  try { assert.match(run(deployWorkflow, pushed).map((f) => f.what).join('\n'), /has a push: trigger/); } finally { cleanup(pushed); }
  const foreign = pagesRepo({ [DEPLOY_WORKFLOW_PATH]: 'name: Something else\non:\n  workflow_dispatch:\njobs: {}\n' });
  try { assert.match(run(deployWorkflow, foreign).map((f) => f.what).join('\n'), /is not the pack's deploy workflow/); } finally { cleanup(foreign); }
  const second = pagesRepo({ '.github/workflows/old-release.yml': 'name: old\non:\n  push:\njobs:\n  d:\n    steps:\n      # - uses: actions/deploy-pages@v4\n      - uses: actions/deploy-pages@v4\n' });
  try {
    const out = run(deployWorkflow, second);
    assert.equal(out.length, 1, JSON.stringify(out));
    assert.equal(out[0].line, 8);
    assert.match(out[0].what, /second workflow/);
  } finally { cleanup(second); }
});

test('site.config: build_vars is optional, and its entries must be variable names', () => {
  assert.deepEqual(parseConfig(CONFIG).errors, []);
  assert.deepEqual(parseConfig(`${CONFIG}build_vars=SITE_TOKEN BASE_URL\n`).errors, []);
  assert.match(parseConfig(`${CONFIG}build_vars=FOO=bar\n`).errors.join('\n'), /not a variable name/);
  const { paths, fullOf } = publishSet(parseConfig('publish_root=site/\npublish_paths=index.html data\nbuild_command=\n').values);
  assert.deepEqual(paths.map(fullOf), ['site/index.html', 'site/data']);
});

test('build variables: declared names resolve from the repo variables, and an unset one is named', () => {
  assert.deepEqual(resolveBuildVars('A B', { A: '1', B: 'x', C: 'never' }), { resolved: [['A', '1'], ['B', 'x']], missing: [] });
  assert.deepEqual(resolveBuildVars('A B', { A: '' }), { resolved: [], missing: ['A', 'B'] });
});

// The assembly's two guards, and the build step end to end with a build command and
// an exported variable reaching it.
test('build-site assembles the publish set, runs the build with its variables, and refuses a broken set', () => {
  const root = pagesRepo({
    [CONFIG_PATH]: 'publish_root=.\npublish_paths=index.html assets out\nbuild_command=mkdir -p out && echo "$GREETING" > out/hello.txt\nbuild_vars=GREETING\n',
  });
  try {
    const files = buildSite(root, { REPO_VARS_JSON: JSON.stringify({ GREETING: 'hi' }), PATH: process.env.PATH });
    assert.deepEqual(files, ['assets/style.css', 'index.html', 'out/hello.txt']);
    assert.equal(readFileSync(join(root, '_site', 'out', 'hello.txt'), 'utf8').trim(), 'hi');
    assert.throws(() => buildSite(root, { REPO_VARS_JSON: '{}' }), /GREETING/);

    const values = parseConfig('publish_root=.\npublish_paths=index.html gone\nbuild_command=\n').values;
    assert.throws(() => assemble(root, values), /publish path 'gone' does not exist/);
    mkdirSync(join(root, 'site'));
    writeFileSync(join(root, 'site', 'about.html'), '<p>');
    assert.throws(() => assemble(root, parseConfig('publish_root=site\npublish_paths=about.html\nbuild_command=\n').values), /no index\.html at its root/);
  } finally { cleanup(root); }
});
