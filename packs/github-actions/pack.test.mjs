import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../checks/test/helpers.mjs';
import { buildContext } from '../../checks/lib/context.mjs';
import secretsInJobIf from './secrets-in-job-if.mjs';
import runPipefail from './run-pipefail.mjs';
import checkoutSubmodules from './checkout-submodules.mjs';
import scheduledEscalation from './scheduled-failure-escalation.mjs';
import labelCreate from './label-create-before-add.mjs';
import uniqueBranch from './unique-automation-branch.mjs';
import pagesArtifactSymlinks from './pages-artifact-symlinks.mjs';
import noScheduledFleetExecutor from './no-scheduled-fleet-executor.mjs';

const run = (rule, root) => rule.run(buildContext({ root, mode: 'all' }));
const WF = '.github/workflows/x.yml';

test('secrets-in-job-if: flags a job-level if using secrets, not a step-level one', () => {
  const bad = makeRepo({ changed: { [WF]:
`name: x
on: push
jobs:
  deploy:
    if: \${{ secrets.DEPLOY_ARN != '' }}
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
` } });
  const good = makeRepo({ changed: { [WF]:
`name: x
on: push
jobs:
  deploy:
    if: \${{ vars.DEPLOY_ARN != '' }}
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
        if: \${{ secrets.TOKEN != '' }}
` } });
  try {
    const findings = run(secretsInJobIf, bad);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].line, 5);
    assert.equal(run(secretsInJobIf, good).length, 0);
  } finally { cleanup(bad); cleanup(good); }
});

test('run-pipefail: flags a piped run step without a bash shell default; || is not a pipe', () => {
  const bad = makeRepo({ changed: { [WF]:
`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: make test 2>&1 | tee log
` } });
  const good = makeRepo({ changed: { [WF]:
`name: x
on: push
defaults:
  run:
    shell: bash
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: make test 2>&1 | tee log
      - run: try || fallback
` } });
  const orOnly = makeRepo({ changed: { [WF]:
`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: try || fallback
` } });
  try {
    assert.equal(run(runPipefail, bad).length, 1);
    assert.equal(run(runPipefail, good).length, 0);
    assert.equal(run(runPipefail, orOnly).length, 0);
  } finally { cleanup(bad); cleanup(good); cleanup(orOnly); }
});

test('checkout-submodules: repo with .gitmodules needs submodules on every checkout', () => {
  const gitmodules = '[submodule "x"]\n\tpath = x\n\turl = https://e.com/x.git\n';
  const bad = makeRepo({ changed: { '.gitmodules': gitmodules, [WF]:
`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo hi
` } });
  const good = makeRepo({ changed: { '.gitmodules': gitmodules, [WF]:
`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true
` } });
  const noSubmodules = makeRepo({ changed: { [WF]:
`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
` } });
  try {
    assert.equal(run(checkoutSubmodules, bad).length, 1);
    assert.equal(run(checkoutSubmodules, good).length, 0);
    assert.equal(run(checkoutSubmodules, noSubmodules).length, 0);
  } finally { cleanup(bad); cleanup(good); cleanup(noSubmodules); }
});

test('scheduled-failure-escalation: a scheduled workflow must escalate its own failure', () => {
  const bad = makeRepo({ changed: { [WF]:
`name: nightly
on:
  schedule:
    - cron: '0 3 * * *'
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
` } });
  const good = makeRepo({ changed: { [WF]:
`name: nightly
on:
  schedule:
    - cron: '0 3 * * *'
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
  report:
    if: \${{ failure() }}
    runs-on: ubuntu-latest
    steps:
      - run: echo escalate
` } });
  try {
    assert.equal(run(scheduledEscalation, bad).length, 1);
    assert.equal(run(scheduledEscalation, good).length, 0);
  } finally { cleanup(bad); cleanup(good); }
});

test('label-create-before-add: --add-label without an idempotent create', () => {
  const bad = makeRepo({ changed: { [WF]:
`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: gh issue edit 1 --add-label "triage"
` } });
  const good = makeRepo({ changed: { [WF]:
`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: |
          gh label create "triage" 2>/dev/null || true
          gh issue edit 1 --add-label "triage"
` } });
  try {
    assert.equal(run(labelCreate, bad).length, 1);
    assert.equal(run(labelCreate, good).length, 0);
  } finally { cleanup(bad); cleanup(good); }
});

test('unique-automation-branch: date-keyed branch without a per-run-unique suffix', () => {
  const bad = makeRepo({ changed: { [WF]:
`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: git checkout -b report-$(date +%F)
` } });
  const good = makeRepo({ changed: { [WF]:
`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: git checkout -b report-$(date +%F)-\${{ github.run_id }}
` } });
  try {
    assert.equal(run(uniqueBranch, bad).length, 1);
    assert.equal(run(uniqueBranch, good).length, 0);
  } finally { cleanup(bad); cleanup(good); }
});

test('pages-artifact-symlinks: Pages upload of the repo root with mounted skill symlinks and no prune', () => {
  // A legacy consumer that still TRACKS its skill symlinks (the pre-migration
  // layout the rule guards; migrated repos generate them untracked instead).
  const SKILL = { '.claude/skills/some-skill': 'symlink-placeholder\n' };
  const uploadRoot =
`name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: .
`;
  // Breaks: root upload + dangling .claude/skills/* symlinks + no prune step.
  const bad = makeRepo({ changed: { ...SKILL, [WF]: uploadRoot } });
  // Pruned before upload — safe.
  const pruned = makeRepo({ changed: { ...SKILL, [WF]:
`name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: rm -rf .claude .claudinite
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: .
` } });
  // Uploads a dedicated build dir, not the repo root — safe.
  const buildDir = makeRepo({ changed: { ...SKILL, [WF]:
`name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: _site
` } });
  // No mounted skill symlinks — nothing to dangle, so the gate is off.
  const noSkills = makeRepo({ changed: { [WF]: uploadRoot } });
  try {
    const findings = run(pagesArtifactSymlinks, bad);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /upload-pages-artifact/);
    assert.equal(run(pagesArtifactSymlinks, pruned).length, 0);
    assert.equal(run(pagesArtifactSymlinks, buildDir).length, 0);
    assert.equal(run(pagesArtifactSymlinks, noSkills).length, 0);
  } finally { cleanup(bad); cleanup(pruned); cleanup(buildDir); cleanup(noSkills); }
});

test('no-scheduled-fleet-executor: flags a scheduled workflow that calls a canon reusable, spares a plain cron', () => {
  const scheduledExecutor = makeRepo({ changed: { [WF]:
`name: Release to Chrome Store
on:
  schedule:
    - cron: '0 3 * * *'
jobs:
  release:
    uses: missingbulb/Claudinite/.github/workflows/chrome-extension-release.yml@main
` } });
  const dispatchExecutor = makeRepo({ changed: { [WF]:
`name: Release to Chrome Store
on:
  workflow_dispatch:
jobs:
  release:
    uses: missingbulb/Claudinite/.github/workflows/chrome-extension-release.yml@main
` } });
  const ownCron = makeRepo({ changed: { [WF]:
`name: nightly
on:
  schedule:
    - cron: '0 3 * * *'
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
` } });
  try {
    assert.equal(run(noScheduledFleetExecutor, scheduledExecutor).length, 1); // scheduled + canon reusable
    assert.equal(run(noScheduledFleetExecutor, dispatchExecutor).length, 0);  // dispatch-only executor
    assert.equal(run(noScheduledFleetExecutor, ownCron).length, 0);           // consumer's own cron, no reusable
  } finally { cleanup(scheduledExecutor); cleanup(dispatchExecutor); cleanup(ownCron); }
});
