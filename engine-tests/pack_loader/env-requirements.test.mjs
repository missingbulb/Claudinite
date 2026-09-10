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
        packs: [{ id: 'node', config: { dirs: ['api/functions'] } }],
      }),
    },
  });
  try {
    const n = (await activeEnvs(root)).find((e) => e.id === 'node');
    assert.ok(n);
    assert.match(n.setup, /cd "api\/functions" && npm ci/);
    assert.match(n.probe, /api\/functions\/node_modules/);
  } finally { cleanup(root); }
});

// The retired top-level `packConfig` stopped being read on #1640: a repo still
// declaring its parameters there gets the pack's own defaults, not its answers.
test('activeEnvs reads per-repo params off the pack entry, never the retired top-level packConfig', async () => {
  const entry = makeRepo({
    base: {
      '.claudinite-settings.json': JSON.stringify({
        packs: [{ id: 'node', config: { dirs: ['acme/functions'] } }],
      }),
    },
  });
  const retired = makeRepo({
    base: {
      '.claudinite-settings.json': JSON.stringify({
        packs: ['node'],
        packConfig: { node: { dirs: ['api/functions'] } },
      }),
    },
  });
  try {
    const fromEntry = (await activeEnvs(entry)).find((e) => e.id === 'node');
    assert.ok(fromEntry);
    assert.match(fromEntry.setup, /cd "acme\/functions" && npm ci/);
    // The retired key governs nothing: the pack falls back to its own default.
    const fromRetired = (await activeEnvs(retired)).find((e) => e.id === 'node');
    assert.ok(fromRetired);
    assert.match(fromRetired.setup, /cd "\." && npm ci/);
  } finally { cleanup(entry); cleanup(retired); }
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
