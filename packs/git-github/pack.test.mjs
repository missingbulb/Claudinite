import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup, declaredCheck, ruleTester } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';

const secretsInJobIf = declaredCheck('packs/git-github', 'gha/secrets-in-job-if');
const runPipefail = declaredCheck('packs/git-github', 'gha/run-pipefail');
const checkoutSubmodules = declaredCheck('packs/git-github', 'gha/checkout-submodules');
const scheduledEscalation = declaredCheck('packs/git-github', 'gha/scheduled-failure-escalation');
const labelCreate = declaredCheck('packs/git-github', 'gha/label-create-before-add');
const uniqueBranch = declaredCheck('packs/git-github', 'gha/unique-automation-branch');
const pagesArtifactSymlinks = declaredCheck('packs/git-github', 'gha/pages-artifact-symlinks');
const noScheduledFleetExecutor = declaredCheck('packs/git-github', 'gha/no-scheduled-fleet-executor');
const cronMinuteOffTheHour = declaredCheck('packs/git-github', 'gha/cron-minute-off-the-hour');

const run = (rule, root) => rule.run(buildContext({ root, mode: 'all' }));
const WF = '.github/workflows/x.yml';

ruleTester(secretsInJobIf, {
  clean: {
    'a step-level if may read secrets; the job gates on vars': { files: { [WF]:
`name: x
on: push
jobs:
  deploy:
    if: \${{ vars.DEPLOY_ARN != '' }}
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
        if: \${{ secrets.TOKEN != '' }}
` } },
  },
  flagged: {
    'a job-level if reading secrets, before its own steps and after a previous job\'s': { files: { [WF]:
`name: x
on: push
jobs:
  deploy:
    if: \${{ secrets.DEPLOY_ARN != '' }}
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
  publish:
    runs-on: ubuntu-latest
    steps:
      - run: echo bye
    if: \${{ secrets.PUBLISH_ARN != '' }}
` },
      at: [
        { file: WF, line: 5, what: /reads secrets\.DEPLOY_ARN/ },
        { file: WF, line: 13, what: /reads secrets\.PUBLISH_ARN/ },
      ] },
  },
});

ruleTester(runPipefail, {
  clean: {
    'a bash shell default covers every piped step in the file': { files: { [WF]:
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
` } },
    '|| is the or-operator, not a pipe — and a block scalar that pipes nothing is fine': { files: { [WF]:
`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: try || fallback
      - run: |
          make build
          make test
` } },
  },
  flagged: {
    'an inline piped run: step': { files: { [WF]:
`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: make test 2>&1 | tee log
` },
      at: [{ file: WF, line: 7, what: /piped run: step/ }] },
    'a pipe inside a run: | block, anchored at the run: line': { files: { [WF]:
`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: |
          make build

          make test 2>&1 | tee log
      - run: echo done
` },
      at: [{ file: WF, line: 7, what: /piped run: step/ }] },
  },
});

const GITMODULES = '[submodule "x"]\n\tpath = x\n\turl = https://e.com/x.git\n';

ruleTester(checkoutSubmodules, {
  clean: {
    'the checkout step passes submodules: true': { files: { '.gitmodules': GITMODULES, [WF]:
`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true
` } },
    'no .gitmodules — nothing to fetch': { files: { [WF]:
`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
` } },
  },
  flagged: {
    'a bare checkout, and one whose sibling step carries the key': { files: { '.gitmodules': GITMODULES, [WF]:
`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo hi
  u:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          submodules: true
` },
      at: [
        { file: WF, line: 7, what: /without submodules/ },
        { file: WF, line: 12, what: /without submodules/ },
      ] },
  },
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

test('no-scheduled-fleet-executor: once the scheduler is present, it is the ONLY permitted cron', () => {
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
  // Cut over + a plain scheduled workflow (no canon reusable): now flagged, where
  // pre-cutover it was the consumer's own business.
  const cutOverStrayCron = makeRepo({ changed: { [SCHEDULER]: schedulerYml, [WF]:
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
  // Cut over, but only the scheduler crons: clean (the scheduler itself is exempt).
  const cutOverClean = makeRepo({ changed: { [SCHEDULER]: schedulerYml, [WF]:
`name: publish
on:
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
` } });
  try {
    assert.equal(run(noScheduledFleetExecutor, cutOverStrayCron).length, 1); // stray cron flagged post-cutover
    assert.equal(run(noScheduledFleetExecutor, cutOverClean).length, 0);     // scheduler-only cron is fine
  } finally { cleanup(cutOverStrayCron); cleanup(cutOverClean); }
});

const scheduled = (cronLines) => `name: Nightly
on:
  schedule:
${cronLines}
  workflow_dispatch:

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`;
const cronAt = (expression) => `    - cron: '${expression}'`;

ruleTester(cronMinuteOffTheHour, {
  flagged: {
    'a cron on the hour': {
      files: { [WF]: scheduled(cronAt('0 3 * * *')) },
      at: [{ file: WF, line: 4, what: /cron "cron: '0 3 \* \* \*'" fires outside/ }],
    },
    'a step value fires on :00 too': {
      files: { [WF]: scheduled(cronAt('*/15 * * * *')) },
      at: [{ file: WF, what: /cron "cron: '\*\/15/ }],
    },
    'a minute below the band': {
      files: { [WF]: scheduled(cronAt('5 4 * * *')) },
      at: [{ file: WF, what: /cron "cron: '5 4/ }],
    },
    'a minute above the band': {
      files: { [WF]: scheduled(cronAt('55 * * * *')) },
      at: [{ file: WF, what: /cron "cron: '55/ }],
    },
    'a comma list is not a fixed minute': {
      files: { [WF]: scheduled(cronAt('0,30 * * * *')) },
      at: [{ file: WF, what: /cron "cron: '0,30/ }],
    },
    'every entry in the block is judged, and an unquoted scalar reads the same': {
      files: { [WF]: scheduled(`${cronAt('44 * * * *')}\n    - cron: 0 12 * * *   # midday sweep`) },
      at: [{ file: WF, line: 5, what: /cron "cron: 0 12/ }],
    },
  },
  clean: {
    'a fixed minute inside the band': { files: { [WF]: scheduled(cronAt('44 3 * * *')) } },
    'the band is inclusive at both ends': {
      files: {
        '.github/workflows/low.yml': scheduled(cronAt('10 * * * *')),
        '.github/workflows/high.yml': scheduled(cronAt('50 * * * *')),
      },
    },
    'a `cron` mapping key outside any schedule: block (FP guard)': {
      files: { [WF]: `name: Manual
on:
  workflow_dispatch:
    inputs:
      cron: '0 * * * *'

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
` },
    },
    'a `- cron:` item under a step input, after the schedule block closed (FP guard)': {
      files: { [WF]: `name: Nightly
on:
  schedule:
    - cron: '44 3 * * *'

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: acme/mirror-schedule@v1
        with:
          schedules:
            - cron: '0 * * * *'
` },
    },
    'a `cron:` mapping key inside a step\'s own `schedule:` input is not a trigger (FP guard)': {
      files: { [WF]: `name: Nightly
on:
  workflow_dispatch:

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: acme/scheduler@v1
        with:
          schedule:
            cron: '0 * * * *'
` },
    },
    'a commented-out cron line is not a schedule (FP guard)': {
      files: { [WF]: scheduled(`${cronAt('44 3 * * *')}\n    # - cron: '0 3 * * *'`) },
    },
    'the vendored scheduler is core scheduler-workflow-shape\'s file, not this rule\'s (FP guard)': {
      files: { '.github/workflows/claudinite-scheduler.yml': scheduled(cronAt('0 * * * *')) },
    },
    'a cron outside .github/workflows is out of scope (FP guard)': {
      files: { 'deploy/cron.yml': scheduled(cronAt('0 * * * *')) },
    },
  },
});
