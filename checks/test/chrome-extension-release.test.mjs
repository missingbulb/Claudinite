import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from './helpers.mjs';
import { buildContext } from '../lib/context.mjs';
import releasePack from '../../packs/chrome-extension-release/pack.mjs';
import releaseWorkflows from '../../packs/chrome-extension-release/release-workflows.mjs';
import templateTokens from '../../packs/chrome-extension-release/template-tokens.mjs';
import versionSync from '../../packs/chrome-extension-release/version-sync.mjs';
import releaseLayout from '../../packs/chrome-extension-release/release-layout.mjs';
import privacyPermissionAlignment from '../../packs/chrome-extension-release/privacy-permission-alignment.mjs';
import permissionAddedStoreIssue from '../../packs/chrome-extension-release/permission-added-store-issue.mjs';
import readmeSections from '../../packs/chrome-extension-release/readme-sections.mjs';

const run = (rule, root) => rule.run(buildContext({ root, mode: 'all' }));

const MANIFEST = JSON.stringify({
  manifest_version: 3, name: 'x', version: '1.2.3',
  permissions: ['storage'], host_permissions: ['https://e.com/*'],
});

// The privacy policy discloses every permission the manifest requests — the
// invariant cer/privacy-permission-alignment enforces.
const PRIVACY = 'We use storage to save settings locally, and connect to https://e.com/* to fetch data.\n';

const stub = (name, canon) =>
  `name: "${name}"\non: push\njobs:\n  run:\n    uses: missingbulb/Claudinite/.github/workflows/${canon}@main\n    secrets: inherit\n`;

// The full conformant fixture; individual tests break one piece at a time.
const CONFORMANT = {
  'extension/manifest.json': MANIFEST,
  'package.json': JSON.stringify({ name: 'x', version: '1.2.3' }),
  '.github/workflows/release.yml': stub('Release: Create Package', 'chrome-extension-release.yml'),
  '.github/workflows/publish-chrome-store.yml': stub('Release: Publish to Chrome Web Store', 'chrome-extension-publish-store.yml'),
  '.github/workflows/daily-release.yml': stub('Release: Daily Auto-Release', 'chrome-extension-daily-release.yml'),
  '.github/workflows/deploy-privacy-page.yml': stub('Deploy privacy policy to GitHub Pages', 'deploy-privacy-page.yml'),
  'dev/build/release/store_artifacts/PRIVACY.md': PRIVACY,
  'README.md': '# x\n\n## Install\n\nx\n\n## Releasing\n\nx\n',
};

test('a fully conformant extension repo is clean across the pack', () => {
  // Committed on main (base): the manifest is already shipped, so the
  // permission-added delta check sees no additions.
  const root = makeRepo({ base: CONFORMANT });
  try {
    for (const rule of [releaseWorkflows, templateTokens, versionSync, releaseLayout, privacyPermissionAlignment, permissionAddedStoreIssue, readmeSections]) {
      assert.deepEqual(run(rule, root), [], `rule ${rule.id} should be clean`);
    }
  } finally { cleanup(root); }
});

test('release-workflows: flags a missing stub, a wrong name:, and a stub not calling its canon workflow', () => {
  const files = { ...CONFORMANT };
  delete files['.github/workflows/daily-release.yml'];
  files['.github/workflows/release.yml'] =
    files['.github/workflows/release.yml'].replace('Release: Create Package', 'Wrong Name');
  files['.github/workflows/publish-chrome-store.yml'] =
    'name: "Release: Publish to Chrome Web Store"\non: push\njobs:\n  run:\n    steps:\n      - run: echo inlined logic\n';
  const root = makeRepo({ changed: files });
  try {
    const findings = run(releaseWorkflows, root);
    assert.equal(findings.length, 3);
    assert.ok(findings.some((f) => /daily-release\.yml is missing/.test(f.what)));
    assert.ok(findings.some((f) => /Wrong Name/.test(f.what)));
    assert.ok(findings.some((f) => /does not call the canon/.test(f.what)));
  } finally { cleanup(root); }
});

test('template-tokens: flags a surviving __TOKEN__', () => {
  const files = { ...CONFORMANT };
  files['.github/workflows/release.yml'] = 'name: "Release: Create Package"\non: push\nenv:\n  ZIP: __ZIP_NAME__\n';
  const root = makeRepo({ changed: files });
  try {
    const findings = run(templateTokens, root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /__ZIP_NAME__/);
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
  // Pretty-printed so only the new permission is an added line in the diff.
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
  // The manifest already shipped on main; this change adds none.
  const root = makeRepo({ base: CONFORMANT });
  try {
    assert.deepEqual(run(permissionAddedStoreIssue, root), []);
  } finally { cleanup(root); }
});

test('pack fingerprint: opt-in — a manifest alone does not trip detect; the Release: * stubs do', () => {
  const codingOnly = makeRepo({ base: { 'extension/manifest.json': MANIFEST } });
  const shipping = makeRepo({ base: CONFORMANT });
  try {
    assert.equal(releasePack.detect(buildContext({ root: codingOnly, mode: 'all' })), false);
    assert.equal(releasePack.detect(buildContext({ root: shipping, mode: 'all' })), true);
  } finally { cleanup(codingOnly); cleanup(shipping); }
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
