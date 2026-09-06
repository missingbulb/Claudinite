// The work scope's CI entry point (engine/checks/ci-work-scope.mjs).
//
// What it guards is the difference between a gate and a green light. Three of
// this module's four outcomes exist because the sweep has ways of judging NOTHING
// while exiting 0 — no base ref, an empty diff, a branch nobody should judge — and
// a run that silently stops judging looks exactly like a run with nothing to say.
// So every outcome is asserted by its exit code AND by the line it prints.
//
// It lives in engine-tests/: the sweep spans the whole repo, so no pack owns it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup, git, writeFiles } from './helpers.mjs';
import { decide, isAutomationBranch, pushedFrom } from '../engine/checks/ci-work-scope.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const ENTRY = 'engine/checks/ci-work-scope.mjs';

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
      '.claudinite-settings.json': `${JSON.stringify({ packs: ['local/demo'] }, null, 2)}\n`,
      '.claudinite/local/packs/demo/pack.mjs': FAILING_PACK,
    } : {}),
  },
});

// Fixture git goes through helpers' `git`, never a bare spawn: it carries the
// identity env every commit needs (a CI runner configures none) and the auto-gc
// settings that keep a fixture from outliving its test.

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
    git(root, 'branch', '-m', 'main', 'trunk');
    const verdict = decide(root, { branch: 'feature', fetch: false });
    assert.equal(verdict.run, false);
    assert.equal(verdict.code, 1);
    assert.match(verdict.say, /no base branch resolved/);
  } finally { cleanup(root); }
});

test('an empty diff against a resolved base is an ERROR too', () => {
  const root = repoWithChange();
  try {
    git(root, 'checkout', '-q', '-B', 'feature', 'main');
    git(root, 'commit', '-q', '--allow-empty', '-m', 'empty Refs #1');
    const verdict = decide(root, { branch: 'feature', fetch: false });
    assert.equal(verdict.run, false);
    assert.equal(verdict.code, 1);
    assert.match(verdict.say, /no diff against main/);
  } finally { cleanup(root); }
});

// `eventPath: null` explicitly, never the ambient default: this suite itself runs
// in Actions, where GITHUB_EVENT_PATH is always set, so a test about the
// no-push-event case must say so rather than inherit whatever the runner has.
test('sitting ON the base branch is a clean skip — there is no change to judge', () => {
  const root = makeRepo({ changed: { 'a.txt': 'one\n' } });
  try {
    git(root, 'checkout', '-q', 'main');
    const verdict = decide(root, { branch: 'main', fetch: false, eventPath: null });
    assert.equal(verdict.run, false);
    assert.equal(verdict.code, 0);
    assert.match(verdict.say, /HEAD is main/);
  } finally { cleanup(root); }
});

// --- the push onto the base branch -------------------------------------------

// A merge landing on main. The fixture writes the payload GitHub Actions would,
// since that file is the only thing that distinguishes this case from a
// developer's clone sitting on main.
const pushedRepo = ({ before = 'HEAD~1' } = {}) => {
  const root = makeRepo({ base: { 'a.txt': 'one\n' } });
  git(root, 'checkout', '-q', 'main');
  writeFiles(root, { 'a.txt': 'two\n' });
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'landed Refs #1');
  const sha = before === null ? '0'.repeat(40) : git(root, 'rev-parse', before).trim();
  writeFiles(root, { 'event.json': `${JSON.stringify({ before: sha })}\n` });
  return { root, eventPath: `${root}/event.json` };
};

test('a push onto the base branch is judged, against what the branch held before it', () => {
  const { root, eventPath } = pushedRepo();
  try {
    const verdict = decide(root, { branch: 'main', fetch: false, eventPath });
    assert.equal(verdict.run, true);
    assert.deepEqual(verdict.changed, ['a.txt']);
  } finally { cleanup(root); }
});

test('the push\'s OWN base is judged, not merely the previous commit', () => {
  const { root, eventPath } = pushedRepo({ before: 'HEAD' });
  try {
    // `before` naming this very commit means the push moved nothing: an empty
    // scope, which the runner refuses rather than passes.
    const verdict = decide(root, { branch: 'main', fetch: false, eventPath });
    assert.equal(verdict.run, false);
    assert.equal(verdict.code, 1);
    assert.match(verdict.say, /no diff against/);
  } finally { cleanup(root); }
});

test('an all-zero `before` — a branch\'s first push — falls back to the previous commit', () => {
  const { root, eventPath } = pushedRepo({ before: null });
  try {
    assert.equal(pushedFrom(root, { eventPath }), 'HEAD^');
    assert.equal(decide(root, { branch: 'main', fetch: false, eventPath }).run, true);
  } finally { cleanup(root); }
});

test('a root commit has nothing before it, so the skip stands', () => {
  const root = makeRepo({});
  try {
    git(root, 'checkout', '-q', 'main');
    writeFiles(root, { 'event.json': '{}\n' });
    assert.equal(pushedFrom(root, { eventPath: `${root}/event.json` }), null);
  } finally { cleanup(root); }
});

test('no event payload — a developer on main — is still the clean skip', () => {
  const { root } = pushedRepo();
  try {
    // `null`, not `undefined`: a destructuring default fires on `undefined`, so
    // under Actions that spelling reads the runner's own payload (see above).
    assert.equal(pushedFrom(root, { eventPath: null }), null);
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
