import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateTaskDeclaration } from '../../../../engine/scheduler/task-contract.mjs';
import decl from '../../../../packs/sheepdog/tasks/fleet-fit/task.mjs';

// The sheepdog pack's fleet-fit task: the fourth fleet question, and the FIRST one
// with an agent stage. Everything asserted here is a property that, if it drifted,
// would either stop the task running at all or let it write past what it declared.

const taskDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../packs/sheepdog/tasks/fleet-fit');
const workerSrc = readFileSync(join(taskDir, 'worker.mjs'), 'utf8');
const briefSrc = readFileSync(join(taskDir, 'task.md'), 'utf8');

test('fleet-fit: the declaration satisfies the task contract', () => {
  assert.deepEqual(validateTaskDeclaration(decl), []);
});

test('fleet-fit: weekly, and ceilinged at open-pr — a pack declaration is always reviewed', () => {
  assert.equal(decl.id, 'fleet-fit');            // must match its directory name (discover.mjs)
  // A repo's SHAPE is slow-moving; a daily sweep would re-ask a question whose answer
  // cannot have changed.
  assert.equal(decl.frequency, 'weekly');
  // The ceiling is the guard that matters most here: declaring a pack switches on
  // conformance checks that run in the member's CI from the moment they land, so a
  // wrong adoption must never auto-merge. verify-outcome.mjs enforces this in code.
  assert.equal(decl.expected_outcome, 'open-pr');
  assert.notEqual(decl.expected_outcome, 'merged-pr');
  assert.deepEqual(decl.precondition_signals, []);
});

test('fleet-fit: declares no session scope — the enforcer repo\'s executor carries the reach', async () => {
  // The fleet access comes from how the enforcer repo is provisioned (declaring
  // sheepdog is the statement of reach), never from a per-task ask. The deprecated
  // field must not creep back in here — this task would be the tempting place.
  assert.equal(decl.session_scope, undefined);
  const { default: pack } = await import('../../../../packs/sheepdog/pack.mjs');
  assert.equal(pack.sessionScope, undefined);   // and no pack-level spelling either
});

test('fleet-fit: two stages — a bounded, task-local sweep, then an agent', () => {
  assert.equal(decl.prework, 'node worker.mjs');
  assert.ok(!decl.prework.includes('..'));   // contract: no traversal out of the task dir
  assert.ok(Number.isInteger(decl.prework_timeout) && decl.prework_timeout > 0);
  assert.ok(existsSync(join(taskDir, 'worker.mjs')));
  // An agentic task must instruct its agent, and the brief must exist.
  assert.notEqual(decl.agent_model, 'none');
  assert.equal(decl.agent_instructions, 'task.md');
  assert.ok(existsSync(join(taskDir, 'task.md')));
  assert.ok(Number.isInteger(decl.agent_execution_timeout) && decl.agent_execution_timeout > 0);
});

test('fleet-fit: the precondition fires unconditionally and says why', () => {
  // Every input lives outside this repo, so no collector signal can predict the
  // answer; the honest declaration is "always run, and no-op cheaply".
  const v = decl.precondition();
  assert.equal(v.run, true);
  assert.match(v.reason, /\S/);
});

test('fleet-fit: the worker invokes the sweep rather than reimplementing it', () => {
  // A copy of the sweep inside the worker would rot against check-fleet-fit.mjs —
  // the same property the census and freshness workers are locked to.
  assert.match(workerSrc, /from '\.\/check-fleet-fit\.mjs'/);
  assert.ok(!workerSrc.includes('/user/repos'));   // no enumeration of its own
  assert.ok(!workerSrc.includes('fleet-fit\''));   // no label/issue logic of its own
});

test('fleet-fit: the brief routes the HOW to adopt-pack instead of restating it', () => {
  // The unattended rules (fix the checks, stop on an interview) are the skill's, so
  // they stay in one place; a copy here would drift from it.
  assert.match(briefSrc, /adopt-pack/);
  assert.match(briefSrc, /SKILL\.md/);
});

test('fleet-fit: the brief forbids merging and forbids the trigger labels', () => {
  // Both are ways for this task to cause damage beyond its ceiling: a merge writes
  // past `open-pr`, and a ready label on a fit issue starts an executor session that
  // finds no valid dispatch.
  assert.match(briefSrc, /Never merge/);
  assert.match(briefSrc, /ready-for-agent-fleet/);
});
