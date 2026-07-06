import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from './helpers.mjs';
import { buildContext } from '../lib/context.mjs';
import releaseWorkflows from '../../packs/chrome-extension/release-workflows.mjs';
import templateTokens from '../../packs/chrome-extension/template-tokens.mjs';
import versionSync from '../../packs/chrome-extension/version-sync.mjs';
import releaseLayout from '../../packs/chrome-extension/release-layout.mjs';
import permissionJustifications from '../../packs/chrome-extension/permission-justifications.mjs';
import readmeSections from '../../packs/chrome-extension/readme-sections.mjs';

const run = (rule, root) => rule.run(buildContext({ root, mode: 'all' }));

const MANIFEST = JSON.stringify({
  manifest_version: 3, name: 'x', version: '1.2.3',
  permissions: ['storage'], host_permissions: ['https://e.com/*'],
});

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
  'dev/build/release/releasing.md': 'x\n',
  'dev/build/release/store_artifacts/PRIVACY.md': 'x\n',
  'dev/build/release/store_artifacts/STORE-LISTING.md': 'justifies storage and https://e.com/*\n',
  'README.md': '# x\n\n## Install\n\nx\n\n## Releasing\n\nx\n',
};

test('a fully conformant extension repo is clean across the pack', () => {
  const root = makeRepo({ changed: CONFORMANT });
  try {
    for (const rule of [releaseWorkflows, templateTokens, versionSync, releaseLayout, permissionJustifications, readmeSections]) {
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

test('release-layout: flags each missing release-machinery file', () => {
  const files = { ...CONFORMANT };
  delete files['dev/build/release/store_artifacts/PRIVACY.md'];
  const root = makeRepo({ changed: files });
  try {
    const findings = run(releaseLayout, root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /PRIVACY\.md/);
  } finally { cleanup(root); }
});

test('permission-justifications: every manifest permission must appear in STORE-LISTING.md', () => {
  const files = {
    ...CONFORMANT,
    'extension/manifest.json': JSON.stringify({
      manifest_version: 3, name: 'x', version: '1.2.3',
      permissions: ['storage', 'tabs'],
    }),
  };
  const root = makeRepo({ changed: files });
  try {
    const findings = run(permissionJustifications, root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /tabs/);
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
