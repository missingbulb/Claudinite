import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateTaskDeclaration } from '../../../../engine/scheduler/task-contract.mjs';
import decl from '../../../../packs/sheepdog/tasks/fleet-roster/task.mjs';

// The sheepdog pack's fleet-roster task (#788): the coverage and freshness questions
// answered from ONE walk of the fleet, replacing the separate fleet-census and
// fleet-freshness tasks. Three things are worth locking down — the declaration
// satisfies the contract the scheduler and executor both read, the worker INVOKES the
// sweep rather than reimplementing it (a copy would rot silently), and the two tasks
// this one replaces are actually gone.

const packRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../packs/sheepdog');
const taskDir = join(packRoot, 'tasks/fleet-roster');
const workerSrc = readFileSync(join(taskDir, 'worker.mjs'), 'utf8');

// --- the declaration ----------------------------------------------------------

test('fleet-roster: the declaration satisfies the task contract', () => {
  assert.deepEqual(validateTaskDeclaration(decl), []);
});

test('fleet-roster: daily, agentless, and ceilinged at "none" — it opens issues, never a PR', () => {
  assert.equal(decl.id, 'fleet-roster');           // must match its directory name (discover.mjs)
  assert.equal(decl.frequency, 'daily');
  assert.equal(decl.agent_model, 'none');
  assert.equal(decl.expected_outcome, 'none');
  assert.deepEqual(decl.precondition_signals, []);
});

test('fleet-roster: an ordinary pack task — not wired as a fleet mechanism', () => {
  // The classification on record (per-project-scheduling DESIGN §6): the reach is
  // in the implementation, never in the wiring. A `fleet` signal or session scope
  // here would make the scheduler treat it as fleet infrastructure.
  assert.equal(decl.session_scope, undefined);
  assert.ok(!decl.precondition_signals.includes('fleet'));
});

test('fleet-roster: the sweep is the preprocessing, bounded and task-local', () => {
  assert.equal(decl.prework, 'node worker.mjs');
  assert.ok(!decl.prework.includes('..'));   // contract: no traversal out of the task dir
  assert.ok(Number.isInteger(decl.prework_timeout) && decl.prework_timeout > 0);
  assert.ok(existsSync(join(taskDir, 'worker.mjs')));
  assert.equal(decl.agent_instructions, undefined);   // vestigial field dropped: none task, no agent to instruct
});

test('fleet-roster: declares the fleet PAT, which is how the repo is asked for it', () => {
  // `required_secrets` is what stamps FLEET_GITHUB_TOKEN into the scheduler workflow's
  // env, so no workflow needs to exist just to hold it (core/scheduled-tasks.md).
  assert.deepEqual(decl.required_secrets, ['FLEET_GITHUB_TOKEN']);
});

test('fleet-roster: fires unconditionally, with a reason', () => {
  const v = decl.precondition({}, {});
  assert.equal(v.run, true);
  assert.match(v.reason, /\S/);
});

// --- the merge ----------------------------------------------------------------

test('fleet-roster: the two tasks it replaces are gone, not left beside it', () => {
  // A stale task directory would keep being discovered and scheduled, so the fleet
  // would walk itself three times a day and converge the same issues from two places.
  for (const gone of ['fleet-census', 'fleet-freshness']) {
    assert.equal(existsSync(join(packRoot, 'tasks', gone)), false, `tasks/${gone} must be removed`);
  }
});

test('fleet-roster: the two questions live in their own modules beside the walk', () => {
  for (const f of ['check-fleet-roster.mjs', 'adoption-issues.mjs', 'drift-issues.mjs']) {
    assert.ok(existsSync(join(taskDir, f)), `${f} must exist`);
  }
  // Neither issue family may IMPORT the other: they close on unrelated conditions, and
  // the whole point of the merge is that what they SHARE is the roster, nothing else.
  // Naming each other in prose is fine and wanted — it is the coupling that is not.
  const adoptionSrc = readFileSync(join(taskDir, 'adoption-issues.mjs'), 'utf8');
  const driftSrc = readFileSync(join(taskDir, 'drift-issues.mjs'), 'utf8');
  const imports = (src) => [...src.matchAll(/^\s*import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
  assert.ok(!imports(adoptionSrc).some((s) => s.includes('drift-issues')));
  assert.ok(!imports(driftSrc).some((s) => s.includes('adoption-issues')));
  // …and neither enumerates the fleet: the walk is the one place that does.
  for (const [name, src] of [['adoption-issues', adoptionSrc], ['drift-issues', driftSrc]]) {
    assert.ok(!src.includes('/user/repos'), `${name} must not enumerate the fleet`);
    assert.ok(!src.includes('parseSheepdogConfig'), `${name} must not read the fleet config`);
  }
});

// --- the worker delegates to the sweep ----------------------------------------

test('fleet-roster: the worker imports the sweep instead of reimplementing it', () => {
  assert.match(workerSrc, /from '\.\/check-fleet-roster\.mjs'/);
  // None of the sweep's own vocabulary may appear here — a second copy of the
  // enumeration, classification or issue convergence is exactly the failure mode.
  for (const marker of ['/user/repos', 'fleet-adoption', 'fleet-drift', 'isCovered', 'parseSheepdogConfig']) {
    assert.ok(!workerSrc.includes(marker), `worker.mjs should not reimplement the sweep (found ${marker})`);
  }
});

test('fleet-roster: running the worker reaches the sweep, and its failure exits non-zero', async () => {
  // Behavioural, no network: with no FLEET_GITHUB_TOKEN the sweep throws before its
  // first fetch, so the message on stderr proves the worker actually got into
  // check-fleet-roster.mjs — and the non-zero exit is the escalation path (the
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
