import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../checks/test/helpers.mjs';
import { buildContext } from '../../checks/lib/context.mjs';
import releasePack from './pack.mjs';
import releaseWorkflows from './release-workflows.mjs';
import templateTokens from './template-tokens.mjs';
import releaseConfig from './release-config.mjs';
import versionSync from './version-sync.mjs';
import releaseLayout from './release-layout.mjs';
import privacyPermissionAlignment from './privacy-permission-alignment.mjs';
import permissionAddedStoreIssue from './permission-added-store-issue.mjs';
import readmeSections from './readme-sections.mjs';

const run = (rule, root) => rule.run(buildContext({ root, mode: 'all' }));

const MANIFEST = JSON.stringify({
  manifest_version: 3, name: 'x', version: '1.2.3',
  permissions: ['storage'], host_permissions: ['https://e.com/*'],
});

// The privacy policy discloses every permission the manifest requests — the
// invariant cer/privacy-permission-alignment enforces.
const PRIVACY = 'We use storage to save settings locally, and connect to https://e.com/* to fetch data.\n';

// The ONE thin stub: named "Release to Chrome Store", scheduled at the contract
// cron, calling all three canon reusable workflows from its three if:-guarded
// jobs. Copied verbatim by every repo — no tokens.
const STUB = [
  'name: Release to Chrome Store',
  'on:',
  '  push:',
  '    branches: [main]',
  '  schedule:',
  '    - cron: "30 0 * * *"',
  '  workflow_dispatch:',
  '    inputs:',
  '      mode:',
  '        type: choice',
  '        options: [publish, package, daily]',
  '        default: publish',
  'permissions:',
  '  contents: write',
  '  pages: write',
  '  id-token: write',
  '  issues: write',
  'jobs:',
  '  create-package:',
  '    uses: missingbulb/Claudinite/.github/workflows/chrome-extension-release.yml@main',
  '  publish:',
  '    uses: missingbulb/Claudinite/.github/workflows/chrome-extension-publish-store.yml@main',
  '    secrets: inherit',
  '  daily:',
  '    uses: missingbulb/Claudinite/.github/workflows/chrome-extension-daily-release.yml@main',
  '    secrets: inherit',
  '',
].join('\n');

// The required, fully-explicit release config (five keys, no defaults; the zip
// location is forced-uniform structure, so it is derived, not a key).
const RELEASE_CONFIG = [
  'manifest_path=extension/manifest.json',
  'package_json_path=package.json',
  'setup_command=npm ci',
  'test_command=npm test',
  'ship_paths=extension',
  '',
].join('\n');

// The full conformant fixture; individual tests break one piece at a time.
const CONFORMANT = {
  'extension/manifest.json': MANIFEST,
  'package.json': JSON.stringify({ name: 'x', version: '1.2.3' }),
  '.github/workflows/chrome-extension-release.yml': STUB,
  '.github/release.config': RELEASE_CONFIG,
  'dev/build/release/store_artifacts/PRIVACY.md': PRIVACY,
  'README.md': '# x\n\n## Install\n\nx\n\n## Releasing\n\nx\n',
};

test('a fully conformant extension repo is clean across the pack', () => {
  const root = makeRepo({ base: CONFORMANT });
  try {
    for (const rule of [releaseWorkflows, templateTokens, releaseConfig, versionSync, releaseLayout, privacyPermissionAlignment, permissionAddedStoreIssue, readmeSections]) {
      assert.deepEqual(run(rule, root), [], `rule ${rule.id} should be clean`);
    }
  } finally { cleanup(root); }
});

test('release-workflows: flags a missing stub', () => {
  const files = { ...CONFORMANT };
  delete files['.github/workflows/chrome-extension-release.yml'];
  const root = makeRepo({ changed: files });
  try {
    const findings = run(releaseWorkflows, root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /chrome-extension-release\.yml is missing/);
  } finally { cleanup(root); }
});

test('release-workflows: flags a wrong name: and a canon workflow it does not call', () => {
  const files = { ...CONFORMANT };
  files['.github/workflows/chrome-extension-release.yml'] = STUB
    .replace('name: Release to Chrome Store', 'name: Wrong Name')
    .replace('    uses: missingbulb/Claudinite/.github/workflows/chrome-extension-publish-store.yml@main', '    steps:\n      - run: echo inlined');
  const root = makeRepo({ changed: files });
  try {
    const findings = run(releaseWorkflows, root);
    assert.equal(findings.length, 2);
    assert.ok(findings.some((f) => /Wrong Name/.test(f.what)));
    assert.ok(findings.some((f) => /does not call the canon reusable workflow chrome-extension-publish-store\.yml/.test(f.what)));
  } finally { cleanup(root); }
});

test('release-workflows: flags a stale schedule cron (the pre-rename 03:00 UTC)', () => {
  const files = { ...CONFORMANT };
  files['.github/workflows/chrome-extension-release.yml'] = STUB
    .replace('    - cron: "30 0 * * *"', '    - cron: "0 3 * * *"');
  const root = makeRepo({ changed: files });
  try {
    const findings = run(releaseWorkflows, root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /"0 3 \* \* \*".*requires "30 0 \* \* \*"/);
  } finally { cleanup(root); }
});

test('template-tokens: flags a surviving __TOKEN__', () => {
  const files = { ...CONFORMANT };
  files['.github/workflows/chrome-extension-release.yml'] = STUB.replace('name: Release to Chrome Store', 'name: Release to Chrome Store\nenv:\n  ZIP: __ZIP_NAME__');
  const root = makeRepo({ changed: files });
  try {
    const findings = run(templateTokens, root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /__ZIP_NAME__/);
  } finally { cleanup(root); }
});

test('release-config: the file is REQUIRED', () => {
  const files = { ...CONFORMANT };
  delete files['.github/release.config'];
  const root = makeRepo({ changed: files });
  try {
    const findings = run(releaseConfig, root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /missing/);
  } finally { cleanup(root); }
});

test('release-config: flags a missing required key, an unknown key, and a malformed line', () => {
  const files = {
    ...CONFORMANT,
    '.github/release.config': [
      'manifest_path=extension/manifest.json',
      'package_json_path=package.json',
      'setup_command=npm ci',
      'test_command=npm test',
      // ship_paths OMITTED -> missing required key
      'shpi_paths=extension',       // typo -> unknown key
      'this is not a config line',  // malformed
    ].join('\n') + '\n',
  };
  const root = makeRepo({ changed: files });
  try {
    const findings = run(releaseConfig, root);
    assert.ok(findings.some((f) => /unknown key "shpi_paths"/.test(f.what)));
    assert.ok(findings.some((f) => /not KEY=value/.test(f.what)));
    assert.ok(findings.some((f) => /missing required key "ship_paths"/.test(f.what)));
  } finally { cleanup(root); }
});

test('version-sync: flags manifest/package.json version divergence', () => {
  const files = { ...CONFORMANT, 'package.json': JSON.stringify({ name: 'x', version: '9.9.9' }) };
  const root = makeRepo({ changed: files });
  try {
    const findings = run(versionSync, root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /1\.2\.3.*9\.9\.9/);
  } finally { cleanup(root); }
});

test('release-layout: flags a missing PRIVACY.md', () => {
  const files = { ...CONFORMANT };
  delete files['dev/build/release/store_artifacts/PRIVACY.md'];
  const root = makeRepo({ changed: files });
  try {
    const findings = run(releaseLayout, root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /PRIVACY\.md/);
  } finally { cleanup(root); }
});

test('privacy-permission-alignment: every manifest permission must be disclosed in PRIVACY.md (test the world)', () => {
  const files = {
    ...CONFORMANT,
    'extension/manifest.json': JSON.stringify({
      manifest_version: 3, name: 'x', version: '1.2.3',
      permissions: ['storage', 'tabs'], host_permissions: ['https://e.com/*'],
    }),
  };
  const root = makeRepo({ base: files });
  try {
    const findings = run(privacyPermissionAlignment, root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.match(findings[0].what, /tabs/);
    assert.match(findings[0].file, /PRIVACY\.md/);
  } finally { cleanup(root); }
});

test('permission-added-store-issue: an added permission raises an advisory to open the dashboard issue (test the work)', () => {
  const manifest = (perms) => JSON.stringify({
    manifest_version: 3, name: 'x', version: '1.2.3',
    permissions: perms, host_permissions: ['https://e.com/*'],
  }, null, 2);
  const root = makeRepo({
    base: { ...CONFORMANT, 'extension/manifest.json': manifest(['storage']) },
    changed: { 'extension/manifest.json': manifest(['storage', 'tabs']) },
  });
  try {
    const findings = run(permissionAddedStoreIssue, root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'advisory');
    assert.match(findings[0].what, /adds the "tabs" permission/);
    assert.match(findings[0].fix, /Privacy-practices tab/);
  } finally { cleanup(root); }
});

test('permission-added-store-issue: silent when no permission was added', () => {
  const root = makeRepo({ base: CONFORMANT });
  try {
    assert.deepEqual(run(permissionAddedStoreIssue, root), []);
  } finally { cleanup(root); }
});

test('pack fingerprint: opt-in — a manifest alone does not trip detect; the single Release stub does', () => {
  const codingOnly = makeRepo({ base: { 'extension/manifest.json': MANIFEST } });
  const shipping = makeRepo({ base: CONFORMANT });
  try {
    assert.equal(releasePack.detect(buildContext({ root: codingOnly, mode: 'all' })), false);
    assert.equal(releasePack.detect(buildContext({ root: shipping, mode: 'all' })), true);
  } finally { cleanup(codingOnly); cleanup(shipping); }
});

test('pack fingerprint: a legacy "Release"-named stub still fingerprints as carrying the pack', () => {
  const files = { ...CONFORMANT };
  files['.github/workflows/chrome-extension-release.yml'] = STUB
    .replace('name: Release to Chrome Store', 'name: Release');
  const root = makeRepo({ base: files });
  try {
    assert.equal(releasePack.detect(buildContext({ root, mode: 'all' })), true);
    // ...while the conformance rule flags the stale name so the repo re-copies the stub.
    assert.ok(run(releaseWorkflows, root).some((f) => /name: is "Release"/.test(f.what)));
  } finally { cleanup(root); }
});

test('readme-sections: flags a README missing the Install or Releasing section', () => {
  const files = { ...CONFORMANT, 'README.md': '# x\n\n## Install\n\nx\n' };
  const root = makeRepo({ changed: files });
  try {
    const findings = run(readmeSections, root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /Releasing/);
  } finally { cleanup(root); }
});
