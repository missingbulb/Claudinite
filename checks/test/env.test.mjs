import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from './helpers.mjs';
import { activeEnvs, aggregateVersion, emitSetup, evaluate } from '../../packs/env.mjs';

const flutterEnv = { id: 'flutter', label: 'Flutter SDK', version: 1, setup: 'install-flutter', probe: 'true' };

test('aggregateVersion is stable and shifts when a version bumps', () => {
  const v = aggregateVersion([flutterEnv]);
  assert.equal(v, aggregateVersion([{ ...flutterEnv }]));
  assert.notEqual(v, aggregateVersion([{ ...flutterEnv, version: 2 }]));
  assert.notEqual(v, aggregateVersion([flutterEnv, { id: 'x', version: 1 }]));
});

test('evaluate: clean when every probe passes and the flag matches', () => {
  const problems = evaluate([flutterEnv], { probe: () => true, actualFlag: aggregateVersion([flutterEnv]) });
  assert.deepEqual(problems, []);
});

test('evaluate: a failing probe reports the missing tool', () => {
  const problems = evaluate([flutterEnv], { probe: () => false, actualFlag: aggregateVersion([flutterEnv]) });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Flutter SDK is not installed/);
});

test('evaluate: present but no flag → setup not applied', () => {
  const problems = evaluate([flutterEnv], { probe: () => true, actualFlag: null });
  assert.match(problems[0], /has not been applied/);
});

test('evaluate: present but stale flag → out of date', () => {
  const problems = evaluate([flutterEnv], { probe: () => true, actualFlag: 'deadbeef' });
  assert.match(problems[0], /out of date/);
});

test('evaluate: no env requirements → nothing to assert', () => {
  assert.deepEqual(evaluate([], { probe: () => false, actualFlag: null }), []);
});

test('emitSetup embeds each fragment and writes the version flag', () => {
  const script = emitSetup([flutterEnv]);
  assert.match(script, /^#!\/bin\/bash/);
  assert.match(script, /install-flutter/);
  assert.match(script, new RegExp(`echo "${aggregateVersion([flutterEnv])}"`));
  assert.match(emitSetup([]), /No active pack declares an environment requirement/);
});

test('activeEnvs reads the declared packs of a repo', async () => {
  const root = makeRepo({ base: { '.claudinite-checks.json': JSON.stringify({ packs: ['flutter'], rules: {}, accept: [] }) } });
  try {
    const envs = await activeEnvs(root);
    const flutter = envs.find((e) => e.id === 'flutter');
    assert.ok(flutter, 'flutter env is active when declared');
    assert.equal(flutter.label, 'Flutter SDK');
    assert.match(flutter.probe, /flutter/);
  } finally { cleanup(root); }
});

test('activeEnvs is empty when no active pack declares one', async () => {
  const root = makeRepo({ base: { '.claudinite-checks.json': JSON.stringify({ packs: [], rules: {}, accept: [] }) } });
  try {
    assert.deepEqual(await activeEnvs(root), []);
  } finally { cleanup(root); }
});
