import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule, { publishPrefixes, touchesPublishSet } from '../workRules/version-bumped.mjs';

const ORCHESTRATOR = '.github/workflows/static-site-release.yml';
const CONFIG = '.github/site.config';

const config = (extra = '') => [
  'publish_root=site',
  'publish_paths=index.html assets',
  'version_files=package.json',
  'build_command=',
  'test_command=',
  extra,
].filter(Boolean).join('\n');

const pkg = (version) => `{\n  "name": "demo",\n  "version": "${version}"\n}\n`;

// The work context a work rule receives — only the members this rule reads.
const work = (changedFiles, files, base) => ({
  changedFiles,
  read: (f) => files[f] ?? null,
  readBase: (f) => base[f] ?? null,
});

const siteFiles = (version, extra = {}) => ({
  [ORCHESTRATOR]: 'name: Release static site\n',
  [CONFIG]: config(),
  'package.json': pkg(version),
  ...extra,
});

const run = (changed, head, base = head) => rule.run(work(changed, siteFiles(head), { 'package.json': pkg(base) }));

// --- what counts as a published change ---------------------------------------

test('publish prefixes are resolved against publish_root, as the deploy resolves them', () => {
  const values = new Map([['publish_root', 'site'], ['publish_paths', 'index.html assets']]);
  assert.deepEqual(publishPrefixes(values), ['site/index.html', 'site/assets']);
});

test('a publish_root of "." leaves the paths repo-relative', () => {
  const values = new Map([['publish_root', '.'], ['publish_paths', 'index.html assets']]);
  assert.deepEqual(publishPrefixes(values), ['index.html', 'assets']);
});

test('a prefix matches the path itself and anything under it, never a sibling by name', () => {
  const prefixes = ['site/assets'];
  assert.deepEqual(touchesPublishSet(['site/assets'], prefixes), ['site/assets']);
  assert.deepEqual(touchesPublishSet(['site/assets/app.css'], prefixes), ['site/assets/app.css']);
  assert.deepEqual(touchesPublishSet(['site/assets-old/app.css'], prefixes), []);
});

// --- the invariant -----------------------------------------------------------

test('changing the published site without raising the version fires', () => {
  const findings = run(['site/index.html'], '1.60821.1');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'blocking');
  assert.equal(findings[0].file, 'package.json');
  assert.match(findings[0].what, /leaves the version at 1\.60821\.1/);
  assert.match(findings[0].what, /site\/index\.html/);
});

test('the finding counts the rest of the published files rather than listing them', () => {
  const findings = run(['site/index.html', 'site/assets/app.css'], '1.60821.1');
  assert.match(findings[0].what, /site\/index\.html, \+1 more/);
});

test('raising the version alongside the change is clean', () => {
  assert.deepEqual(run(['site/index.html'], '1.60821.2', '1.60821.1'), []);
});

test('a version that moves backwards fires, and says so', () => {
  const findings = run(['site/index.html'], '1.60820.1', '1.60821.1');
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /moves backwards, 1\.60821\.1 → 1\.60820\.1/);
});

test('a major bump is a raise, whatever the day part does', () => {
  assert.deepEqual(run(['site/index.html'], '2.60821.1', '1.60822.4'), []);
});

// --- what is deliberately free -----------------------------------------------

test('a change that publishes nothing needs no bump', () => {
  assert.deepEqual(run(['README.md', '.github/workflows/static-site-ci.yml', 'tools/build.mjs'], '1.60821.1'), []);
});

test('a repo that does not ship the pipeline is asked for nothing', () => {
  const files = siteFiles('1.60821.1');
  delete files[ORCHESTRATOR];
  const findings = rule.run(work(['site/index.html'], files, { 'package.json': pkg('1.60821.1') }));
  assert.deepEqual(findings, []);
});

test('an off-scheme version is sw/version-scheme\'s finding, never a second one here', () => {
  assert.deepEqual(run(['site/index.html'], '1.2.3'), []);
  assert.deepEqual(run(['site/index.html'], '1.60821.1', 'not-a-version'), []);
});

test('a version record this change introduces is not judged against a base that never existed', () => {
  const findings = rule.run(work(['site/index.html'], siteFiles('1.60821.1'), {}));
  assert.deepEqual(findings, []);
});

test('a missing site.config is sw/site-config\'s finding, never a second one here', () => {
  const files = siteFiles('1.60821.1');
  delete files[CONFIG];
  assert.deepEqual(rule.run(work(['site/index.html'], files, { 'package.json': pkg('1.60821.1') })), []);
});
