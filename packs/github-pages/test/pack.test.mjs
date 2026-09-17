import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import pack from '../pack.mjs';
import pagesWorkflows, { CALLED_ACTIONS, VENDORED_WORKFLOWS } from '../worldRules/pages-workflows.mjs';

const run = (rule, root) => rule.run(buildContext({ root, mode: 'all' }));

const ORCHESTRATOR = [
  'name: Release to GitHub Pages',
  'on:',
  '  push:',
  '    branches: [main]',
  '  workflow_dispatch:',
  'jobs:',
  '  release:',
  '    uses: ./.github/workflows/github-pages-publish.yml',
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

// A repo carrying the whole vendored Pages pipeline, plus the static-website
// half it requires — the shape this pack's rule is quiet on.
function pagesRepo(overrides = {}) {
  const files = {
    '.github/workflows/github-pages-release.yml': ORCHESTRATOR,
    '.github/site.config': CONFIG,
    'index.html': '<!doctype html><title>site</title>\n',
    'package.json': '{\n  "version": "1.60704.1"\n}\n',
  };
  for (const wf of VENDORED_WORKFLOWS) files[`.github/workflows/${wf}`] = `name: reusable ${wf}\n`;
  for (const a of CALLED_ACTIONS) files[`.github/actions/${a}/action.yml`] = `name: ${a}\n`;
  return makeRepo({ base: { ...files, ...overrides } });
}

test('github-pages: the pack fingerprints a repo carrying the orchestrator, and only that', () => {
  const root = pagesRepo();
  try {
    assert.equal(pack.detect(buildContext({ root, mode: 'all' })), true);
  } finally { cleanup(root); }

  // Same file, a different workflow's name — not this standard's orchestrator.
  const other = pagesRepo({ '.github/workflows/github-pages-release.yml': 'name: Something else\non:\n  push:\n' });
  try {
    assert.equal(pack.detect(buildContext({ root: other, mode: 'all' })), false);
  } finally { cleanup(other); }
});

test('gp/pages-workflows: clean on the fully vendored pipeline', () => {
  const root = pagesRepo();
  try {
    assert.deepEqual(run(pagesWorkflows, root), []);
  } finally { cleanup(root); }
});

test('gp/pages-workflows: names every missing leg of the pipeline', () => {
  const root = makeRepo({ base: { '.github/workflows/github-pages-release.yml': ORCHESTRATOR } });
  try {
    const findings = run(pagesWorkflows, root);
    const files = findings.map((f) => f.file);
    assert.equal(files.length, VENDORED_WORKFLOWS.length + CALLED_ACTIONS.length,
      `expected one finding per missing leg, got: ${files.join(', ')}`);
    for (const wf of VENDORED_WORKFLOWS) assert.ok(files.includes(`.github/workflows/${wf}`), `expected a finding for ${wf}`);
    for (const a of CALLED_ACTIONS) assert.ok(files.includes(`.github/actions/${a}/action.yml`), `expected a finding for ${a}`);
    assert.ok(findings.every((f) => f.severity === 'blocking'));
  } finally { cleanup(root); }
});

test('gp/pages-workflows: a missing composite action points at the pack that owns it', () => {
  const files = {
    '.github/workflows/github-pages-release.yml': ORCHESTRATOR,
    '.github/site.config': CONFIG,
  };
  for (const wf of VENDORED_WORKFLOWS) files[`.github/workflows/${wf}`] = `name: reusable ${wf}\n`;
  for (const a of CALLED_ACTIONS.filter((n) => n !== 'assemble-site')) {
    files[`.github/actions/${a}/action.yml`] = `name: ${a}\n`;
  }
  const root = makeRepo({ base: files });
  try {
    const [finding] = run(pagesWorkflows, root).filter((f) => f.file.includes('assemble-site'));
    // The actions ship with static-website, which this pack requires — the fix
    // has to send the reader there rather than to a stub this pack does not hold.
    assert.match(finding.fix, /static-website/);
  } finally { cleanup(root); }
});

test('gp/pages-workflows: an orchestrator that lost its push trigger or its call is flagged', () => {
  const root = pagesRepo({
    '.github/workflows/github-pages-release.yml': 'name: Release to GitHub Pages\non:\n  workflow_dispatch:\njobs:\n  release:\n    runs-on: ubuntu-latest\n',
  });
  try {
    const what = run(pagesWorkflows, root).map((f) => f.what).join('\n');
    assert.match(what, /does not call the local/);
    assert.match(what, /no push: trigger/);
  } finally { cleanup(root); }
});

test('gp/pages-workflows: inert on a repo that does not serve from Pages (FP guard)', () => {
  // A site that deploys somewhere else declares static-website alone and carries
  // no orchestrator — nothing here to say, including about its site.config.
  const root = makeRepo({
    base: {
      'index.html': '<!doctype html>\n',
      '.github/site.config': CONFIG,
      '.github/workflows/deploy.yml': 'name: Deploy elsewhere\n',
    },
  });
  try {
    assert.deepEqual(run(pagesWorkflows, root), []);
  } finally { cleanup(root); }
});

// --- build_vars: the drift guard that makes declaring it safe on a repo whose
// vendored deploy workflow is older than the feature.

test('gp/pages-workflows: declaring build_vars on a pre-exporter deploy workflow is blocking', () => {
  const root = pagesRepo({ '.github/site.config': `${CONFIG}build_vars=SITE_TOKEN\n` });
  try {
    const files = run(pagesWorkflows, root).map((f) => f.file);
    assert.deepEqual(files, ['.github/workflows/github-pages-deploy.yml']);
  } finally { cleanup(root); }
});

test('gp/pages-workflows: a deploy workflow that honours build_vars is clean', () => {
  const root = pagesRepo({
    '.github/site.config': `${CONFIG}build_vars=SITE_TOKEN\n`,
    '.github/workflows/github-pages-deploy.yml': 'name: deploy\nrun: node .github/actions/read-site-config/export-build-vars.mjs\n',
  });
  try {
    assert.deepEqual(run(pagesWorkflows, root), []);
  } finally { cleanup(root); }
});

test('gp/pages-workflows: a repo that declares no build_vars is untouched by the exporter (FP guard)', () => {
  // The five-key config is the majority shape; the exporter's arrival must not
  // start firing on every repo that never asked for a build variable.
  const root = pagesRepo();
  try {
    assert.deepEqual(run(pagesWorkflows, root), []);
  } finally { cleanup(root); }
});
