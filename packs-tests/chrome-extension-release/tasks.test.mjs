import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pack from '../../packs/chrome-extension-release/pack.mjs';
import storeRelease from '../../packs/chrome-extension-release/tasks/store-release/task.mjs';

const TASK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../packs/chrome-extension-release/tasks/store-release');

// The `release` signal's shape (engine/scheduler/signals/index.mjs). This is a
// UNIT seam over a pure precondition — it asserts the decision, never that the
// scheduler can actually produce `manifestVersion`. It could not, for a while,
// and these stayed green throughout. The reachability half lives in
// engine-tests/scheduler/signal-context.test.mjs (real checkout → real ctx →
// this precondition); the two are only meaningful together.
const S = (release = {}, commits = {}) => ({
  release: { latestTag: null, manifestVersion: null, ...release },
  commits: { substantiveChange: false, ...commits },
});

test('chrome-extension-release contributes store-release as a structural task, not a pack.mjs slot', () => {
  // The task moved out of the manifest: the repo's scheduler finds
  // tasks/<name>/task.mjs structurally (#394).
  assert.equal(pack.run_daily, undefined);
  assert.equal(storeRelease.id, 'store-release');
});

test('store-release: agentless (model none) — the preprocessing worker IS the task', () => {
  assert.equal(storeRelease.agent_model, 'none'); // the whole decision is code; no agent, no dispatch issue
  assert.equal(storeRelease.frequency, 'daily');
  assert.equal(storeRelease.expected_outcome, 'none'); // it only triggers the gated publish workflow
  assert.deepEqual(storeRelease.precondition_signals, ['release', 'commits']);
  assert.equal(storeRelease.agent_preprocessing, 'node worker.mjs');
  assert.ok(existsSync(join(TASK_DIR, 'worker.mjs')), 'the preprocessing worker must exist');
});

test('store-release: runs when the manifest version is ahead of the latest release', () => {
  const v = storeRelease.precondition(S({ manifestVersion: '1.4.0', latestTag: 'v1.3.0' }));
  assert.equal(v.run, true);
  assert.match(v.reason, /1\.4\.0 is ahead of released 1\.3\.0/);
});

test('store-release: silent when the shipped version equals the latest release and nothing shipped', () => {
  // The legacy leading-v tolerance survives the conversion: v2.0.0 === 2.0.0.
  assert.equal(storeRelease.precondition(S({ manifestVersion: '2.0.0', latestTag: 'v2.0.0' })).run, false);
});

test('store-release: runs when there is no release yet but a manifest version exists', () => {
  const v = storeRelease.precondition(S({ manifestVersion: '0.1.0', latestTag: null }));
  assert.equal(v.run, true);
  assert.match(v.reason, /manifest 0\.1\.0, no release yet/);
});

test('store-release: silent when no manifest version can be found and nothing shipped', () => {
  assert.equal(storeRelease.precondition(S()).run, false);
});

test('store-release: a substantive default-branch move fires it even at the released version', () => {
  // New in the conversion — the dispatched workflow does the authoritative
  // shipped-file diff, so the precondition is only the cheap pre-filter.
  const v = storeRelease.precondition(S({ manifestVersion: '2.0.0', latestTag: 'v2.0.0' }, { substantiveChange: true }));
  assert.equal(v.run, true);
  assert.match(v.reason, /substantive/);
});
