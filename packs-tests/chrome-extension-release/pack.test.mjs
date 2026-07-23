import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../engine/checks/helpers/work.mjs';
import releasePack from '../../packs/chrome-extension-release/pack.mjs';
import releaseWorkflows from '../../packs/chrome-extension-release/release-workflows.mjs';
import templateTokens from '../../packs/chrome-extension-release/template-tokens.mjs';
import releaseConfig from '../../packs/chrome-extension-release/release-config.mjs';
import versionSync from '../../packs/chrome-extension-release/version-sync.mjs';
import releaseLayout from '../../packs/chrome-extension-release/release-layout.mjs';
import privacyPermissionAlignment from '../../packs/chrome-extension-release/privacy-permission-alignment.mjs';
import permissionAddedStoreIssue from '../../packs/chrome-extension-release/permission-added-store-issue.mjs';
import readmeSections from '../../packs/chrome-extension-release/readme-sections.mjs';

const run = (rule, root, opts) => runRule(rule, buildContext({ root, mode: 'all' }), opts);

const MANIFEST = JSON.stringify({
  manifest_version: 3, name: 'x', version: '1.2.3',
  permissions: ['storage'], host_permissions: ['https://e.com/*'],
});

// The privacy policy discloses every permission the manifest requests — the
// invariant cer/privacy-permission-alignment enforces.
const PRIVACY = 'We use storage to save settings locally, and connect to https://e.com/* to fetch data.\n';

// The VENDORED orchestrator: named "Release to Chrome Store", scheduled at the
// contract cron, calling the three LOCAL reusable workflows this repo carries in
// its own .github/. No tokens, no cross-repo @main reference.
const ORCHESTRATOR = [
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
  '    uses: ./.github/workflows/chrome-extension-create-package.yml',
  '  publish:',
  '    uses: ./.github/workflows/chrome-extension-publish-store.yml',
  '    secrets: inherit',
  '  daily:',
  '    uses: ./.github/workflows/chrome-extension-daily-release.yml',
  '    secrets: inherit',
  '',
].join('\n');

// The pre-vendoring orchestrator: same triggers, but the three jobs call
// Claudinite's core reusable workflows @main. This is the legacy shape the
// chrome-release-vendoring migration tolerates while it rolls out.
const LEGACY_ORCHESTRATOR = ORCHESTRATOR
  .replace('./.github/workflows/chrome-extension-create-package.yml', 'missingbulb/Claudinite/.github/workflows/chrome-extension-release.yml@main')
  .replace('./.github/workflows/chrome-extension-publish-store.yml', 'missingbulb/Claudinite/.github/workflows/chrome-extension-publish-store.yml@main')
  .replace('./.github/workflows/chrome-extension-daily-release.yml', 'missingbulb/Claudinite/.github/workflows/chrome-extension-daily-release.yml@main');

// Minimal present-file placeholders — the check only needs the vendored reusable
// workflows + composite actions to EXIST (it doesn't parse their bodies).
const WF = (n) => `name: "${n}"\non:\n  workflow_call:\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: 'true'\n`;
const ACT = (n) => `name: ${n}\nruns:\n  using: composite\n  steps: []\n`;

// The full vendored .github/ set the pack keeps in each consumer.
const VENDORED = {
  '.github/workflows/chrome-extension-release.yml': ORCHESTRATOR,
  '.github/workflows/chrome-extension-create-package.yml': WF('Chrome extension: Create Package (reusable)'),
  '.github/workflows/chrome-extension-publish-store.yml': WF('Chrome extension: Publish to Chrome Web Store (reusable)'),
  '.github/workflows/chrome-extension-daily-release.yml': WF('Chrome extension: Daily Auto-Release (reusable)'),
  '.github/workflows/deploy-privacy-page.yml': WF('Deploy privacy policy to GitHub Pages (reusable)'),
  '.github/actions/read-release-config/action.yml': ACT('Read release config'),
  '.github/actions/bump-extension-patch/action.yml': ACT('Bump extension patch version'),
  '.github/actions/report-failure/action.yml': ACT('Report workflow failure'),
};

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
  ...VENDORED,
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

test('release-workflows: flags a missing orchestrator', () => {
  const files = { ...CONFORMANT };
  delete files['.github/workflows/chrome-extension-release.yml'];
  const root = makeRepo({ changed: files });
  try {
    const findings = run(releaseWorkflows, root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /chrome-extension-release\.yml is missing/);
  } finally { cleanup(root); }
});

test('release-workflows: flags a wrong name: and a local reusable it does not call', () => {
  const files = { ...CONFORMANT };
  files['.github/workflows/chrome-extension-release.yml'] = ORCHESTRATOR
    .replace('name: Release to Chrome Store', 'name: Wrong Name')
    .replace('    uses: ./.github/workflows/chrome-extension-publish-store.yml', '    steps:\n      - run: echo inlined');
  const root = makeRepo({ changed: files });
  try {
    const findings = run(releaseWorkflows, root);
    assert.equal(findings.length, 2);
    assert.ok(findings.some((f) => /Wrong Name/.test(f.what)));
    assert.ok(findings.some((f) => /does not call the local reusable workflow \.\/\.github\/workflows\/chrome-extension-publish-store\.yml/.test(f.what)));
  } finally { cleanup(root); }
});

test('release-workflows: flags a missing vendored reusable workflow and composite action', () => {
  const files = { ...CONFORMANT };
  delete files['.github/workflows/deploy-privacy-page.yml'];
  delete files['.github/actions/report-failure/action.yml'];
  const root = makeRepo({ changed: files });
  try {
    const findings = run(releaseWorkflows, root);
    assert.ok(findings.some((f) => /vendored reusable workflow deploy-privacy-page\.yml is missing/.test(f.what)));
    assert.ok(findings.some((f) => /vendored composite action report-failure is missing/.test(f.what)));
  } finally { cleanup(root); }
});

test('release-workflows: flags a stale schedule cron (the pre-rename 03:00 UTC)', () => {
  const files = { ...CONFORMANT };
  files['.github/workflows/chrome-extension-release.yml'] = ORCHESTRATOR
    .replace('    - cron: "30 0 * * *"', '    - cron: "0 3 * * *"');
  const root = makeRepo({ changed: files });
  try {
    const findings = run(releaseWorkflows, root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /"0 3 \* \* \*".*requires "30 0 \* \* \*"/);
  } finally { cleanup(root); }
});

test('release-workflows: once the scheduler is present, the orchestrator cron flips from required to forbidden', () => {
  const SCHEDULER = '.github/workflows/claudinite-scheduler.yml';
  const schedulerYml =
`name: Claudinite scheduler
on:
  schedule:
    - cron: '24 * * * *'
  workflow_dispatch:
jobs:
  schedule:
    runs-on: ubuntu-latest
    steps:
      - run: node .claudinite/shared/engine/scheduler/run.mjs
`;
  // De-cron'd orchestrator: keeps push + workflow_dispatch, drops the schedule block.
  const deCronOrchestrator = ORCHESTRATOR.replace('  schedule:\n    - cron: "30 0 * * *"\n', '');

  // Cut over but the orchestrator still carries the contract cron → flagged.
  const cutOverStillCron = makeRepo({ changed: { ...CONFORMANT, [SCHEDULER]: schedulerYml } });
  // Cut over and de-cron'd → clean.
  const cutOverDeCron = makeRepo({ changed: {
    ...CONFORMANT,
    [SCHEDULER]: schedulerYml,
    '.github/workflows/chrome-extension-release.yml': deCronOrchestrator,
  } });
  try {
    const stillCron = run(releaseWorkflows, cutOverStillCron);
    assert.equal(stillCron.length, 1);
    assert.match(stillCron[0].what, /has a schedule cron "30 0 \* \* \*".*must be dispatch-only/);
    assert.deepEqual(run(releaseWorkflows, cutOverDeCron), []);
  } finally { cleanup(cutOverStillCron); cleanup(cutOverDeCron); }
});

test('release-workflows: the pre-vendoring @main shape is tolerated while the migration is live, flagged once it retires', () => {
  const files = { ...CONFORMANT, '.github/workflows/chrome-extension-release.yml': LEGACY_ORCHESTRATOR };
  // A legacy repo need not carry the vendored reusables yet.
  for (const p of Object.keys(VENDORED)) if (p !== '.github/workflows/chrome-extension-release.yml') delete files[p];
  const root = makeRepo({ changed: files });
  try {
    // In flight: baselining will vendor it — tolerated, no red window.
    assert.deepEqual(run(releaseWorkflows, root, { tolerateLegacy: true }), []);
    // Retired: the canon workflows are gone, so a repo still on @main is flagged.
    const flagged = run(releaseWorkflows, root, { tolerateLegacy: false });
    assert.equal(flagged.length, 1);
    assert.match(flagged[0].what, /still calls Claudinite's core release workflows @main/);
  } finally { cleanup(root); }
});

test('template-tokens: flags a surviving __TOKEN__', () => {
  const files = { ...CONFORMANT };
  files['.github/workflows/chrome-extension-release.yml'] = ORCHESTRATOR.replace('name: Release to Chrome Store', 'name: Release to Chrome Store\nenv:\n  ZIP: __ZIP_NAME__');
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

test('pack fingerprint: opt-in — a manifest alone does not trip detect; the vendored orchestrator does', () => {
  const codingOnly = makeRepo({ base: { 'extension/manifest.json': MANIFEST } });
  const shipping = makeRepo({ base: CONFORMANT });
  try {
    assert.equal(releasePack.detect(buildContext({ root: codingOnly, mode: 'all' })), false);
    assert.equal(releasePack.detect(buildContext({ root: shipping, mode: 'all' })), true);
  } finally { cleanup(codingOnly); cleanup(shipping); }
});

test('pack fingerprint: the pre-vendoring @main orchestrator still fingerprints as carrying the pack', () => {
  const files = { ...CONFORMANT, '.github/workflows/chrome-extension-release.yml': LEGACY_ORCHESTRATOR };
  const root = makeRepo({ base: files });
  try {
    assert.equal(releasePack.detect(buildContext({ root, mode: 'all' })), true);
  } finally { cleanup(root); }
});

test('pack fingerprint: a legacy "Release"-named orchestrator still fingerprints; the rule flags the stale name', () => {
  const files = { ...CONFORMANT };
  files['.github/workflows/chrome-extension-release.yml'] = ORCHESTRATOR
    .replace('name: Release to Chrome Store', 'name: Release');
  const root = makeRepo({ base: files });
  try {
    assert.equal(releasePack.detect(buildContext({ root, mode: 'all' })), true);
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
