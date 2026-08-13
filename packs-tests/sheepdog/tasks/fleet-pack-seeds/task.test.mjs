import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateTaskDeclaration } from '../../../../engine/scheduler/task-contract.mjs';
import decl from '../../../../packs/sheepdog/tasks/fleet-pack-seeds/task.mjs';
import roster from '../../../../packs/sheepdog/tasks/fleet-roster/task.mjs';

// The sheepdog pack's fleet-pack-seeds task: the enforcer converging the pack
// declarations this fleet standardizes on. Same agentless shape as the other
// sweeps and locked down the same way — the declaration satisfies the contract the
// scheduler and executor both read, and the worker INVOKES the sweep rather than
// reimplementing it (a copy would rot against check-fleet-pack-seeds.mjs).

const packRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../packs/sheepdog');
const taskDir = join(packRoot, 'tasks/fleet-pack-seeds');
const workerSrc = readFileSync(join(taskDir, 'worker.mjs'), 'utf8');
const sweepSrc = readFileSync(join(taskDir, 'check-fleet-pack-seeds.mjs'), 'utf8');

// --- the declaration ----------------------------------------------------------

test('fleet-pack-seeds: the declaration satisfies the task contract', () => {
  assert.deepEqual(validateTaskDeclaration(decl), []);
});

test('fleet-pack-seeds: daily, agentless, and ceilinged at "none" — its write goes to OTHER repos', () => {
  assert.equal(decl.id, 'fleet-pack-seeds');      // must match its directory name (discover.mjs)
  // A member becomes writable the moment its nightly converge vendors the pack; daily
  // is what turns that into "the next morning".
  assert.equal(decl.frequency, 'daily');
  assert.equal(decl.agent_model, 'none');
  // Not a contradiction with a sweep that writes: the ceiling describes what a task may
  // do to its OWN repo, and this one opens no PR here at all.
  assert.equal(decl.expected_outcome, 'none');
  assert.deepEqual(decl.precondition_signals, []);
});

test('fleet-pack-seeds: an ordinary pack task — not wired as a fleet mechanism', () => {
  // Same classification the other sweeps carry (per-project-scheduling DESIGN §6): the
  // cross-repo reach is in the implementation, never in the wiring.
  assert.equal(decl.session_scope, undefined);
  assert.ok(!decl.precondition_signals.includes('fleet'));
});

test('fleet-pack-seeds: the sweep is the prework, bounded and task-local', () => {
  assert.equal(decl.prework, 'node worker.mjs');
  assert.ok(!decl.prework.includes('..'));   // contract: no traversal out of the task dir
  assert.ok(Number.isInteger(decl.prework_timeout) && decl.prework_timeout > 0);
  assert.ok(existsSync(join(taskDir, 'worker.mjs')));
  assert.equal(decl.agent_instructions, undefined);   // vestigial field dropped: none task, no agent to instruct
});

test('fleet-pack-seeds: one fleet secret, shared with the other sweeps — but it needs Contents WRITE', () => {
  assert.deepEqual(decl.required_secrets, ['FLEET_GITHUB_TOKEN']);
  assert.deepEqual(decl.required_secrets, roster.required_secrets);
  // The scope bump is the sweep's own business to explain: it is the only thing in the
  // pack that writes to a member, so its token error has to say what the read-only
  // sweeps never needed.
  assert.match(sweepSrc, /Contents READ AND WRITE/);
});

test('fleet-pack-seeds: fires unconditionally, with a reason', () => {
  const v = decl.precondition({}, {});
  assert.equal(v.run, true);
  assert.match(v.reason, /\S/);
});

// --- the worker delegates to the sweep ----------------------------------------

test('fleet-pack-seeds: the worker imports the pack\'s sweep instead of reimplementing it', () => {
  assert.match(workerSrc, /from '\.\/check-fleet-pack-seeds\.mjs'/);
  for (const marker of ['/user/repos', 'classifySeed', 'parseSheepdogConfig', 'withSeeds']) {
    assert.ok(!workerSrc.includes(marker), `worker.mjs should not reimplement the sweep (found ${marker})`);
  }
});

test('fleet-pack-seeds: running the worker reaches the sweep, and its failure exits non-zero', async () => {
  // Behavioural, no network: with no FLEET_GITHUB_TOKEN the sweep throws before its
  // first fetch, so the message on stderr proves the worker actually got into
  // check-fleet-pack-seeds.mjs — and the non-zero exit is the escalation path (the
  // scheduler converges a failed prework subprocess to a `needs-human` issue).
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

// --- it stays in its own lane -------------------------------------------------

test('fleet-pack-seeds: names no pack — every id comes from the fleet\'s own config', () => {
  // The constraint that keeps the enforcer from becoming a second place packs are
  // known. The sweep carries the mechanism; the fleet that declares this pack supplies
  // which packs, in its own `packSeeds`.
  const packSrc = [sweepSrc, workerSrc, readFileSync(join(taskDir, 'task.mjs'), 'utf8'),
    readFileSync(join(packRoot, 'fleet-config.mjs'), 'utf8')].join('\n');
  for (const known of ['claude-code-web-users-support', 'UserPreferencesStore', 'preferences']) {
    assert.ok(!packSrc.includes(known), `the sheepdog pack must not name "${known}"`);
  }
  assert.match(sweepSrc, /packSeeds/);
});

test('fleet-pack-seeds: the only sweep that writes to a member, and it reaches up for what is shared', () => {
  // Each sweep lives IN its own task folder and reaches UP for what is shared — never
  // sideways into another task's folder, and never with a private copy.
  assert.match(sweepSrc, /from '\.\.\/\.\.\/fleet-api\.mjs'/);
  assert.match(sweepSrc, /from '\.\.\/\.\.\/fleet-config\.mjs'/);
  assert.ok(!/from '\.\.\/[a-z-]+\/check-fleet/.test(sweepSrc), 'a sweep must not import another task\'s sweep');
  // No issue label of its own: the finding IS the fix, and it is applied. A label here
  // would be a third issue stream converging on a condition nothing reports.
  assert.ok(!/const LABEL =/.test(sweepSrc));
  // The write is the fleet-api primitive, not a hand-rolled PUT — one place in the pack
  // can change another repo.
  assert.ok(!/method: 'PUT'/.test(sweepSrc), 'the write goes through fleet-api\'s putFile');
  assert.match(sweepSrc, /putFile\(gh, r\.full_name/);
});
