import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { loadDeclaredChecks } from '../../../engine/checks/helpers/pattern-rules.mjs';

const rule = loadDeclaredChecks(fileURLToPath(new URL('../../../packs/claudinite-lifecycle', import.meta.url)))
  .find((r) => r.id === 'scheduler-workflow-shape');

const WF = '.github/workflows/claudinite-scheduler.yml';
const goodWorkflow = `name: Claudinite scheduler
on:
  schedule:
    - cron: '25 4,16 * * *'
  workflow_dispatch:
concurrency:
  group: claudinite-scheduler
permissions:
  contents: write
  issues: write
  pull-requests: write
  actions: read
jobs:
  schedule:
    runs-on: ubuntu-latest
    steps:
      - run: node .claudinite/shared/packs/claudinite-tasks/queue/scheduler-run.mjs
`;

const run = (files) => {
  const root = makeRepo({ changed: files });
  try { return rule.run(buildContext({ root, mode: 'all' })); } finally { cleanup(root); }
};

test('scheduler-workflow-shape: a conforming workflow yields no findings', () => {
  assert.deepEqual(run({ [WF]: goodWorkflow }), []);
});


// A MEMBER'S SCHEDULER IS A SHIM UNDER #1559's design: the jobs live in a canon-hosted
// reusable workflow and this file only names it, so there is no `run:` here to find the
// vendored entry in. Everything else the rule asks for is read from nowhere else and stays.
const shimWorkflow = `name: Claudinite scheduler
on:
  schedule:
    - cron: '25 4,16 * * *'
  workflow_dispatch:
concurrency:
  group: claudinite-scheduler
permissions:
  contents: write
  issues: write
  pull-requests: write
  actions: write
jobs:
  scheduler:
    uses: missingbulb/Claudinite/.github/workflows/claudinite-scheduler-callee.yml@fleet-current
    secrets: inherit
`;

test('scheduler-workflow-shape: a shim calling the canon-hosted body yields no findings', () => {
  assert.deepEqual(run({ [WF]: shimWorkflow }), []);
});

test('scheduler-workflow-shape: is inert when the scheduler workflow is absent', () => {
  assert.deepEqual(run({ '.github/workflows/ci.yml': 'name: CI\non: push\n' }), []);
});

test('scheduler-workflow-shape: flags an off-band cron minute', () => {
  const f = run({ [WF]: goodWorkflow.replace("'25 4,16 * * *'", "'5 4,16 * * *'") });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /cron: '5 4,16 \* \* \*' is not two daily ticks/);
});

// The two-tick form (DESIGN §17) is what the converge writes now; a single daily hour is neither
// that nor the legacy hourly line, so it is still a drifted cron.
test('scheduler-workflow-shape: accepts two daily ticks, and flags a single daily hour', () => {
  assert.deepEqual(run({ [WF]: goodWorkflow.replace("'25 4,16 * * *'", "'25 4,16 * * *'") }), []);
  assert.deepEqual(run({ [WF]: goodWorkflow.replace("'25 4,16 * * *'", "'25 0,12 * * *'") }), []);
  assert.deepEqual(run({ [WF]: goodWorkflow.replace("'25 4,16 * * *'", "'25 23,11 * * *'") }), []);

  const f = run({ [WF]: goodWorkflow.replace("'25 4,16 * * *'", "'25 4 * * *'") });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /cron: '25 4 \* \* \*' is not two daily ticks/);
});

// THE HOURLY LINE IS RETIRED (#1234). It was accepted only because `.github/workflows/` is the one
// path a converge cannot push, so each member held its hourly cron until its own apply-stage pull
// request landed — and going red in that window would have fired the check on every member the
// change had not reached. All 13 now carry the two-tick form, so the tolerance is gone and the
// line it covered is a drifted cron like any other.
test('scheduler-workflow-shape: the retired hourly cron is now flagged', () => {
  const f = run({ [WF]: goodWorkflow.replace("'25 4,16 * * *'", "'25 * * * *'") });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /cron: '25 \* \* \* \*' is not two daily ticks/);
});

test('scheduler-workflow-shape: flags a second cron schedule', () => {
  const two = goodWorkflow.replace("    - cron: '25 4,16 * * *'\n",
    "    - cron: '25 4,16 * * *'\n    - cron: '40 4,16 * * *'\n");
  const f = run({ [WF]: two });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /declares 2 cron schedules, expected exactly one/);
});

test('scheduler-workflow-shape: flags a workflow with no cron at all', () => {
  const none = goodWorkflow.replace("  schedule:\n    - cron: '25 4,16 * * *'\n", '');
  const whats = run({ [WF]: none }).map((x) => x.what).join(' | ');
  assert.match(whats, /declares 0 cron schedules, expected exactly one/);
});

test('scheduler-workflow-shape: flags a read-only scheduler (baselining deliver() needs write)', () => {
  const readOnly = goodWorkflow
    .replace('contents: write', 'contents: read')
    .replace('  pull-requests: write\n', '');
  const whats = run({ [WF]: readOnly }).map((x) => x.what).join(' | ');
  assert.match(whats, /does not grant contents: write/);
  assert.match(whats, /does not grant pull-requests: write/);
});

test('scheduler-workflow-shape: flags missing concurrency, dispatch, and engine entry', () => {
  const stripped = `name: Claudinite scheduler
on:
  schedule:
    - cron: '25 * * * *'
jobs:
  schedule:
    steps:
      - run: echo hi
`;
  const whats = run({ [WF]: stripped }).map((x) => x.what).join(' | ');
  assert.match(whats, /no workflow_dispatch/);
  assert.match(whats, /no concurrency group/);
  assert.match(whats, /neither runs the vendored scheduler entry nor calls the canon-hosted scheduler body/);
});
