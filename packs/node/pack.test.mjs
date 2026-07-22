import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../engine/checks/helpers/work.mjs';
import earnEachDependency from './earn-each-dependency.mjs';

function run(rule, root, mode = 'changed') {
  return runRule(rule, buildContext({ root, mode }));
}

const pkg = (obj) => `${JSON.stringify(obj, null, 2)}\n`;

test('earn-each-dependency: flags a dependency the manifest did not carry before', () => {
  const root = makeRepo({
    base: { 'package.json': pkg({ dependencies: { left: '^1.0.0' } }) },
    changed: { 'package.json': pkg({ dependencies: { left: '^1.0.0', chalk: '^5.0.0' } }) },
  });
  try {
    const findings = run(earnEachDependency, root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'package.json');
    assert.equal(findings[0].severity, 'advisory');
    assert.match(findings[0].what, /"chalk" added to dependencies/);
  } finally { cleanup(root); }
});

test('earn-each-dependency: flags additions one directory down (monorepo function dir)', () => {
  const root = makeRepo({
    base: { 'server/package.json': pkg({ dependencies: {} }) },
    changed: { 'server/package.json': pkg({ devDependencies: { esbuild: '^0.20.0' } }) },
  });
  try {
    const findings = run(earnEachDependency, root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'server/package.json');
    assert.match(findings[0].what, /"esbuild" added to devDependencies/);
  } finally { cleanup(root); }
});

test('earn-each-dependency: a version bump of an existing dependency is not an addition', () => {
  const root = makeRepo({
    base: { 'package.json': pkg({ dependencies: { left: '^1.0.0' } }) },
    changed: { 'package.json': pkg({ dependencies: { left: '^2.0.0' } }) },
  });
  try {
    assert.equal(run(earnEachDependency, root).length, 0);
  } finally { cleanup(root); }
});

test('earn-each-dependency: moving a dependency between groups (dev -> prod) is not an addition', () => {
  const root = makeRepo({
    base: { 'package.json': pkg({ devDependencies: { esbuild: '^0.20.0' } }) },
    changed: { 'package.json': pkg({ dependencies: { esbuild: '^0.20.0' } }) },
  });
  try {
    assert.equal(run(earnEachDependency, root).length, 0);
  } finally { cleanup(root); }
});

test('earn-each-dependency: silent when the manifest is unchanged (check-the-work converges)', () => {
  const root = makeRepo({
    base: { 'package.json': pkg({ dependencies: { left: '^1.0.0' } }) },
    changed: { 'other.txt': 'x\n' },
  });
  try {
    assert.equal(run(earnEachDependency, root).length, 0);
    assert.equal(run(earnEachDependency, root, 'all').length, 0);
  } finally { cleanup(root); }
});

test('earn-each-dependency: a deep nested/fixture package.json never counts', () => {
  const root = makeRepo({
    changed: { 'test/fixtures/proj/package.json': pkg({ dependencies: { chalk: '^5.0.0' } }) },
  });
  try {
    assert.equal(run(earnEachDependency, root).length, 0);
  } finally { cleanup(root); }
});
