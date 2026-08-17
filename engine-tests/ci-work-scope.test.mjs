// The work scope's CI entry point (engine/checks/ci-work-scope.mjs) and the
// canon's own wiring to it.
//
// What it guards is the difference between a gate and a green light. Three of
// this module's four outcomes exist because the sweep has ways of judging NOTHING
// while exiting 0 — no base ref, an empty diff, a branch nobody should judge — and
// a run that silently stops judging looks exactly like a run with nothing to say.
// So every outcome is asserted by its exit code AND by the line it prints.
//
// It lives in engine-tests/ beside ci-test-roots.test.mjs, the other guard on CI's
// own wiring: the sweep spans the whole repo, so no pack owns it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup } from './helpers.mjs';
import { decide, isAutomationBranch } from '../engine/checks/ci-work-scope.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const ENTRY = 'engine/checks/ci-work-scope.mjs';
const CI = readFileSync(join(REPO, '.github/workflows/ci.yml'), 'utf8');

// A repo whose branch carries a change, and (optionally) a local pack whose work
// rule always fires — the only way to prove the runner's verdict reaches the exit
// code rather than being swallowed.
const FAILING_PACK = "export default { id: 'demo', prose: null, workRules: [{ id: 'always-fails', severity: 'blocking', "
  + "scope: 'work', description: 'd', why: 'w', run: () => [{ rule: 'always-fails', severity: 'blocking', file: 'a.txt', "
  + "line: null, what: 'deliberate', why: 'w', fix: 'f', doc: null }] }] };\n";

const repoWithChange = ({ failing = false } = {}) => makeRepo({
  base: { 'a.txt': 'one\n' },
  changed: {
    'a.txt': 'two\n',
    ...(failing ? {
      '.claudinite-checks.json': `${JSON.stringify({ packs: ['local/demo'] }, null, 2)}\n`,
      '.claudinite/local/packs/demo/pack.mjs': FAILING_PACK,
    } : {}),
  },
});

// The entry point as CI invokes it — a real process, so the exit code and the
// printed lines are the ones a workflow would see.
const run = (root, branch) => {
  const r = spawnSync(process.execPath, [join(REPO, ENTRY), '--root', root, '--branch', branch], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

// --- which branches are judged ----------------------------------------------

test('an engine-authored branch is not judged as work — auto-merge is a queue for checks', () => {
  assert.ok(isAutomationBranch('claudinite/update-2026-08-12-ja25ab'));
  assert.ok(isAutomationBranch('claudinite/usage-fold/2026-08-17'));
});

test('a person\'s branch that merely starts with the word is judged', () => {
  assert.equal(isAutomationBranch('claudinite-dashboard-fix'), false);
  assert.equal(isAutomationBranch('feature'), false);
});

test('the automation skip exits clean and says which branch it skipped', () => {
  const root = repoWithChange();
  try {
    const { code, out } = run(root, 'claudinite/update-2026-08-12-abc');
    assert.equal(code, 0);
    assert.match(out, /skipped on claudinite\/update-2026-08-12-abc/);
  } finally { cleanup(root); }
});

// --- the ways a sweep can judge nothing --------------------------------------

test('no base branch is an ERROR, not a pass — a baseless scope passes every rule', () => {
  const root = makeRepo({ changed: { 'a.txt': 'one\n' } });
  try {
    // Rename both candidate branches away, leaving the checkout with no base to judge against.
    execFileSync('git', ['branch', '-m', 'main', 'trunk'], { cwd: root });
    const verdict = decide(root, { branch: 'feature', fetch: false });
    assert.equal(verdict.run, false);
    assert.equal(verdict.code, 1);
    assert.match(verdict.say, /no base branch resolved/);
  } finally { cleanup(root); }
});

test('an empty diff against a resolved base is an ERROR too', () => {
  const root = repoWithChange();
  try {
    execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'empty Refs #1'], { cwd: root });
    execFileSync('git', ['checkout', '-q', '-B', 'feature', 'main'], { cwd: root });
    execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'empty Refs #1'], { cwd: root });
    const verdict = decide(root, { branch: 'feature', fetch: false });
    assert.equal(verdict.run, false);
    assert.equal(verdict.code, 1);
    assert.match(verdict.say, /no diff against main/);
  } finally { cleanup(root); }
});

test('sitting ON the base branch is a clean skip — there is no change to judge', () => {
  const root = makeRepo({ changed: { 'a.txt': 'one\n' } });
  try {
    execFileSync('git', ['checkout', '-q', 'main'], { cwd: root });
    const verdict = decide(root, { branch: 'main', fetch: false });
    assert.equal(verdict.run, false);
    assert.equal(verdict.code, 0);
    assert.match(verdict.say, /HEAD is main/);
  } finally { cleanup(root); }
});

// --- the sweep itself ---------------------------------------------------------

test('a real change is swept, and the scope it judged is printed either way', () => {
  const root = repoWithChange();
  try {
    const { code, out } = run(root, 'feature');
    assert.equal(code, 0);
    assert.match(out, /work scope: 1 changed file\(s\) vs main/);
  } finally { cleanup(root); }
});

test('a blocking finding reaches the exit code — the gate fails the build', () => {
  const root = repoWithChange({ failing: true });
  try {
    const { code, out } = run(root, 'feature');
    assert.equal(code, 1);
    assert.match(out, /\[BLOCKING\] always-fails/);
  } finally { cleanup(root); }
});

// --- the canon's own wiring ---------------------------------------------------

test('the canon\'s CI runs this entry point rather than its own copy of the recipe', () => {
  assert.ok(CI.includes(ENTRY), `ci.yml no longer runs ${ENTRY} — the work scope is enforced nowhere but a session's Stop hook`);
});
