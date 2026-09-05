import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pack from '../pack.mjs';
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
const verdict = (signals) => evaluatePrecondition({ decl: storeRelease, terms }, signals);

test('chrome-extension contributes store-release as a structural task, not a pack.mjs slot', () => {
  // The task moved out of the manifest: the repo's scheduler finds
  // tasks/<name>/task.json structurally (#394).
  assert.equal(pack.run_daily, undefined);
  assert.equal(storeRelease.id, 'store-release');
});

test('store-release: agentless (model none) — the preprocessing worker IS the task', () => {
  assert.equal(storeRelease.agent_model, 'none'); // the whole decision is code; no agent phase
  assert.equal(storeRelease.frequency, 'daily');
  assert.equal(storeRelease.expected_outcome, 'no_code_changes'); // it only triggers the gated publish workflow
  assert.deepEqual(storeRelease.preconditions, ['manifest-ahead || substantive-change']);
  // Derived from those two conditions, never declared beside them.
  assert.deepEqual(preconditionSignals(storeRelease.preconditions, terms), ['release', 'commits']);
  assert.equal(storeRelease.code_work, 'node worker.mjs');
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

// --- the shipping gate (#1057) ----------------------------------------------
// The pack is fingerprinted on the manifest, so this task is discovered on every
// extension repo — including the ones that only CODE an extension. The daily leg
// it fires is a workflow such a repo does not have. That is a fact adoption
// settled, not a question worth re-asking nightly, so it stopped being a
// precondition: such a repo names the task in `taskScheduler.disabledTasks` and
// the scheduler never instantiates it.
test('store-release: whether the repo publishes at all is settings, not a condition', () => {
  assert.ok(!storeRelease.preconditions.join(' ').includes('ships'));
  const readMe = readFileSync(join(TASK_DIR, 'README.md'), 'utf8');
  assert.match(readMe, /taskScheduler\.disabledTasks/, 'the task\'s notes say where that answer lives now');
});
