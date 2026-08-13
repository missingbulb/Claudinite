import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule, { onBlock, gatesEveryPull } from '../../packs/basics/conformance-workflow.mjs';

const MOUNT = '.claudinite/shared/engine/checks/check_the_world.mjs';
const SWEEP_STEP = 'run: node .claudinite/shared/engine/checks/check_the_world.mjs';

// A ctx over an in-memory file map — no git, no fixture tree.
const ctx = (files) => ({ files: Object.keys(files), read: (f) => files[f] ?? null });

const unfiltered = `name: Checks
on:
  pull_request:
  push:
    branches: [main]
jobs:
  checks:
    steps:
      - ${SWEEP_STEP}
`;

const pathFiltered = `name: test extension
on:
  pull_request:
    branches: [main]
    paths: ['extension/**', 'shared/**']
  push:
    branches: [main]
jobs:
  build-test:
    steps:
      - ${SWEEP_STEP}
`;

test('onBlock returns the trigger block alone, stopping at the next top-level key', () => {
  const on = onBlock(pathFiltered);
  assert.match(on, /pull_request:/);
  assert.match(on, /paths:/);
  assert.doesNotMatch(on, /jobs:/);   // a job-level key must not leak in
});

test('gatesEveryPull sees an unfiltered pull_request that runs the sweep', () => {
  assert.deepEqual(gatesEveryPull(unfiltered), { pull: true, filtered: false, sweeps: true });
});

test('gatesEveryPull flags the trap: a sweep behind a path filter', () => {
  assert.deepEqual(gatesEveryPull(pathFiltered), { pull: true, filtered: true, sweeps: true });
});

test('the rule is inert in a repo that is not a Claudinite member', () => {
  assert.deepEqual(rule.run(ctx({ '.github/workflows/ci.yml': pathFiltered })), []);
});

test('an unfiltered conformance workflow satisfies the rule', () => {
  assert.deepEqual(rule.run(ctx({ [MOUNT]: '', '.github/workflows/checks.yml': unfiltered })), []);
});

// The TLDR shape, and the reason this rule exists: the arm succeeds, no check
// ever runs, the maintenance PR waits forever.
test('a path-filtered sweep is flagged, naming the file', () => {
  const out = rule.run(ctx({ [MOUNT]: '', '.github/workflows/test-extension.yml': pathFiltered }));
  assert.equal(out.length, 1);
  assert.match(out[0].what, /behind a path filter/);
  assert.match(out[0].what, /test-extension\.yml/);
});

// One good gate is enough — a repo may keep any number of path-filtered product
// workflows alongside it.
test('an unfiltered gate wins even when path-filtered workflows also exist', () => {
  assert.deepEqual(rule.run(ctx({
    [MOUNT]: '',
    '.github/workflows/test-extension.yml': pathFiltered,
    '.github/workflows/checks.yml': unfiltered,
  })), []);
});

// #588's coherent shape: nothing runs on a pull request, so baselining merges
// the maintenance PR directly. Not a finding.
test('a member with no pull_request workflow at all is not flagged', () => {
  assert.deepEqual(rule.run(ctx({
    [MOUNT]: '',
    '.github/workflows/release.yml': 'name: r\non:\n  workflow_dispatch:\njobs: {}\n',
  })), []);
});

test('pull_request workflows that never run the sweep are flagged as an ungated repo', () => {
  const out = rule.run(ctx({
    [MOUNT]: '',
    '.github/workflows/test.yml': 'name: t\non:\n  pull_request:\njobs:\n  t:\n    steps:\n      - run: npm test\n',
  }));
  assert.equal(out.length, 1);
  assert.match(out[0].what, /none of them runs the world sweep/);
});

// Advisory on purpose: shipping it blocking would red every member lacking the
// workflow on its next baselining — the #555 failure mode this rule guards against.
test('the rule is advisory until the fleet carries the workflow', () => {
  assert.equal(rule.severity, 'advisory');
});
