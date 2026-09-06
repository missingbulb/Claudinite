import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../helpers.mjs';
import { activeEnvs, evaluate } from '../../engine/pack_loader/env-requirements.mjs';

const env = (over = {}) => ({ id: 'x', label: 'X', setup: 'sx', probe: 'true', ...over });

test('evaluate: reports each requirement whose probe is false, nothing when all pass', () => {
  const e = [env({ label: 'Flutter SDK' }), env({ id: 'y', label: 'Node deps' })];
  assert.deepEqual(evaluate(e, () => true), []);
  assert.deepEqual(evaluate(e, (x) => x.id !== 'x'), ['Flutter SDK is not installed']);
  assert.deepEqual(evaluate(e, () => false), ['Flutter SDK is not installed', 'Node deps is not installed']);
  assert.deepEqual(evaluate([], () => false), []);
});

test('activeEnvs activates a pack\'s string-form env when the pack is declared', async () => {
  const root = makeRepo({ base: { '.claudinite-settings.json': JSON.stringify({ packs: ['flutter'] }) } });
  try {
    assert.ok((await activeEnvs(root)).find((e) => e.id === 'flutter'), 'flutter env active when declared');
  } finally { cleanup(root); }
});

test("activeEnvs resolves the node env from the pack entry's config.dirs (function form)", async () => {
  const root = makeRepo({
    base: {
      '.claudinite-settings.json': JSON.stringify({
        packs: [{ id: 'node', config: { dirs: ['firebase/functions'] } }],
      }),
    },
  });
  try {
    const n = (await activeEnvs(root)).find((e) => e.id === 'node');
    assert.ok(n);
    assert.match(n.setup, /cd "firebase\/functions" && npm ci/);
    assert.match(n.probe, /firebase\/functions\/node_modules/);
  } finally { cleanup(root); }
});

test('activeEnvs still resolves per-repo params from the legacy top-level packConfig', async () => {
  const root = makeRepo({
    base: {
      '.claudinite-settings.json': JSON.stringify({
        packs: ['node'],
        packConfig: { node: { dirs: ['firebase/functions'] } },
      }),
    },
  });
  try {
    const n = (await activeEnvs(root)).find((e) => e.id === 'node');
    assert.ok(n);
    assert.match(n.setup, /cd "firebase\/functions" && npm ci/);
  } finally { cleanup(root); }
});

test('node env defaults to the repo root when no config is given', async () => {
  const root = makeRepo({ base: { '.claudinite-settings.json': JSON.stringify({ packs: ['node'] }) } });
  try {
    const n = (await activeEnvs(root)).find((e) => e.id === 'node');
    assert.match(n.setup, /cd "\." && npm ci/);
  } finally { cleanup(root); }
});

test('activeEnvs is empty when no env-declaring pack is active', async () => {
  const root = makeRepo({ base: { '.claudinite-settings.json': JSON.stringify({ packs: [] }) } });
  try {
    assert.deepEqual(await activeEnvs(root), []);
  } finally { cleanup(root); }
});
