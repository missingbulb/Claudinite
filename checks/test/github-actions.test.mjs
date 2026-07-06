import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from './helpers.mjs';
import { buildContext } from '../lib/context.mjs';
import secretsInJobIf from '../packs/github-actions/secrets-in-job-if.mjs';
import runPipefail from '../packs/github-actions/run-pipefail.mjs';
import checkoutSubmodules from '../packs/github-actions/checkout-submodules.mjs';
import scheduledEscalation from '../packs/github-actions/scheduled-failure-escalation.mjs';
import labelCreate from '../packs/github-actions/label-create-before-add.mjs';
import uniqueBranch from '../packs/github-actions/unique-automation-branch.mjs';

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
