import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import rule from '../worldRules/file-placement.mjs';

const run = (files) => {
  const root = makeRepo({ changed: files });
  try { return rule.run(buildContext({ root, mode: 'all' })); } finally { cleanup(root); }
};

const imports = (spec) => `import { finding } from '${spec}';\n`;

test('file-placement: a near reference yields no findings', () => {
  assert.deepEqual(run({
    'src/app/main.mjs': imports('./helper.mjs') + imports('../shared.mjs'),
  }), []);
});

test('file-placement: flags a distance-3+ reach', () => {
  const f = run({ 'src/app/ui/main.mjs': imports('../../../lib/deep/thing.mjs') });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /references \.\.\/\.\.\/\.\.\/lib\/deep\/thing\.mjs at distance 5/);
});

// The plugin-contract exemption: both ends of this reference are fixed by the pack
// contract, so every pack module takes it and no project can shorten it.
test('file-placement: exempts a canon pack rule reaching the engine surface', () => {
  assert.deepEqual(run({
    'packs/mypack/my-rule.mjs':
      imports('../../engine/checks/helpers/findings.mjs') +
      imports('../claudinite-tasks/shared-code/task-contract.mjs'),
  }), []);
});

test('file-placement: exempts a local pack rule reaching the vendored engine', () => {
  assert.deepEqual(run({
    '.claudinite/local/packs/tldr/my-rule.mjs':
      imports('../../../shared/engine/checks/helpers/minimal-yaml.mjs'),
  }), []);
});

test('file-placement: exempts a pack skill\'s check module too', () => {
  assert.deepEqual(run({
    'packs/mypack/skills/myskill/my-rule.mjs':
      imports('../../../../engine/checks/helpers/line-scanning.mjs'),
  }), []);
});

// Narrowness: the exemption is the pack -> engine-surface direction only.
test('file-placement: still flags a pack reaching deep into its own subtree', () => {
  const f = run({ 'packs/mypack/my-rule.mjs': imports('./skills/myskill/lib/deep.mjs') });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /at distance 3/);
});

test('file-placement: still flags a pack reaching into another pack', () => {
  const f = run({ 'packs/mypack/my-rule.mjs': imports('../other/deep/thing.mjs') });
  assert.equal(f.length, 1);
});

test('file-placement: still flags non-pack code reaching the engine surface', () => {
  const f = run({ 'tools/report/emit.mjs': imports('../../engine/checks/helpers/findings.mjs') });
  assert.equal(f.length, 1);
});
