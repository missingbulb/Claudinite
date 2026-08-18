import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule, { invokesEntry } from '../../packs/core/conformance-work-scope.mjs';

const MOUNT_ENTRY = '.claudinite/shared/engine/checks/ci-work-scope.mjs';
const WORLD_STEP = 'run: node .claudinite/shared/engine/checks/check_the_world.mjs';
const WORK_STEP = 'run: node .claudinite/shared/engine/checks/ci-work-scope.mjs --branch "x"';

// A ctx over an in-memory file map — no git, no fixture tree.
const ctx = (files) => ({ files: Object.keys(files), read: (f) => files[f] ?? null });

const workflow = (steps) => `name: Checks
on:
  pull_request:
  push:
    branches: [main]
jobs:
  checks:
    steps:
${steps.map((s) => `      - ${s}`).join('\n')}
`;

const filtered = `name: Checks
on:
  pull_request:
    paths: ['src/**']
jobs:
  checks:
    steps:
      - ${WORLD_STEP}
`;

// A member whose mount carries the entry point and whose CI gates the tree.
const member = (extra = {}) => ({
  [MOUNT_ENTRY]: 'export const RUNNER = 1;\n',
  '.github/workflows/checks.yml': workflow([WORLD_STEP]),
  ...extra,
});

test('a member gating the tree but not the change is reported, with the one-line remedy', () => {
  const findings = rule.run(ctx(member()));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'advisory');
  assert.equal(findings[0].file, '.github/workflows/checks.yml');
  assert.match(findings[0].what, /nothing gates the change/);
  assert.match(findings[0].fix, /ci-work-scope\.mjs --branch/);
});

test('the step beside the world sweep satisfies it', () => {
  const files = member({ '.github/workflows/checks.yml': workflow([WORLD_STEP, WORK_STEP]) });
  assert.deepEqual(rule.run(ctx(files)), []);
});

test('a project wiring its sweeps into a make target or npm script satisfies it too', () => {
  assert.ok(invokesEntry(['Makefile'], () => 'check:\n\tnode .claudinite/shared/engine/checks/ci-work-scope.mjs\n'));
  const files = member({ Makefile: 'check:\n\tnode .claudinite/shared/engine/checks/ci-work-scope.mjs\n' });
  assert.deepEqual(rule.run(ctx(files)), []);
});

test('a repo with no mount is inert — this is a member rule, not a rule about repos', () => {
  assert.deepEqual(rule.run(ctx({ '.github/workflows/checks.yml': workflow([WORLD_STEP]) })), []);
});

test('a member whose mount predates the entry point is inert — it cannot run what it does not have', () => {
  const files = member();
  delete files[MOUNT_ENTRY];
  files['.claudinite/shared/engine/checks/check_the_world.mjs'] = 'x\n';
  assert.deepEqual(rule.run(ctx(files)), []);
});

test('a repo whose tree gate is missing or path-filtered is left to conformance-workflow', () => {
  assert.deepEqual(rule.run(ctx({ [MOUNT_ENTRY]: 'x\n' })), []);
  assert.deepEqual(rule.run(ctx({ [MOUNT_ENTRY]: 'x\n', '.github/workflows/checks.yml': filtered })), []);
});
