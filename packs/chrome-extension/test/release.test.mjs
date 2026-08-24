import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup, declaredCheck } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRule } from '../../../engine/checks/helpers/work.mjs';
import pack from '../pack.mjs';
import releaseWorkflows, { shipsReleasePipeline, SHIPS_PIPELINE_PATH_RE, SHIPS_PIPELINE_TEXT_RE } from '../worldRules/release-workflows.mjs';

const templateTokens = declaredCheck('packs/chrome-extension', 'cer/template-tokens');
const releaseConfig = declaredCheck('packs/chrome-extension', 'cer/release-config');
const versionSync = declaredCheck('packs/chrome-extension', 'cer/version-sync');
const releaseLayout = declaredCheck('packs/chrome-extension', 'cer/release-layout');
const readmeSections = declaredCheck('packs/chrome-extension', 'cer/readme-sections');
const privacyPermissionAlignment = declaredCheck('packs/chrome-extension', 'cer/privacy-permission-alignment');
const permissionAddedStoreIssue = declaredCheck('packs/chrome-extension', 'cer/permission-added-store-issue');

const repoRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

const run = (rule, root, opts) => runRule(rule, buildContext({ root, mode: 'all' }), opts);

const MANIFEST = JSON.stringify({
  manifest_version: 3, name: 'x', version: '1.2.3',
  permissions: ['storage'], host_permissions: ['https://e.com/*'],
});

// The privacy policy discloses every permission the manifest requests — the
// invariant cer/privacy-permission-alignment enforces.
const PRIVACY = 'We use storage to save settings locally, and connect to https://e.com/* to fetch data.\n';

// The VENDORED orchestrator: named "Release to Chrome Store", scheduled at the
// contract cron, calling the four LOCAL reusable workflows this repo carries in
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
  '        options: [publish, package, daily, bump]',
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
  '  bump:',
  '    uses: ./.github/workflows/chrome-extension-bump-version.yml',
  '',
].join('\n');

// The pre-vendoring orchestrator: same triggers, but the release jobs call
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
  '.github/workflows/chrome-extension-bump-version.yml': WF('Chrome extension: Bump version (reusable)'),
  '.github/workflows/deploy-privacy-page.yml': WF('Deploy privacy policy to GitHub Pages (reusable)'),
  '.github/actions/read-release-config/action.yml': ACT('Read release config'),
  '.github/actions/bump-extension-patch/action.yml': ACT('Bump extension version'),
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

// Every rule the release half contributes — the coded one and the seven declared.
const RELEASE_RULES = [releaseWorkflows, templateTokens, releaseConfig, versionSync,
  releaseLayout, privacyPermissionAlignment, permissionAddedStoreIssue, readmeSections];

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
    for (const rule of RELEASE_RULES) {
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
      - run: node .claudinite/shared/engine/scheduler/queue/scheduler-run.mjs
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

test('shipping gate: a repo that only codes an extension carries the pack and none of its release rules', () => {
  // The pack's fingerprint is the manifest, so it is active here; what must stay
  // silent is the release half, which asks for a config, a privacy page and README
  // sections this repo has no reason to have (#1057).
  const codingOnly = makeRepo({ base: { 'extension/manifest.json': MANIFEST } });
  try {
    assert.equal(pack.detect(buildContext({ root: codingOnly, mode: 'all' })), true, 'the pack itself is active');
    assert.equal(shipsReleasePipeline(buildContext({ root: codingOnly, mode: 'all' })), false);
    for (const rule of RELEASE_RULES) {
      assert.deepEqual(run(rule, codingOnly), [], `rule ${rule.id} must be inert on a repo that does not publish`);
    }
  } finally { cleanup(codingOnly); }
});

test('shipping gate: the pre-vendoring @main orchestrator still reads as shipping', () => {
  const files = { ...CONFORMANT, '.github/workflows/chrome-extension-release.yml': LEGACY_ORCHESTRATOR };
  const root = makeRepo({ base: files });
  try {
    assert.equal(shipsReleasePipeline(buildContext({ root, mode: 'all' })), true);
  } finally { cleanup(root); }
});

test('shipping gate: a legacy "Release"-named orchestrator still ships; the rule flags the stale name', () => {
  const files = { ...CONFORMANT };
  files['.github/workflows/chrome-extension-release.yml'] = ORCHESTRATOR
    .replace('name: Release to Chrome Store', 'name: Release');
  const root = makeRepo({ base: files });
  try {
    assert.equal(shipsReleasePipeline(buildContext({ root, mode: 'all' })), true);
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

// The four store-reviewed permission keys are spelled twice in this pack's
// declarations — the privacy check quantifies over their values, the
// permission-added check watches the same arrays for growth — and a declaration
// borrows nothing, so the drift guard lives here rather than in a shared module.
test('the permission-alignment and permission-added declarations watch the same manifest keys', () => {
  const specs = JSON.parse(readFileSync(join(repoRoot, 'packs/chrome-extension/declared-checks.json'), 'utf8'));
  const byId = (id) => specs.find((s) => s.id === id);
  assert.deepEqual(
    byId('cer/permission-added-store-issue').forbidAddedValueInArray[0].atFields,
    byId('cer/privacy-permission-alignment').extractValueSets[0].valuesOfArraysAtFields);
});

// --- the shipping gate has three copies, and they must agree (#1057) ---------
// The gate is spelled three times because three layers ask it and none of them can
// import the others: the coded rule (release-workflows.mjs), the seven declared
// checks (declared-checks.json, which cannot import at all), and the scheduler's
// `release` signal (engine/scheduler/signals/local.mjs, which may not import a pack
// — the engine depends on no pack). One drifting copy is silent in the worst way:
// the checks and the task would disagree about whether a repo publishes.
test('shipping gate: the declared checks carry the same test as the coded predicate', () => {
  const specs = JSON.parse(readFileSync(join(repoRoot, 'packs/chrome-extension/declared-checks.json'), 'utf8'));
  const cer = specs.filter((s) => s.id.startsWith('cer/'));
  assert.equal(cer.length, specs.length, 'every declared check here is a release check');
  for (const spec of cer) {
    const gate = spec.relevantWhen?.someTrackedFileContains;
    assert.ok(gate, `${spec.id} must be gated on the repo shipping`);
    assert.equal(gate.pathMatching, `/${SHIPS_PIPELINE_PATH_RE.source}/`, `${spec.id} path gate`);
    assert.equal(gate.text, `/${SHIPS_PIPELINE_TEXT_RE.source}/m`, `${spec.id} text gate`);
  }
});

test('shipping gate: the scheduler signal answers what the pack rules answer', async () => {
  const { localSignalContext } = await import('../../claudinite-tasks/shared-code/signals.mjs');
  // One matrix, both readers. Each row is a repo shape that has actually mattered:
  // a publisher, a publisher known only by its release config, the canon's own copies
  // of the reusable workflows, and a repo that just codes an extension.
  const SHAPES = [
    ['a publisher', { ...CONFORMANT }, true],
    ['a publisher whose orchestrator was renamed away', (() => {
      const f = { ...CONFORMANT };
      f['.github/workflows/chrome-extension-release.yml'] = ORCHESTRATOR.replace('name: Release to Chrome Store', 'name: Ship It');
      return f;
    })(), true],
    ['the canon, hosting the reusables it does not publish from', {
      '.github/workflows/chrome-extension-publish-store.yml': WF('Chrome extension: Publish to Chrome Web Store (reusable)'),
      '.github/workflows/chrome-extension-daily-release.yml': WF('Chrome extension: Daily Auto-Release (reusable)'),
  '.github/workflows/chrome-extension-bump-version.yml': WF('Chrome extension: Bump version (reusable)'),
    }, false],
    ['a repo that only codes an extension', { 'extension/manifest.json': MANIFEST }, false],
  ];
  for (const [why, files, expected] of SHAPES) {
    const root = makeRepo({ base: files });
    try {
      assert.equal(shipsReleasePipeline(buildContext({ root, mode: 'all' })), expected, `pack rules: ${why}`);
      assert.equal(localSignalContext(root).shipsReleasePipeline, expected, `scheduler signal: ${why}`);
    } finally { cleanup(root); }
  }
});
