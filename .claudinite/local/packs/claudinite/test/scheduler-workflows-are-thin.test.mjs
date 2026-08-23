import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup } from '../../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../../engine/checks/helpers/repo-context.mjs';
import rule from '../worldRules/scheduler-workflows-are-thin.mjs';

const run = (root) => rule.run(buildContext({ root, mode: 'all' }));
const CANON = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');

const THIN = `name: Claudinite scheduler
on:
  schedule:
    - cron: '10 4,16 * * *'
jobs:
  scheduler-run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - run: node engine/scheduler/queue/scheduler-run.mjs
`;

// All four, so a fixture never trips the blind-scope guard by accident.
const four = (overrides = {}) => ({
  'engine/scheduler/stubs/claudinite-scheduler.yml': THIN,
  'engine/scheduler/stubs/claudinite-executor.yml': THIN,
  '.github/workflows/claudinite-scheduler.yml': THIN,
  '.github/workflows/claudinite-executor.yml': THIN,
  ...overrides,
});

const withFixture = (files, assertions) => {
  const root = makeRepo({ base: files });
  try { assertions(run(root)); } finally { cleanup(root); }
};

test('silent when every copy is a thin wrapper', () => {
  withFixture(four(), (findings) => assert.deepEqual(findings, []));
});

test('fires on github-script, in the stub and in the canon copy alike', () => {
  const withScript = THIN.replace('      - run: node engine/scheduler/queue/scheduler-run.mjs',
    `      - uses: actions/github-script@v7
        with:
          script: |
            core.info('hello');`);
  withFixture(four({
    'engine/scheduler/stubs/claudinite-executor.yml': withScript,
    '.github/workflows/claudinite-executor.yml': withScript,
  }), (findings) => {
    assert.equal(findings.length, 2, 'both vendored copies are watched, not just one');
    assert.deepEqual(findings.map((f) => f.file).sort(), [
      '.github/workflows/claudinite-executor.yml',
      'engine/scheduler/stubs/claudinite-executor.yml',
    ]);
    for (const f of findings) {
      assert.equal(f.severity, 'blocking');
      assert.match(f.what, /github-script/);
      assert.match(f.fix, /engine\/scheduler\/queue\//);
    }
  });
});

test('fires on a block `run:` — a shell script is a program too', () => {
  for (const scalar of ['|', '>', '|-', '|+']) {
    withFixture(four({
      'engine/scheduler/stubs/claudinite-scheduler.yml':
        THIN.replace('- run: node engine/scheduler/queue/scheduler-run.mjs',
          `- run: ${scalar}\n          node engine/scheduler/queue/scheduler-run.mjs\n          echo done`),
    }), (findings) => {
      assert.equal(findings.length, 1, `\`run: ${scalar}\` is a block scalar`);
      assert.match(findings[0].what, /block `run:`/);
    });
  }
});

test('a single-line `run: node …` is the sanctioned form and stays silent', () => {
  withFixture(four({
    'engine/scheduler/stubs/claudinite-scheduler.yml':
      THIN.replace('node engine/scheduler/queue/scheduler-run.mjs',
        'node .claudinite/shared/engine/scheduler/queue/scheduler-run.mjs'),
  }), (findings) => assert.deepEqual(findings, []));
});

// A pattern left behind by a layout change matches nothing, reads as live and
// catches nothing. The rule says so instead of passing.
test('a scope it can no longer see is reported, not passed', () => {
  withFixture({ 'engine/scheduler/stubs/claudinite-scheduler.yml': THIN }, (findings) => {
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /expected the 4 that exist/);
  });
});

// The fixtures above prove the matching; only the real tree can disagree with it.
test('the canon tree itself satisfies the rule', () => {
  assert.deepEqual(run(CANON), []);
});

// The rule's whole premise: these files name a module rather than carrying one.
test('every job in both real stubs runs an engine module', () => {
  for (const stub of ['claudinite-scheduler', 'claudinite-executor']) {
    const yml = readFileSync(join(CANON, `engine/scheduler/stubs/${stub}.yml`), 'utf8');
    const runs = [...yml.matchAll(/^\s*run: (.+)$/gm)].map((m) => m[1]);
    assert.ok(runs.length > 0, `${stub} runs something`);
    for (const cmd of runs) {
      assert.match(cmd, /^node \.claudinite\/shared\/engine\/scheduler\/queue\/[a-z-]+\.mjs$/,
        `${stub}: "${cmd}" must be a bare invocation of a vendored engine module`);
    }
  }
});
