import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateTaskDeclaration } from '../../../../engine/scheduler/task-contract.mjs';
import decl from '../../../../packs/sheepdog/tasks/fleet-add-missing-packs/task.mjs';

// The sheepdog pack's fleet-add-missing-packs task: the fourth fleet question, and the FIRST one
// with an agent stage. Everything asserted here is a property that, if it drifted,
// would either stop the task running at all or let it write past what it declared.

const taskDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../packs/sheepdog/tasks/fleet-add-missing-packs');
const workerSrc = readFileSync(join(taskDir, 'worker.mjs'), 'utf8');
const briefSrc = readFileSync(join(taskDir, 'task.md'), 'utf8');

test('fleet-add-missing-packs: the declaration satisfies the task contract', () => {
  assert.deepEqual(validateTaskDeclaration(decl), []);
});

test('fleet-add-missing-packs: weekly, and ceilinged at open-pr — a pack declaration is always reviewed', () => {
  assert.equal(decl.id, 'fleet-add-missing-packs');            // must match its directory name (discover.mjs)
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

test('fleet-add-missing-packs: declares no session scope — the enforcer repo\'s executor carries the reach', async () => {
  // The fleet access comes from how the enforcer repo is provisioned (declaring
  // sheepdog is the statement of reach), never from a per-task ask. The deprecated
  // field must not creep back in here — this task would be the tempting place.
  assert.equal(decl.session_scope, undefined);
  const { default: pack } = await import('../../../../packs/sheepdog/pack.mjs');
  assert.equal(pack.sessionScope, undefined);   // and no pack-level spelling either
});

test('fleet-add-missing-packs: two stages — a bounded, task-local sweep, then an agent', () => {
  assert.match(decl.prework, /^node worker\.mjs /);   // the sibling script, plus this run's parameters
  assert.ok(!decl.prework.includes('..'));   // contract: no traversal out of the task dir
  assert.ok(Number.isInteger(decl.prework_timeout) && decl.prework_timeout > 0);
  assert.ok(existsSync(join(taskDir, 'worker.mjs')));
  // An agentic task must instruct its agent, and the brief must exist.
  assert.notEqual(decl.agent_model, 'none');
  assert.equal(decl.agent_instructions, 'task.md');
  assert.ok(existsSync(join(taskDir, 'task.md')));
  assert.ok(Number.isInteger(decl.agent_execution_timeout) && decl.agent_execution_timeout > 0);
});

test('fleet-add-missing-packs: the precondition fires unconditionally and says why', () => {
  // Every input lives outside this repo, so no collector signal can predict the
  // answer; the honest declaration is "always run, and no-op cheaply".
  const v = decl.precondition();
  assert.equal(v.run, true);
  assert.match(v.reason, /\S/);
});

test('fleet-add-missing-packs: the worker invokes each half rather than reimplementing it', () => {
  // A copy of either half inside the worker would rot against the module it copied —
  // the same property the census and freshness workers are locked to. What the worker
  // DOES own is what both halves need and neither may hold privately: the parameters,
  // the corpus, and the one read of the issue surface they converge against.
  assert.match(workerSrc, /from '\.\/scan-for-needed-packs\.mjs'/);
  assert.match(workerSrc, /from '\.\/force-add-packs\.mjs'/);
  assert.match(workerSrc, /from '\.\/params\.mjs'/);
  assert.ok(!workerSrc.includes('/user/repos'));       // no enumeration of its own
  assert.ok(!workerSrc.includes("LABEL = '"));         // the label is the scan half's, imported
});

test('fleet-add-missing-packs: the weekly run SENDS both parameters, since neither has a default', () => {
  // The point of the parameters: what the cadence does is written where a reader looks
  // first, and no call site can reach the whole fleet by omitting anything.
  assert.match(decl.prework, /--scan-for-needed-packs=true/);
  assert.match(decl.prework, /--repos=all-covered-members/);
});

test('fleet-add-missing-packs: the worker requests the agent conditionally', () => {
  // Without this the agent stage NEVER runs (engine/scheduler/prework.mjs files the
  // ready-for-agent dispatch iff the worker writes the request file) — which is exactly
  // the defect this task carried while it was fleet-fit. And it must stay CONDITIONAL,
  // so a fleet with nothing missing costs one deterministic sweep and no agent.
  assert.match(workerSrc, /CLAUDINITE_REQUEST_AGENT/);
  assert.match(workerSrc, /if \(wanted && requestPath\)/);
});

test('fleet-add-missing-packs: the brief routes the HOW to adopt-pack instead of restating it', () => {
  // The unattended rules (fix the checks, stop on an interview) are the skill's, so
  // they stay in one place; a copy here would drift from it.
  assert.match(briefSrc, /adopt-pack/);
  assert.match(briefSrc, /SKILL\.md/);
});

test('fleet-add-missing-packs: the brief forbids merging and forbids the trigger labels', () => {
  // Both are ways for this task to cause damage beyond its ceiling: a merge writes
  // past `open-pr`, and a ready label on a work-list issue starts an executor session that
  // finds no valid dispatch.
  assert.match(briefSrc, /Never merge/);
  assert.match(briefSrc, /ready-for-agent-fleet/);
});
