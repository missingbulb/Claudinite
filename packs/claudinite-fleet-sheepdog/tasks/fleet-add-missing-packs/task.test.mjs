import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateTaskDeclaration } from '../../../../engine/scheduler/task-contract.mjs';
import decl from '../../../../packs/claudinite-fleet-sheepdog/tasks/fleet-add-missing-packs/task.mjs';

// The claudinite-fleet-sheepdog pack's fleet-add-missing-packs task on the FAN-OUT model (#749):
// the enforcer dispatches, the member executes. Everything asserted here is a
// property that, if it drifted, would either stop the task running at all or
// bring back the enforcer-side agent that failed in production.

const taskDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../packs/claudinite-fleet-sheepdog/tasks/fleet-add-missing-packs');
const workerSrc = readFileSync(join(taskDir, 'worker.mjs'), 'utf8');
const briefSrc = readFileSync(join(taskDir, 'README.md'), 'utf8');

test('fleet-add-missing-packs: the declaration satisfies the task contract', () => {
  assert.deepEqual(validateTaskDeclaration(decl), []);
});

test('fleet-add-missing-packs: weekly, agentless, outcome none — the agent is the MEMBER\'s', () => {
  assert.equal(decl.id, 'fleet-add-missing-packs');   // must match its directory name (discover.mjs)
  // A repo's SHAPE is slow-moving; a daily sweep would re-ask a question whose answer
  // cannot have changed.
  assert.equal(decl.frequency, 'weekly');
  // The properties the fan-out model hangs on: no agent HERE (the first design's
  // enforcer-side agent stage failed in production — its executor is scoped to the
  // enforcer repo alone), and no PR here either. What only a repo edit can finish is
  // the member's adopt-requested-packs task, ceilinged at open-pr THERE.
  assert.equal(decl.agent_model, 'none');
  assert.equal(decl.expected_outcome, 'none');
  assert.equal(decl.agent_instructions, undefined);
  assert.deepEqual(decl.precondition_signals, []);
});

test('fleet-add-missing-packs: declares no session scope — nothing agentic runs here at all', async () => {
  assert.equal(decl.session_scope, undefined);
  const { default: pack } = await import('../../../../packs/claudinite-fleet-sheepdog/pack.mjs');
  assert.equal(pack.sessionScope, undefined);   // and no pack-level spelling either
});

test('fleet-add-missing-packs: code_work is bounded, task-local, and SENDS both parameters', () => {
  // No defaults anywhere (params.mjs): the declaration is where a reader looks first
  // to learn what the cadence does, so what the cadence does is written here, and no
  // call site can reach the whole fleet by omission.
  assert.match(decl.code_work, /^node worker\.mjs /);
  assert.match(decl.code_work, /--scan-for-needed-packs=true/);
  assert.match(decl.code_work, /--repos=all-covered-members/);
  assert.ok(!decl.code_work.includes('..'));   // contract: no traversal out of the task dir
  assert.ok(Number.isInteger(decl.code_work_timeout) && decl.code_work_timeout > 0);
  assert.ok(existsSync(join(taskDir, 'worker.mjs')));
});

test('fleet-add-missing-packs: the precondition fires unconditionally and says why', () => {
  // Every input lives outside this repo, so no collector signal can predict the
  // answer; the honest declaration is "always run, and no-op cheaply".
  const v = decl.precondition();
  assert.equal(v.run, true);
  assert.match(v.reason, /\S/);
});

test('fleet-add-missing-packs: the worker invokes each half rather than reimplementing it', () => {
  // A copy of either half inside the worker would rot against the module it copied.
  // What the worker DOES own is what both halves need and neither may hold privately:
  // the parameters, the corpus, the enumeration, and the firing loop.
  assert.match(workerSrc, /from '\.\/scan-for-needed-packs\.mjs'/);
  assert.match(workerSrc, /from '\.\/force-add-packs\.mjs'/);
  assert.match(workerSrc, /from '\.\/params\.mjs'/);
});

test('fleet-add-missing-packs: the worker fires member schedulers and requests no agent of its own', () => {
  // The fan-out contract, in code: fireScheduler at the member's adopt task, and the
  // conditional-handoff machinery gone — a request file written here would be the old
  // model growing back.
  assert.match(workerSrc, /fireScheduler/);
  assert.match(workerSrc, /adopt-requested-packs/);
  assert.ok(!workerSrc.includes('CLAUDINITE_REQUEST_AGENT'));
});

test('fleet-add-missing-packs: the brief records the fan-out and the force\'s total refusal', () => {
  assert.match(briefSrc, /adopt-requested-packs/);
  assert.match(briefSrc, /refuses itself entirely/);
  assert.match(briefSrc, /interview/i);
  // The brief must say where the agentic work went, so a reader does not hunt for an
  // agent stage this task no longer has.
  assert.match(briefSrc, /runs no agent/);
});
