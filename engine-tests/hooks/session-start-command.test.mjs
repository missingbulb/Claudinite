import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// This test lives at <repo>/engine-tests/hooks/session-start-command.test.mjs.
const HOOKS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'engine', 'hooks');

// A hermetic corpus mirroring the real layout: the REAL engine/hooks/session-start-command.sh
// (it self-locates via BASH_SOURCE and resolves every step one level up at the
// corpus root) plus tiny STUB
// steps, so the test exercises the ORCHESTRATOR's own contract — sequence,
// stdout forwarding, lifecycle logging, exit 0 — without dragging in the real
// children and their dependencies.
function makeCorpus({ packStart = '', prose = '', skills = '', env = '', interview = '', selftest = '' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-sessionstart-'));
  mkdirSync(join(root, 'engine', 'hooks'), { recursive: true });
  mkdirSync(join(root, 'engine', 'pack_loader'), { recursive: true });
  copyFileSync(join(HOOKS_DIR, 'session-start-command.sh'), join(root, 'engine', 'hooks', 'session-start-command.sh'));
  writeFileSync(join(root, 'engine', 'selftest.mjs'), selftest);
  writeFileSync(join(root, 'engine', 'pack_loader', 'run-pack-session-start.mjs'), packStart);
  writeFileSync(join(root, 'engine', 'pack_loader', 'inject-pack-prose.mjs'), prose);
  writeFileSync(join(root, 'engine', 'pack_loader', 'mount-skills.mjs'), skills);
  writeFileSync(join(root, 'engine', 'pack_loader', 'env-requirements.mjs'), env);
  // The interview machinery is the adoption skill's, bundled in the lifecycle pack.
  mkdirSync(join(root, 'packs', 'grow_with_claudinite', 'skills', 'adopt-claudinite'), { recursive: true });
  writeFileSync(join(root, 'packs', 'grow_with_claudinite', 'skills', 'adopt-claudinite', 'interview.mjs'), interview);
  return root;
}

function run(corpus, projectDir, env = {}) {
  return spawnSync('bash', [join(corpus, 'engine', 'hooks', 'session-start-command.sh')], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, CLAUDINITE_HOOK_RUN: 'testrun', ...env },
  });
}

test('orchestrator runs steps in order, forwards only step stdout, logs the lifecycle, exits 0', () => {
  const corpus = makeCorpus({
    prose: 'process.stdout.write("PROSE\\n");',
    packStart: 'process.stdout.write("PACKSTEP\\n");',
  });
  const projectDir = mkdtempSync(join(tmpdir(), 'claudinite-proj-'));
  const r = run(corpus, projectDir);
  assert.equal(r.status, 0);
  // Only the steps' stdout reaches the hook's stdout (→ session context), in
  // order, followed by the one-line confirmation footer; the timestamped log
  // goes to stderr + the file, never stdout.
  assert.ok(r.stdout.startsWith('PROSE\nPACKSTEP\n'), r.stdout);
  assert.match(r.stdout, /^Claudinite session-start: ran 6 steps \(selftest, load-active-prose, pack-session-start, mount-skills, env-check, interview-check\) at .+\.$/m);
  assert.doesNotMatch(r.stdout, /WARNING/); // all steps exited 0
  const log = readFileSync(join(projectDir, '.claudinite-hooks.log'), 'utf8');
  for (const s of [
    'run=testrun orchestrator: start',
    'selftest: start', 'selftest: done exit=0',
    'load-active-prose: start', 'load-active-prose: done exit=0',
    'pack-session-start: start', 'pack-session-start: done exit=0',
    'mount-skills: start', 'env-check: start', 'interview-check: start',
    'run=testrun orchestrator: done',
  ]) assert.ok(log.includes(s), `log missing line: ${s}\n--- log ---\n${log}`);
});

test('a failing step never aborts the orchestrator nor turns the hook non-zero', () => {
  const corpus = makeCorpus({
    prose: 'process.stdout.write("A\\n"); process.exit(1);', // a step exits non-zero...
    packStart: 'process.stdout.write("B\\n");',              // ...the rest still runs
  });
  const projectDir = mkdtempSync(join(tmpdir(), 'claudinite-proj-'));
  const r = run(corpus, projectDir);
  assert.equal(r.status, 0);            // a non-zero SessionStart exit would discard the context
  assert.ok(r.stdout.startsWith('A\nB\n'), r.stdout); // later steps still ran and forwarded
  // The footer flags the crashed step so a semantic failure is visible in-context.
  assert.match(r.stdout, /WARNING: load-active-prose exited 1/);
  const log = readFileSync(join(projectDir, '.claudinite-hooks.log'), 'utf8');
  assert.ok(log.includes('load-active-prose: done exit=1'), log);
});
