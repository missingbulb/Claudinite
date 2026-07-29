import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// This test lives at <repo>/engine/hooks/session-start-command.test.mjs.
const HOOKS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'engine', 'hooks');

// A hermetic corpus mirroring the real layout: the REAL engine/hooks/session-start-command.sh
// (it self-locates via BASH_SOURCE and resolves the mount-local prefs step
// beside itself, the rest one level up at the corpus root) plus tiny STUB
// steps, so the test exercises the ORCHESTRATOR's own contract — sequence,
// stdout forwarding, lifecycle logging, exit 0 — without dragging in the real
// children and their dependencies.
function makeCorpus({ prefs = '', prose = '', skills = '', env = '', interview = '', selftest = '' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-sessionstart-'));
  mkdirSync(join(root, 'engine', 'hooks'), { recursive: true });
  mkdirSync(join(root, 'engine', 'pack_loader'), { recursive: true });
  copyFileSync(join(HOOKS_DIR, 'session-start-command.sh'), join(root, 'engine', 'hooks', 'session-start-command.sh'));
  mkdirSync(join(root, 'engine', 'hooks', 'steps'), { recursive: true });
  writeFileSync(join(root, 'engine', 'selftest.mjs'), selftest);
  writeFileSync(join(root, 'engine', 'hooks', 'steps', 'inject-preferences.mjs'), prefs);
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
    prefs: 'process.stdout.write("PREFS\\n");',
    prose: 'process.stdout.write("PROSE\\n");',
  });
  const projectDir = mkdtempSync(join(tmpdir(), 'claudinite-proj-'));
  const r = run(corpus, projectDir);
  assert.equal(r.status, 0);
  // Only the steps' stdout reaches the hook's stdout (→ session context), in
  // order, followed by the one-line confirmation footer; the timestamped log
  // goes to stderr + the file, never stdout.
  assert.ok(r.stdout.startsWith('PREFS\nPROSE\n'), r.stdout);
  assert.match(r.stdout, /^Claudinite session-start: ran 6 steps \(selftest, inject-preferences, load-active-prose, mount-skills, env-check, interview-check\) at .+\.$/m);
  assert.doesNotMatch(r.stdout, /WARNING/); // all steps exited 0
  const log = readFileSync(join(projectDir, '.claudinite-hooks.log'), 'utf8');
  for (const s of [
    'run=testrun orchestrator: start',
    'selftest: start', 'selftest: done exit=0',
    'inject-preferences: start', 'inject-preferences: done exit=0',
    'load-active-prose: start', 'load-active-prose: done exit=0',
    'mount-skills: start', 'env-check: start', 'interview-check: start',
    'run=testrun orchestrator: done',
  ]) assert.ok(log.includes(s), `log missing line: ${s}\n--- log ---\n${log}`);
});

test('a failing step never aborts the orchestrator nor turns the hook non-zero', () => {
  const corpus = makeCorpus({
    prefs: 'process.stdout.write("A\\n"); process.exit(1);', // a step exits non-zero...
    prose: 'process.stdout.write("B\\n");',                  // ...the rest still runs
  });
  const projectDir = mkdtempSync(join(tmpdir(), 'claudinite-proj-'));
  const r = run(corpus, projectDir);
  assert.equal(r.status, 0);            // a non-zero SessionStart exit would discard the context
  assert.ok(r.stdout.startsWith('A\nB\n'), r.stdout); // later steps still ran and forwarded
  // The footer flags the crashed step so a semantic failure is visible in-context.
  assert.match(r.stdout, /WARNING: inject-preferences exited 1/);
  const log = readFileSync(join(projectDir, '.claudinite-hooks.log'), 'utf8');
  assert.ok(log.includes('inject-preferences: done exit=1'), log);
});

// The REAL prefs step (run from the real tree — it imports the engine's one pointer
// resolver, so a hermetic copy of the file alone would not resolve): the project's
// DECLARED home decides where to look, a local copy wins, and every miss is fail-soft —
// a one-line plain-text note (never a halt directive, never a JSON envelope), because
// preferences are per-user nice-to-have, unlike the corpus itself.
const STEP = join(HOOKS_DIR, 'steps', 'inject-preferences.mjs');
const runPrefs = (projectDir, email, extraEnv = {}) => spawnSync('node', [STEP], {
  encoding: 'utf8',
  env: {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    CLAUDE_CODE_USER_EMAIL: email,
    // An unreachable base forces the fetch path to fail fast and prove fail-soft.
    CLAUDINITE_PREFS_URL: 'https://127.0.0.1:1/preferences',
    ...extraEnv,
  },
});
const project = (declaration) => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-prefs-'));
  if (declaration) writeFileSync(join(root, '.claudinite-checks.json'), `${JSON.stringify(declaration, null, 2)}\n`);
  return root;
};

test('inject-preferences: the declared home is read locally when this tree carries it', () => {
  // The preferences home repo itself: the working copy is what the owner is editing,
  // so it wins over anything the default branch would serve.
  const root = project({ packs: [], preferences: { repo: 'owner/fleet-repo' } });
  mkdirSync(join(root, 'preferences'), { recursive: true });
  writeFileSync(join(root, 'preferences', 'me@example.com.md'), 'MY PREFS\n');

  const local = runPrefs(root, 'me@example.com');
  assert.equal(local.status, 0);
  assert.match(local.stdout, /MY PREFS/);

  const miss = runPrefs(root, 'nobody@example.com');
  assert.equal(miss.status, 0);
  assert.match(miss.stdout, /PREFERENCES: nobody@example\.com at owner\/fleet-repo could not be read/);
  assert.match(miss.stdout, /default interaction behavior/);
  assert.doesNotMatch(miss.stdout, /STOP|AskUserQuestion/);           // fail-soft, no halt-gate
  assert.doesNotMatch(miss.stdout, /hookSpecificOutput|additionalContext/); // plain text, no JSON envelope
});

test('inject-preferences: no declared home is an ordinary state, not a fault', () => {
  // A project with no fleet behind it has no preferences home. Same for a declaration
  // that isn't there at all (pre-adoption) — one calm line, and the session proceeds.
  for (const root of [project({ packs: ['basics'] }), project(null)]) {
    const r = runPrefs(root, 'me@example.com');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /PREFERENCES: this project declares no preferences home/);
    assert.doesNotMatch(r.stdout, /STOP|AskUserQuestion/);
  }
});

test('inject-preferences: no usable email means nothing to look up', () => {
  const root = project({ packs: [], preferences: { repo: 'owner/fleet-repo' } });
  const unset = runPrefs(root, '');
  assert.equal(unset.status, 0);
  assert.match(unset.stdout, /CLAUDE_CODE_USER_EMAIL is not set/);

  // The address becomes a path and a URL component — an implausible one is refused
  // rather than traversed with.
  const traversal = runPrefs(root, '../../../etc/passwd');
  assert.equal(traversal.status, 0);
  assert.match(traversal.stdout, /is not a usable file name/);
});
