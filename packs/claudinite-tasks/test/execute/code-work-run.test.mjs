// What code-work hands the agentic phase, on the queue's dispatch path — the twin of
// dispatch.mjs's `deliveredLines` for the slot path. The two render the same payload
// into different carriers (a work item's section vs a dispatch issue's body), so a key
// added to one and not the other is dropped silently on half the fleet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { removeTree } from '../../../../engine/remove-tree.mjs';
import { runCodeWork } from '../../src/execute/code-work.mjs';
import { deliveredLines, missingSecrets, taskEnv, codeWorkEnv, CODE_WORK_ENV_VARS, codeWorkCommand } from '../../src/execute/code-work-run.mjs';
import { SECRETS_BAG_ENV } from '../../src/world/secrets-bag.mjs';
import { VARS_BAG_ENV } from '../../src/world/vars-bag.mjs';

test('an artifact code_work created is named by identity', () => {
  assert.deepEqual(deliveredLines({ pr: 7, branch: 'claudinite/x' }), [
    'PR: #7 (open)',
    'Branch: `claudinite/x`',
  ]);
  assert.match(deliveredLines({ pr: 7, merged: true })[0], /already merged/);
});

// A task that keeps a standing record resolves it in its OWN code-work and passes the
// number on through this payload. Both live workers were already writing
// `delivered.issue` and nothing rendered it, so the number reached no agent and the
// agentic phase went hunting for the issue by title instead.
test('an ISSUE code_work resolved reaches the agent', () => {
  assert.deepEqual(deliveredLines({ issue: 42 }), ["Issue: #42 — write this run's record there."]);
});

test('absence stays absence — no placeholder for what was not created', () => {
  for (const delivered of [null, undefined, {}, { pr: null, branch: null, issue: null }]) {
    assert.deepEqual(deliveredLines(delivered), [], JSON.stringify(delivered));
  }
});

// THE TARGET RIDES THE ENV (PRINCIPLES.md): the executor resolved which branch and
// pull request this run works on, and code-work reads it here rather than looking
// for one itself. Three variables, present in every mode — an absent one would be
// indistinguishable from a worker running under an older executor.
test('code-work is handed the target the executor resolved, in every mode', () => {
  const base = { root: '/r', repo: 'o/r', defaultBranch: 'main', task: { pack: 'p', id: 't' }, item: { number: 4 }, requestPath: '/tmp/x' };
  const amend = codeWorkEnv({ ...base, target: { mode: 'amend', branch: 'claudinite/p/t/2026-09-04-ab12', pr: 41 } });
  assert.equal(amend.CLAUDINITE_TARGET_MODE, 'amend');
  assert.equal(amend.CLAUDINITE_TARGET_BRANCH, 'claudinite/p/t/2026-09-04-ab12');
  assert.equal(amend.CLAUDINITE_TARGET_PR, '41');
  const none = codeWorkEnv({ ...base, target: { mode: 'none', branch: null, pr: null } });
  assert.deepEqual([none.CLAUDINITE_TARGET_MODE, none.CLAUDINITE_TARGET_BRANCH, none.CLAUDINITE_TARGET_PR], ['none', '', '']);
  for (const name of ['CLAUDINITE_TARGET_MODE', 'CLAUDINITE_TARGET_BRANCH', 'CLAUDINITE_TARGET_PR']) {
    assert.ok(CODE_WORK_ENV_VARS.includes(name), `${name} is in the contract the env check polices`);
  }
});

test('a declared secret that is unset is named; a set-but-empty one is the repo\'s own choice', () => {
  assert.deepEqual(missingSecrets(['A', 'B'], { B: '' }), ['A']);
  assert.deepEqual(missingSecrets([], {}), []);
});

// #1301. Before the bag, the child inherited the executor's whole environment, so
// every code-work task saw every secret the workflow stamped though only a few
// declared one. The selection is what makes that claim (docs/PRINCIPLES.md) true rather than aspirational.
test('code-work is handed the secrets it declared, and none of the others', async () => {
  const { codeWorkRunner } = await import('../../src/execute/code-work-run.mjs');
  const { SECRETS_BAG_ENV } = await import('../../src/world/secrets-bag.mjs');
  const out = join(mkdtempSync(join(tmpdir(), 'code-work-env-')), 'env.json');
  const env = {
    PATH: process.env.PATH,
    [SECRETS_BAG_ENV]: JSON.stringify({ MINE: 'm', SOMEONE_ELSES: 'x', github_token: 'g' }),
  };
  const run = codeWorkRunner({ root: '/r', repo: 'o/r', defaultBranch: 'main', env });
  const result = await run({
    pack: 'p', id: 't', taskDir: process.cwd(),
    decl: {
      code_work_required_secrets: ['MINE'],
      code_work_timeout: 60,
      code_work: `node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify(process.env))" ${out}`,
    },
  }, { item: { number: 1 } });
  assert.equal(result.ok, true);
  const child = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(child.MINE, 'm');
  assert.equal(child.SOMEONE_ELSES, undefined);
  assert.equal(child.github_token, undefined);
  // The bag itself would re-export everything the selection just excluded.
  assert.equal(child[SECRETS_BAG_ENV], undefined);
});

test('a legacy stamping workflow still reaches its declared secret', async () => {
  const { missingSecrets } = await import('../../src/execute/code-work-run.mjs');
  assert.deepEqual(missingSecrets(['A'], { A: 'set-the-old-way' }), []);
});

test('the bag is what decides a declared secret is missing, not the plain environment', async () => {
  const { missingSecrets } = await import('../../src/execute/code-work-run.mjs');
  const { SECRETS_BAG_ENV } = await import('../../src/world/secrets-bag.mjs');
  const env = { [SECRETS_BAG_ENV]: JSON.stringify({ A: '', B: 'v' }) };
  assert.deepEqual(missingSecrets(['A', 'B', 'C'], env), ['C']);
});


// WHAT THE TWO BAGS DO DIFFERENTLY, at the one place both are unpacked (#1492). A
// secret is selected down to what the task declared; a variable is not, because
// `vars` is non-sensitive by construction and there is no blast radius to narrow.
test('taskEnv selects the declared secrets and delivers every repo variable', () => {
  const env = {
    PATH: '/usr/bin',
    [SECRETS_BAG_ENV]: JSON.stringify({ WANTED: 'yes', OTHER: 'no' }),
    [VARS_BAG_ENV]: JSON.stringify({ SITE: 'x', PATH: '/nope' }),
  };
  const out = taskEnv(['WANTED'], env);
  assert.equal(out.WANTED, 'yes');
  assert.equal(out.OTHER, undefined, 'an undeclared secret is not this task\'s business');
  assert.equal(out.SITE, 'x', 'a repo variable needs no declaration');
  assert.equal(out.PATH, '/usr/bin', 'and cannot replace the runner\'s own environment');
  // Neither raw blob is itself handed on.
  assert.equal(out[SECRETS_BAG_ENV], undefined);
  assert.equal(out[VARS_BAG_ENV], undefined);
});

// WHICH COMMAND THE PHASE SPAWNS, for each of the two forms a work step is declared
// in. A `code_work` declaration is the command; a `code_worker_mjs` one names a module
// and the command is the runner's own entry point around it, which is what makes the
// wrapping the runner's to write once.
test('codeWorkCommand spawns a code_work declaration as it stands', () => {
  assert.equal(codeWorkCommand({ code_work: 'node worker.mjs --flag' }), 'node worker.mjs --flag');
});

test('codeWorkCommand wraps a code_worker_mjs module in the runner entry point', async () => {
  const cmd = codeWorkCommand({ code_worker_mjs: 'worker.mjs' });
  // The module is passed as an argument, and the entry point is addressed absolutely
  // because the subprocess runs with the TASK directory as cwd.
  assert.match(cmd, /^node "\/.*\/worker-entry\.mjs" "worker\.mjs"$/);
  // The path it names is really there: a wrapper the runner cannot find fails every
  // wrapped task at once, and a moved file would otherwise show up only in production.
  const entry = cmd.match(/^node "([^"]+)"/)[1];
  const mod = await import(pathToFileURL(entry).href);
  assert.equal(typeof mod.runWorkerModule, 'function');
});

// The real spawn path, end to end: a task directory with a module in it, run through
// the same runCodeWork the executor uses, and the worker's own output on stdout.
test('runCodeWork runs a wrapped worker module, bag and all', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'claudinite-wrapped-'));
  writeFileSync(join(dir, 'task.json'), JSON.stringify({ id: 'p/t' }));
  writeFileSync(join(dir, 'worker.mjs'),
    'export const worker = (p) => { console.log(`worker saw ${p.repo} #${p.item.number}`); };\n');
  try {
    const result = await runCodeWork(codeWorkCommand({ code_worker_mjs: 'worker.mjs' }), {
      taskDir: dir,
      env: { ...process.env, CLAUDINITE_REPO: 'owner/name', CLAUDINITE_ITEM: '9', CLAUDINITE_PACK: 'p', CLAUDINITE_TASK: 't' },
      timeoutSeconds: 60,
      echo: () => {},
    });
    assert.equal(result.ok, true, result.stderr);
    assert.match(result.stdout, /worker saw owner\/name #9/);
    assert.match(result.stdout, /p\/t: worker done in/);
  } finally { removeTree(dir); }
});

// A throwing worker is a failed run: the exit status is what the executor reads, and
// the failure line is what its park comment is built from.
test('runCodeWork reports a wrapped worker that threw as a failed run', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'claudinite-wrapped-'));
  writeFileSync(join(dir, 'task.json'), JSON.stringify({ id: 'p/t' }));
  writeFileSync(join(dir, 'worker.mjs'), 'export const worker = () => { throw new Error("nope"); };\n');
  try {
    const result = await runCodeWork(codeWorkCommand({ code_worker_mjs: 'worker.mjs' }), {
      taskDir: dir,
      env: { ...process.env, CLAUDINITE_PACK: 'p', CLAUDINITE_TASK: 't' },
      timeoutSeconds: 60,
      echo: () => {},
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /p\/t failed after .*: nope/);
  } finally { removeTree(dir); }
});
