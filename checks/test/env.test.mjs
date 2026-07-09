import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { makeRepo, cleanup } from './helpers.mjs';
import { activeEnvs, aggregateVersion, evaluate, flagPath } from '../../packs/env.mjs';

const env = (over = {}) => ({ id: 'x', label: 'X', version: 1, setup: 'sx', probe: 'true', ...over });

test('aggregateVersion is stable and shifts on version/pack change', () => {
  const a = [env()];
  assert.equal(aggregateVersion(a), aggregateVersion([env()]));
  assert.notEqual(aggregateVersion(a), aggregateVersion([env({ version: 2 })]));
  assert.notEqual(aggregateVersion(a), aggregateVersion([env(), env({ id: 'y' })]));
});

test('evaluate: clean / missing tool / no flag / stale / nothing to assert', () => {
  const e = [env({ label: 'Flutter SDK' })];
  const v = aggregateVersion(e);
  assert.deepEqual(evaluate(e, { probe: () => true, actualFlag: v }), []);
  assert.match(evaluate(e, { probe: () => false, actualFlag: v })[0], /Flutter SDK is not installed/);
  assert.match(evaluate(e, { probe: () => true, actualFlag: null })[0], /has not been applied/);
  assert.match(evaluate(e, { probe: () => true, actualFlag: 'deadbeef' })[0], /out of date/);
  assert.deepEqual(evaluate([], { probe: () => false, actualFlag: null }), []);
});

test('flagPath is the checkout parent, not the checkout', () => {
  assert.equal(flagPath('/home/user/Repo'), resolve('/home/user/.claudinite-environment-version'));
});

test('activeEnvs resolves the flutter (string) env when declared', async () => {
  const root = makeRepo({ base: { '.claudinite-checks.json': JSON.stringify({ packs: ['flutter'] }) } });
  try {
    const f = (await activeEnvs(root)).find((e) => e.id === 'flutter');
    assert.ok(f, 'flutter env active when declared');
    assert.equal(f.label, 'Flutter SDK');
    assert.match(f.setup, /flutter\/flutter\.git/);
    assert.match(f.probe, /command -v flutter/);
  } finally { cleanup(root); }
});

test('activeEnvs resolves the node env from per-repo packConfig.dirs (function form)', async () => {
  const root = makeRepo({
    base: {
      '.claudinite-checks.json': JSON.stringify({
        packs: ['node'],
        packConfig: { node: { dirs: ['firebase/functions'] } },
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

test('node env defaults to the repo root when no packConfig is given', async () => {
  const root = makeRepo({ base: { '.claudinite-checks.json': JSON.stringify({ packs: ['node'] }) } });
  try {
    const n = (await activeEnvs(root)).find((e) => e.id === 'node');
    assert.match(n.setup, /cd "\." && npm ci/);
  } finally { cleanup(root); }
});

test('activeEnvs is empty when no env-declaring pack is active', async () => {
  const root = makeRepo({ base: { '.claudinite-checks.json': JSON.stringify({ packs: [] }) } });
  try {
    assert.deepEqual(await activeEnvs(root), []);
  } finally { cleanup(root); }
});
