import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateTaskDeclaration } from '../../../../engine/scheduler/task-contract.mjs';
import decl from '../../../../packs/sheepdog/tasks/fleet-census/task.mjs';

// The sheepdog pack's fleet-census task (#394, #422): the coverage census as an
// ORDINARY agentless pack task, replacing the deleted `workflow_dispatch`-only
// coverage workflow that existed only to hold FLEET_GITHUB_TOKEN. Two things are
// worth locking down — the declaration satisfies the contract the scheduler and
// executor both read, and the worker INVOKES the census rather than
// reimplementing it (a copy would rot silently against check-fleet-coverage.mjs).

const packRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../packs/sheepdog');
const taskDir = join(packRoot, 'tasks/fleet-census');
const workerSrc = readFileSync(join(taskDir, 'worker.mjs'), 'utf8');

// --- the declaration ----------------------------------------------------------

test('fleet-census: the declaration satisfies the task contract', () => {
  assert.deepEqual(validateTaskDeclaration(decl), []);
});

test('fleet-census: daily, agentless, and ceilinged at "none" — it opens issues, never a PR', () => {
  assert.equal(decl.id, 'fleet-census');           // must match its directory name (discover.mjs)
  assert.equal(decl.frequency, 'daily');
  assert.equal(decl.agent_model, 'none');
  assert.equal(decl.expected_outcome, 'none');
  assert.deepEqual(decl.precondition_signals, []);
});

test('fleet-census: an ordinary pack task — not wired as a fleet mechanism', () => {
  // The classification on record (per-project-scheduling DESIGN §6): the reach is
  // in the implementation, never in the wiring. A `fleet` signal or session scope
  // here would make the scheduler treat it as fleet infrastructure.
  assert.equal(decl.session_scope, undefined);
  assert.ok(!decl.precondition_signals.includes('fleet'));
});

test('fleet-census: the census is the preprocessing, bounded and task-local', () => {
  assert.equal(decl.agent_preprocessing, 'node worker.mjs');
  assert.ok(!decl.agent_preprocessing.includes('..'));   // contract: no traversal out of the task dir
  assert.ok(Number.isInteger(decl.agent_preprocessing_timeout) && decl.agent_preprocessing_timeout > 0);
  assert.ok(existsSync(join(taskDir, 'worker.mjs')));
  assert.ok(existsSync(join(taskDir, decl.agent_instructions)));
});

test('fleet-census: declares the fleet PAT, which is how the repo is asked for it', () => {
  // The whole point of folding the workflow in: `required_secrets` is what stamps
  // FLEET_GITHUB_TOKEN into the scheduler workflow's env, so no workflow needs to
  // exist just to hold it (basics/scheduled-tasks.md).
  assert.deepEqual(decl.required_secrets, ['FLEET_GITHUB_TOKEN']);
});

test('fleet-census: fires unconditionally, with a reason', () => {
  const v = decl.precondition({}, {});
  assert.equal(v.run, true);
  assert.match(v.reason, /\S/);
});

// --- the worker delegates to the census ---------------------------------------

test('fleet-census: the coverage workflow the task replaces is gone', () => {
  assert.equal(existsSync(join(packRoot, 'stubs/fleet-coverage.yml')), false);
});

test('fleet-census: the worker imports the pack\'s census instead of reimplementing it', () => {
  assert.match(workerSrc, /from '\.\/check-fleet-coverage\.mjs'/);
  // None of the census's own vocabulary may appear here — a second copy of the
  // enumeration, classification or issue convergence is exactly the failure mode.
  for (const marker of ['/user/repos', 'fleet-adoption', 'isCovered', 'parseSheepdogConfig']) {
    assert.ok(!workerSrc.includes(marker), `worker.mjs should not reimplement the census (found ${marker})`);
  }
});

test('fleet-census: running the worker reaches the census, and its failure exits non-zero', async () => {
  // Behavioural, no network: with no FLEET_GITHUB_TOKEN the census throws before
  // its first fetch, so the message on stderr proves the worker actually got into
  // check-fleet-coverage.mjs — and the non-zero exit is the escalation path that
  // replaced the deleted workflow's report-failure job (the scheduler converges a
  // failed preprocessing subprocess to a `needs-human` issue).
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
