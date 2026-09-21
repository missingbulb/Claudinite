import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { makeRepo, cleanup } from '../../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../../engine/checks/helpers/repo-context.mjs';
import { loadDeclaredChecks } from '../../../../../engine/checks/helpers/pattern-rules.mjs';

const rule = loadDeclaredChecks(
  fileURLToPath(new URL('..', import.meta.url)),
).find((r) => r.id === 'fixture-git-housekeeping');

const run = (root) => rule.run(buildContext({ root, mode: 'all' }));
const at = (files) => makeRepo({ base: files });

const BARE = `const git = (...a) => execFileSync('git', ['-C', root, ...a]);\ngit('init', '-q');\n`;
// The env the shared runner passes, and the whole of what the check requires: a
// file that spells it out is spawning git with housekeeping already off.
const GUARDED = `const env = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'gc.autoDetach', GIT_CONFIG_VALUE_0: 'false' };\n`
  + `spawnSync('git', ['init', '-q'], { cwd: root, env });\n`;

test('fixture-git-housekeeping: a bare spawn that inits a fixture is reported', () => {
  const root = at({ 'engine-tests/a.test.mjs': BARE });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'engine-tests/a.test.mjs');
  } finally { cleanup(root); }
});

test('fixture-git-housekeeping: the same spawn with the housekeeping env passes', () => {
  const root = at({ 'engine-tests/a.test.mjs': GUARDED });
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

// The shape #2183 landed: the test calls the shared runner, which does the
// spawning, so the file names no child process of its own and is out of scope.
test('fixture-git-housekeeping: calling the shared runner is out of scope', () => {
  const root = at({
    'engine-tests/a.test.mjs': "import { git } from './helpers.mjs';\ngit(root, 'init', '-q');\n",
  });
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

// Reading the real repository is not the failure mode: nothing is written under
// .git, and the tree the command ran in is nobody's to remove.
test('fixture-git-housekeeping: a read-only git call over the checkout passes', () => {
  const root = at({
    'engine-tests/a.test.mjs': "const tracked = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' });\n",
  });
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

// Production code spawns git for the engine's own work, against trees it does not
// create; the fixture race is a test-file condition.
test('fixture-git-housekeeping: scope is test files, not the modules beside them', () => {
  const root = at({ 'engine/a.mjs': BARE, 'engine-tests/a.test.mjs': BARE });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'engine-tests/a.test.mjs');
  } finally { cleanup(root); }
});

// A pattern left behind by a layout change matches nothing and still reads as
// live, so the scope is measured over the real tree with the declaration's own
// regex rather than a second copy of it here.
test('fixture-git-housekeeping: the scope is non-empty against the real tree', () => {
  const root = fileURLToPath(new URL('../../../../..', import.meta.url));
  const tracked = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' }).split('\n');
  assert.ok(tracked.filter((p) => rule.spec.scanFiles.test(p)).length >= 100);
});
