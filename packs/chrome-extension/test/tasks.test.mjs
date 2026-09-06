import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import storeReleaseJson from '../tasks/store-release/task.json' with { type: 'json' };
import { evaluatePrecondition, loadTaskTerms, preconditionSignals } from '../../claudinite-tasks/shared-code/preconditions.mjs';
import { normalizeTaskDeclaration } from '../../claudinite-tasks/task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const storeRelease = normalizeTaskDeclaration(storeReleaseJson);

const TASK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../packs/chrome-extension/tasks/store-release');

// The `release` signal's shape (packs/claudinite-tasks/signals/index.mjs). This is a
// UNIT seam over a pure precondition — it asserts the decision, never that the
// scheduler can actually produce `manifestVersion`. It could not, for a while,
// and these stayed green throughout. The reachability half lives in
// packs/claudinite-tasks/test/signal-context.test.mjs (real checkout → real ctx →
// this precondition); the two are only meaningful together.
// `shipsPipeline: true` is the default here because these cases are all about the
// version decision; the shipping gate has its own tests below.
const S = (release = {}, commits = {}) => ({
  release: { latestTag: null, manifestVersion: null, shipsPipeline: true, ...release },
  commits: { substantiveChange: false, ...commits },
});

const terms = await loadTaskTerms(TASK_DIR);
// The cadence term reads the task's own run history at a chosen instant: an empty
// history holds, and the signal under test decides.
const SCHEDULE = { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 };
const AT = '2026-09-05T16:00:00Z';
const NO_RUNS = { runs: { list: [] } };
const verdict = (signals) => evaluatePrecondition({ decl: storeRelease, terms }, { ...NO_RUNS, ...signals }, {}, null, AT, SCHEDULE);

test('store-release: its signals are derived from its conditions, and the worker it names exists', () => {
  // Derived from the two conditions, never declared beside them.
  assert.deepEqual(preconditionSignals(storeRelease.preconditions, terms), ['runs', 'release', 'commits']);
  assert.ok(existsSync(join(TASK_DIR, 'worker.mjs')), 'the preprocessing worker must exist');
});

test('store-release: runs when the manifest version is ahead of the latest release', () => {
  const v = verdict(S({ manifestVersion: '1.4.0', latestTag: 'v1.3.0' }));
  assert.equal(v.run, true);
  assert.match(v.reason, /1\.4\.0 is ahead of released 1\.3\.0/);
});

test('store-release: silent when the shipped version equals the latest release and nothing shipped', () => {
  // The legacy leading-v tolerance survives the conversion: v2.0.0 === 2.0.0.
  assert.equal(verdict(S({ manifestVersion: '2.0.0', latestTag: 'v2.0.0' })).run, false);
});

test('store-release: runs when there is no release yet but a manifest version exists', () => {
  const v = verdict(S({ manifestVersion: '0.1.0', latestTag: null }));
  assert.equal(v.run, true);
  assert.match(v.reason, /manifest 0\.1\.0, and nothing released yet/);
});

test('store-release: silent when no manifest version can be found and nothing shipped', () => {
  assert.equal(verdict(S()).run, false);
});

test('store-release: a substantive default-branch move fires it even at the released version', () => {
  // New in the conversion — the dispatched workflow does the authoritative
  // shipped-file diff, so the precondition is only the cheap pre-filter.
  const v = verdict(S({ manifestVersion: '2.0.0', latestTag: 'v2.0.0' }, { substantiveChange: true }));
  assert.equal(v.run, true);
  assert.match(v.reason, /substantive/);
});
