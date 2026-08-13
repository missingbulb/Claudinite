import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateTaskDeclaration } from '../../../../engine/scheduler/task-contract.mjs';
import decl from '../../../../packs/sheepdog/tasks/fleet-baseline/task.mjs';

// fleet-baseline as a MANUAL task (#749) — the first task on the non-cadence
// frequency, replacing the pack's standalone workflow (and the `.github/` managed
// copy only the slow agent path could sync). Everything asserted here is a property
// whose drift would either resurrect the workflow shape or let the lever fire on a
// schedule nobody set.

const taskDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../packs/sheepdog/tasks/fleet-baseline');
const workerSrc = readFileSync(join(taskDir, 'worker.mjs'), 'utf8');

test('fleet-baseline: the declaration satisfies the task contract', () => {
  assert.deepEqual(validateTaskDeclaration(decl), []);
});

test('fleet-baseline: manual, agentless, outcome none — an operator lever, not a cadence', () => {
  assert.equal(decl.id, 'fleet-baseline');          // must match its directory name (discover.mjs)
  // `manual` is the whole point: dueSlots skips it unconditionally, so the ONLY way
  // it runs is FORCE_TASKS on a hand-started run — the workflow_dispatch button,
  // relocated onto the ordinary scheduler.
  assert.equal(decl.frequency, 'manual');
  assert.equal(decl.agent_model, 'none');
  assert.equal(decl.expected_outcome, 'none');
  assert.deepEqual(decl.precondition_signals, []);
  assert.equal(decl.session_scope, undefined);
});

test('fleet-baseline: its precondition honestly says no — forced runs never consult it', () => {
  const v = decl.precondition();
  assert.equal(v.run, false);
  assert.match(v.reason, /FORCE_TASKS=fleet-baseline/);
});

test('fleet-baseline: prework is bounded and task-local', () => {
  assert.equal(decl.prework, 'node worker.mjs');
  assert.ok(!decl.prework.includes('..'));
  assert.ok(Number.isInteger(decl.prework_timeout) && decl.prework_timeout > 0);
  assert.ok(existsSync(join(taskDir, 'worker.mjs')));
  assert.deepEqual(decl.required_secrets, ['FLEET_GITHUB_TOKEN']);
});

test('fleet-baseline: the worker invokes the sweep rather than reimplementing it, and never follows', () => {
  assert.match(workerSrc, /from '\.\/force-fleet-baseline\.mjs'/);
  assert.ok(!workerSrc.includes('/user/repos'));   // no enumeration of its own
  // The follow half is retired WITH the workflow: a 45-minute wait inside the
  // serialized scheduler job would queue every other task behind a sleep. Each
  // member reports its own baselining where it always does.
  assert.ok(!workerSrc.toLowerCase().includes('follow'));
});

test('fleet-baseline: the pack ships no workflow stub any more', () => {
  // The `.github/` managed copy was the one file the nightly converge could never
  // push (#649); the 2026-08-11-fleet-baseline-task migration removes lingering
  // member copies, and nothing may quietly reintroduce the stub.
  const stubs = join(dirname(fileURLToPath(import.meta.url)), '../../../../packs/sheepdog/stubs');
  assert.ok(!existsSync(stubs), 'packs/sheepdog/stubs/ must not exist');
});
