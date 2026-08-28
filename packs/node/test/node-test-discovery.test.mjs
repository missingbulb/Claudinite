import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import nodeTestDiscovery from '../worldRules/node-test-discovery.mjs';

const run = (root) => nodeTestDiscovery.run(buildContext({ root, mode: 'all' }));

const CLEAN_WORKFLOW = `name: CI
jobs:
  t:
    steps:
      - run: node --test '.claudinite/local/packs/**/*.test.mjs'
`;

const BARE_WORKFLOW = `name: CI
jobs:
  t:
    steps:
      - run: node --test
`;

const TYPO_WORKFLOW = `name: CI
jobs:
  t:
    steps:
      - run: node --test '.claudinite/local_packs/**/*.test.mjs'
`;

const seed = (extra) => ({
  '.claudinite/local/packs/proj/a.test.mjs': 'export default {};\n',
  ...extra,
});

test('node/node-test-discovery: fires on a bare `node --test` in a workflow step', () => {
  const root = makeRepo({ changed: seed({ '.github/workflows/ci.yml': BARE_WORKFLOW }) });
  try {
    const found = run(root);
    assert.equal(found.length, 1);
    assert.equal(found[0].rule, 'node/node-test-discovery');
    assert.equal(found[0].file, '.github/workflows/ci.yml');
    assert.equal(found[0].line, 5);
    assert.match(found[0].fix, /explicit path or glob/);
  } finally { cleanup(root); }
});

test('node/node-test-discovery: fires on a glob that matches nothing in the tree', () => {
  const root = makeRepo({ changed: seed({ '.github/workflows/ci.yml': TYPO_WORKFLOW }) });
  try {
    const found = run(root);
    assert.equal(found.length, 1);
    assert.match(found[0].what, /names no test path that exists/);
  } finally { cleanup(root); }
});

test('node/node-test-discovery: fires on a bare `node --test` in a package.json script', () => {
  const root = makeRepo({ changed: seed({
    'package.json': JSON.stringify({ name: 'fixture', scripts: { test: 'node --test' } }, null, 2),
  }) });
  try {
    const found = run(root);
    assert.equal(found.length, 1);
    assert.equal(found[0].file, 'package.json');
    assert.ok(found[0].line > 0);
  } finally { cleanup(root); }
});

test('node/node-test-discovery: fires on the second command of a chained script', () => {
  const root = makeRepo({ changed: seed({
    'package.json': JSON.stringify({ scripts: { test: 'npm run lint && node --test' } }, null, 2),
  }) });
  try {
    assert.equal(run(root).length, 1);
  } finally { cleanup(root); }
});

test('node/node-test-discovery: stays quiet on an invocation whose glob resolves', () => {
  const root = makeRepo({ changed: seed({ '.github/workflows/ci.yml': CLEAN_WORKFLOW }) });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

test('node/node-test-discovery: stays quiet on an explicit file path that exists', () => {
  const root = makeRepo({ changed: seed({
    'package.json': JSON.stringify({ scripts: { test: 'node --test .claudinite/local/packs/proj/a.test.mjs' } }, null, 2),
  }) });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

test('node/node-test-discovery: stays quiet on a directory that holds files', () => {
  const root = makeRepo({ changed: seed({
    'package.json': JSON.stringify({ scripts: { test: 'node --test .claudinite/local/packs/' } }, null, 2),
  }) });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

test('node/node-test-discovery: stays quiet on a repo with no `node --test` at all', () => {
  const root = makeRepo({ changed: seed({
    'package.json': JSON.stringify({ scripts: { 'bump-version': 'node scripts/bump-version.mjs' } }, null, 2),
  }) });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

test('node/node-test-discovery: stays quiet on an interpolated command it cannot judge', () => {
  const root = makeRepo({ changed: seed({
    'package.json': JSON.stringify({ scripts: { test: 'node --test $TEST_GLOB' } }, null, 2),
  }) });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

test('node/node-test-discovery: stays quiet when the test file is added in the same, not-yet-committed change', () => {
  const root = makeRepo({
    changed: { '.github/workflows/ci.yml': CLEAN_WORKFLOW },
    uncommitted: { '.claudinite/local/packs/proj/a.test.mjs': 'export default {};\n' },
  });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

test('node/node-test-discovery: does not confuse `--test-reporter` for `--test`', () => {
  const root = makeRepo({ changed: seed({
    'package.json': JSON.stringify({ scripts: { report: 'node --test-reporter=spec scripts/bump-version.mjs' } }, null, 2),
  }) });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});
