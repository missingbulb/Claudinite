import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { removeTree } from '../../engine/remove-tree.mjs';

const CANON = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECK_THE_WORLD = join(CANON, 'engine/checks/check_the_world.mjs');

// THE REGRESSION (#689). check_the_world is run BY A CONVERGE, from a process whose cwd
// is inside `.claudinite/shared/` — the exact tree the converge has just deleted and
// re-copied. On Linux that process keeps running in an unlinked directory, and so does
// every child it spawns; `process.cwd()` in the child then throws `ENOENT … uv_cwd`
// before a single check runs. The whole fleet reported `checks-could-not-run` on every
// converging night because of it, which is indistinguishable from "this mount has no
// checks" — so nothing surfaced it for as long as it was true.
//
// The test recreates that state literally rather than mocking it: a child chdirs into a
// directory, deletes it, and only then spawns check_the_world. Without the
// CLAUDE_PROJECT_DIR fallback this fails at the cwd call, exactly as the fleet did.

// Spawn `check_the_world <args>` from a process whose cwd has been deleted, mimicking
// the converge. Returns { status, stderr } instead of throwing so a failure is asserted
// on rather than crashing the test.
function fromDeletedCwd(args, env = {}) {
  const box = mkdtempSync(join(tmpdir(), 'ctw-root-'));
  const doomed = join(box, 'mount', 'packs', 'basics', 'tasks', 'baselining');
  mkdirSync(doomed, { recursive: true });
  // A minimal repo for the sweep to look at, OUTSIDE the directory that gets deleted.
  const repo = join(box, 'repo');
  mkdirSync(repo, { recursive: true });
  writeFileSync(join(repo, '.claudinite-settings.json'), JSON.stringify({ packs: [] }, null, 2));

  const driver = [
    `process.chdir(${JSON.stringify(doomed)});`,
    `require('node:fs').rmSync(${JSON.stringify(join(box, 'mount'))}, { recursive: true, force: true });`,
    'const { execFileSync } = require("node:child_process");',
    `try { execFileSync(process.execPath, ${JSON.stringify([CHECK_THE_WORLD, ...args])},`,
    '  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });',
    '  console.log("STATUS 0");',
    '} catch (e) { console.log("STATUS " + (e.status ?? "crash")); console.log(String(e.stderr ?? e.message)); }',
  ].join('\n');

  const out = execFileSync(process.execPath, ['-e', driver], {
    encoding: 'utf8', env: { ...process.env, ...env }, cwd: box,
  });
  removeTree(box);
  const [statusLine, ...rest] = out.split('\n');
  return { status: statusLine.replace('STATUS ', '').trim(), stderr: rest.join('\n') };
}

test('check_the_world runs from a deleted cwd when CLAUDE_PROJECT_DIR names the root', () => {
  const box = mkdtempSync(join(tmpdir(), 'ctw-repo-'));
  writeFileSync(join(box, '.claudinite-settings.json'), JSON.stringify({ packs: [] }, null, 2));
  const { status, stderr } = fromDeletedCwd(['--list'], { CLAUDE_PROJECT_DIR: box });
  removeTree(box);
  assert.doesNotMatch(stderr, /uv_cwd/, 'the cwd call must not be reached at all');
  assert.equal(status, '0', `--list should succeed; stderr was:\n${stderr}`);
});

// `--root` is the explicit form and must still win — the env fallback is a fallback, not
// a new source of truth that could point a sweep at the wrong repo.
test('check_the_world prefers --root over CLAUDE_PROJECT_DIR', () => {
  const box = mkdtempSync(join(tmpdir(), 'ctw-repo-'));
  writeFileSync(join(box, '.claudinite-settings.json'), JSON.stringify({ packs: [] }, null, 2));
  const { status, stderr } = fromDeletedCwd(['--list', '--root', box], { CLAUDE_PROJECT_DIR: '/nonexistent-on-purpose' });
  removeTree(box);
  assert.doesNotMatch(stderr, /uv_cwd/);
  assert.equal(status, '0', stderr);
});
