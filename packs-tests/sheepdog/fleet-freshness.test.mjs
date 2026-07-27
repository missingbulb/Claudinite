import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateTaskDeclaration } from '../../engine/scheduler/task-contract.mjs';
import decl from '../../packs/sheepdog/tasks/fleet-freshness/task.mjs';
import census from '../../packs/sheepdog/tasks/fleet-census/task.mjs';

// The sheepdog pack's fleet-freshness task: the OUTSIDE look at each covered member,
// which per-project scheduling removed when it made every repo maintain itself. Same
// agentless shape as the census, and locked down the same way — the declaration
// satisfies the contract the scheduler and executor both read, and the worker INVOKES
// the sweep rather than reimplementing it (a copy would rot against
// check-fleet-freshness.mjs).

const packRoot = join(dirname(fileURLToPath(import.meta.url)), '../../packs/sheepdog');
const taskDir = join(packRoot, 'tasks/fleet-freshness');
const workerSrc = readFileSync(join(taskDir, 'worker.mjs'), 'utf8');

// --- the declaration ----------------------------------------------------------

test('fleet-freshness: the declaration satisfies the task contract', () => {
  assert.deepEqual(validateTaskDeclaration(decl), []);
});

test('fleet-freshness: weekly, agentless, and ceilinged at "none" — it reports, it does not repair', () => {
  assert.equal(decl.id, 'fleet-freshness');        // must match its directory name (discover.mjs)
  // Drift is measured in days (staleDays, default 14), so a daily sweep would re-ask
  // a question whose answer cannot have changed.
  assert.equal(decl.frequency, 'weekly');
  assert.equal(decl.agent_model, 'none');
  assert.equal(decl.expected_outcome, 'none');
  assert.deepEqual(decl.precondition_signals, []);
});

test('fleet-freshness: an ordinary pack task — not wired as a fleet mechanism', () => {
  // Same classification the census carries (per-project-scheduling DESIGN §6): the
  // cross-repo reach is in the implementation, never in the wiring.
  assert.equal(decl.session_scope, undefined);
  assert.ok(!decl.precondition_signals.includes('fleet'));
});

test('fleet-freshness: the sweep is the preprocessing, bounded and task-local', () => {
  assert.equal(decl.agent_preprocessing, 'node worker.mjs');
  assert.ok(!decl.agent_preprocessing.includes('..'));   // contract: no traversal out of the task dir
  assert.ok(Number.isInteger(decl.agent_preprocessing_timeout) && decl.agent_preprocessing_timeout > 0);
  assert.ok(existsSync(join(taskDir, 'worker.mjs')));
  assert.ok(existsSync(join(taskDir, decl.agent_instructions)));
});

test('fleet-freshness: declares the same fleet PAT the census does — one secret, two sweeps', () => {
  assert.deepEqual(decl.required_secrets, ['FLEET_GITHUB_TOKEN']);
  assert.deepEqual(decl.required_secrets, census.required_secrets);
});

test('fleet-freshness: fires unconditionally, with a reason', () => {
  const v = decl.precondition({}, {});
  assert.equal(v.run, true);
  assert.match(v.reason, /\S/);
});

// --- the worker delegates to the sweep ----------------------------------------

test('fleet-freshness: the worker imports the pack\'s sweep instead of reimplementing it', () => {
  assert.match(workerSrc, /from '\.\.\/\.\.\/check-fleet-freshness\.mjs'/);
  for (const marker of ['/user/repos', 'fleet-drift', 'classifyFreshness', 'parseSheepdogConfig']) {
    assert.ok(!workerSrc.includes(marker), `worker.mjs should not reimplement the sweep (found ${marker})`);
  }
});

test('fleet-freshness: running the worker reaches the sweep, and its failure exits non-zero', async () => {
  // Behavioural, no network: with no FLEET_GITHUB_TOKEN the sweep throws before its
  // first fetch, so the message on stderr proves the worker actually got into
  // check-fleet-freshness.mjs — and the non-zero exit is the escalation path (the
  // scheduler converges a failed preprocessing subprocess to a `needs-human` issue).
  const env = { ...process.env, GITHUB_REPOSITORY: 'acme/sheepdog' };
  delete env.FLEET_GITHUB_TOKEN;
  const { code, stderr } = await new Promise((resolve) => {
    execFile(process.execPath, ['worker.mjs'], { cwd: taskDir, env }, (err, _out, errOut) => {
      resolve({ code: err ? err.code : 0, stderr: errOut });
    });
  });
  assert.equal(code, 1);
  assert.match(stderr, /FLEET_GITHUB_TOKEN is not set/);
});

// --- the two sweeps stay distinct ---------------------------------------------

test('fleet-freshness and fleet-census answer different questions, on different labels', () => {
  // Coverage asks "is this repo a member"; freshness takes that as given and asks
  // "is that membership still meaning anything". Sharing a label would merge two
  // issue streams whose close conditions are unrelated.
  const sweep = readFileSync(join(packRoot, 'check-fleet-freshness.mjs'), 'utf8');
  const coverage = readFileSync(join(packRoot, 'check-fleet-coverage.mjs'), 'utf8');
  assert.match(sweep, /const LABEL = 'fleet-drift'/);
  assert.match(coverage, /const LABEL = 'fleet-adoption'/);
  // Both converge through the pack's shared floor rather than a private copy.
  for (const src of [sweep, coverage]) {
    assert.match(src, /ensureLabel[\s\S]*from '\.\/fleet-api\.mjs'|from '\.\/fleet-api\.mjs'/);
    assert.ok(!/async function ensureLabel/.test(src), 'ensureLabel belongs to fleet-api.mjs, not to a sweep');
  }
});
