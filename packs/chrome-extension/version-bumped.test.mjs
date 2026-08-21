import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule, { shipPaths, touchesShippedFiles } from '../../packs/chrome-extension/version-bumped.mjs';

const ORCHESTRATOR = '.github/workflows/chrome-extension-release.yml';
const CONFIG = '.github/release.config';

const RELEASE_CONFIG = [
  'manifest_path=extension/manifest.json',
  'package_json_path=package.json',
  'setup_command=npm ci',
  'test_command=npm test',
  'ship_paths=extension',
  '',
].join('\n');

const manifest = (version) => `{\n  "manifest_version": 3,\n  "version": "${version}"\n}\n`;

// The work context a work rule receives — only the members this rule reads.
const work = (changedFiles, files, base) => ({
  changedFiles,
  tracked: Object.keys(files),
  read: (f) => files[f] ?? null,
  readBase: (f) => base[f] ?? null,
});

const repoFiles = (version, extra = {}) => ({
  [ORCHESTRATOR]: 'name: Release to Chrome Store\n',
  [CONFIG]: RELEASE_CONFIG,
  'extension/manifest.json': manifest(version),
  ...extra,
});

const run = (changed, head, base = head) =>
  rule.run(work(changed, repoFiles(head), { 'extension/manifest.json': manifest(base) }));

// --- what counts as a shipped change -----------------------------------------

test('ship_paths is the release config\'s own declaration, space-separated', () => {
  assert.deepEqual(shipPaths({ ship_paths: 'extension  tools/x.js' }), ['extension', 'tools/x.js']);
  assert.deepEqual(shipPaths({}), []);
});

test('a root matches the path itself and anything under it, never a sibling by name', () => {
  const roots = ['extension'];
  assert.deepEqual(touchesShippedFiles(['extension'], roots), ['extension']);
  assert.deepEqual(touchesShippedFiles(['extension/popup.js'], roots), ['extension/popup.js']);
  assert.deepEqual(touchesShippedFiles(['extension-docs/readme.md'], roots), []);
});

// --- the invariant -----------------------------------------------------------

test('changing a shipped file without raising the version fires', () => {
  const findings = run(['extension/popup.js'], '1.2.3');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'blocking');
  assert.equal(findings[0].file, 'extension/manifest.json');
  assert.match(findings[0].what, /leaves the version at 1\.2\.3/);
  assert.match(findings[0].what, /extension\/popup\.js/);
  // The remedy names the patch the change should have taken.
  assert.match(findings[0].fix, /raise it to 1\.2\.4/);
});

test('the finding counts the rest of the shipped files rather than listing them', () => {
  const findings = run(['extension/popup.js', 'extension/manifest.json'], '1.2.3');
  assert.match(findings[0].what, /extension\/popup\.js, \+1 more/);
});

test('raising the version alongside the change is clean, whichever part moved', () => {
  assert.deepEqual(run(['extension/popup.js'], '1.2.4', '1.2.3'), []);
  assert.deepEqual(run(['extension/popup.js'], '1.3.0', '1.2.9'), []);
  assert.deepEqual(run(['extension/popup.js'], '2.0.0', '1.9.9'), []);
});

test('a version that moves backwards fires, and says so', () => {
  const findings = run(['extension/popup.js'], '1.2.2', '1.2.3');
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /moves backwards, 1\.2\.3 → 1\.2\.2/);
});

// --- what is deliberately free -----------------------------------------------

test('a change that ships nothing needs no bump', () => {
  assert.deepEqual(run(['README.md', 'tests/popup.test.mjs', '.github/release.config'], '1.2.3'), []);
});

test('a repo that does not ship the pipeline is asked for nothing', () => {
  const files = repoFiles('1.2.3');
  delete files[ORCHESTRATOR];
  delete files[CONFIG];
  assert.deepEqual(rule.run(work(['extension/popup.js'], files, { 'extension/manifest.json': manifest('1.2.3') })), []);
});

test('an off-scheme version is cer/version-sync\'s finding, never a second one here', () => {
  assert.deepEqual(run(['extension/popup.js'], '1.2'), []);
  assert.deepEqual(run(['extension/popup.js'], '1.2.3', 'nope'), []);
});

test('a manifest this change introduces is not judged against a base that never existed', () => {
  assert.deepEqual(rule.run(work(['extension/popup.js'], repoFiles('1.2.3'), {})), []);
});

test('a missing release config is cer/release-config\'s finding, never a second one here', () => {
  const files = repoFiles('1.2.3');
  delete files[CONFIG];
  assert.deepEqual(rule.run(work(['extension/popup.js'], files, { 'extension/manifest.json': manifest('1.2.3') })), []);
});
