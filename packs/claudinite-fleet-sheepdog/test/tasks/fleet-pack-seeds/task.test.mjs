import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';
import { validateTaskDeclaration } from '../../../../claudinite-tasks/shared-code/task-contract.mjs';
import declJson from '../../../tasks/fleet-pack-seeds/task.json' with { type: 'json' };
import rosterJson from '../../../tasks/fleet-roster/task.json' with { type: 'json' };
import { evaluatePrecondition } from '../../../../claudinite-tasks/shared-code/preconditions.mjs';
import { normalizeTaskDeclaration } from '../../../../claudinite-tasks/task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const decl = normalizeTaskDeclaration(declJson);
const roster = normalizeTaskDeclaration(rosterJson);

// The claudinite-fleet-sheepdog pack's fleet-pack-seeds task: the enforcer converging the pack
// declarations this fleet standardizes on. Same agentless shape as the other
// sweeps and locked down the same way — the declaration satisfies the contract the
// scheduler and executor both read, and running the worker reaches the sweep.

const packRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../../packs/claudinite-fleet-sheepdog');
const taskDir = join(packRoot, 'tasks/fleet-pack-seeds');

// --- the declaration ----------------------------------------------------------

test('fleet-pack-seeds: the declaration satisfies the task contract', () => {
  assert.deepEqual(validateTaskDeclaration(decl), []);
});

test('fleet-pack-seeds: the declaration names its own directory and a worker that is there', () => {
  // discover.mjs resolves a task by its directory, and the executor runs code_work from it.
  assert.equal(decl.id, basename(taskDir));
  const [, script] = decl.code_work.split(/\s+/);
  assert.ok(existsSync(join(taskDir, script)), `code_work names ${script}, which is not beside the declaration`);
});

test('fleet-pack-seeds: asks for the same fleet secret the roster sweep does — one grant, declared alike', () => {
  // The token is granted once for the whole pack (fleet-token.mjs), so two sweeps
  // declaring different secret names would be two things for a person to configure.
  assert.deepEqual(decl.code_work_required_secrets, roster.code_work_required_secrets);
});

test('fleet-pack-seeds: fires unconditionally, with a reason', () => {
  const v = evaluatePrecondition({ decl }, {});
  assert.equal(v.run, true);
  assert.match(v.reason, /\S/);
});

// --- the worker delegates to the sweep ----------------------------------------

test('fleet-pack-seeds: running the worker reaches the sweep, and its failure exits non-zero', async () => {
  // Behavioural, no network: with no FLEET_GITHUB_TOKEN the sweep throws before its
  // first fetch, so the message on stderr proves the worker actually got into
  // check-fleet-pack-seeds.mjs — and the non-zero exit is the escalation path (the
  // scheduler converges a failed code-work subprocess to a `needs-human` issue).
  const env = { ...process.env, GITHUB_REPOSITORY: 'acme/claudinite-fleet-sheepdog' };
  delete env.FLEET_GITHUB_TOKEN;
  const { code, stderr } = await new Promise((resolve) => {
    execFile(process.execPath, ['worker.mjs'], { cwd: taskDir, env }, (err, _out, errOut) => {
      resolve({ code: err ? err.code : 0, stderr: errOut });
    });
  });
  assert.equal(code, 1);
  assert.match(stderr, /FLEET_GITHUB_TOKEN is not set/);
});
