import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// This test lives at <repo>/engine-tests/mount/session-start.test.mjs; the
// script under test lives at <repo>/engine/mount/.
const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const ENGINE_MOUNT = join(dirname(dirname(TESTS_DIR)), 'engine', 'mount');

// A hermetic corpus mirroring the real layout: the REAL
// engine/mount/session-start.sh (it self-locates via BASH_SOURCE and resolves
// the mount-local prefs step beside itself, the rest beside it under the
// engine root — engine/packs, engine/skills) plus tiny STUB
// steps, so the test exercises the ORCHESTRATOR's own contract — sequence,
// stdout forwarding, lifecycle logging, exit 0 — without dragging in the real
// children and their dependencies.
function makeCorpus({ prefs = '#!/bin/bash\n', prose = '', skills = '', env = '', interview = '' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-sessionstart-'));
  mkdirSync(join(root, 'engine', 'mount'), { recursive: true });
  copyFileSync(join(ENGINE_MOUNT, 'session-start.sh'), join(root, 'engine', 'mount', 'session-start.sh'));
  mkdirSync(join(root, 'engine', 'packs'), { recursive: true });
  mkdirSync(join(root, 'engine', 'skills'), { recursive: true });
  writeFileSync(join(root, 'engine', 'mount', 'inject-preferences.sh'), prefs);
  writeFileSync(join(root, 'engine', 'packs', 'load-active-prose.mjs'), prose);
  writeFileSync(join(root, 'engine', 'skills', 'mount-skills.mjs'), skills);
  writeFileSync(join(root, 'engine', 'packs', 'env.mjs'), env);
  writeFileSync(join(root, 'engine', 'packs', 'interview.mjs'), interview);
  return root;
}

function run(corpus, projectDir, env = {}) {
  return spawnSync('bash', [join(corpus, 'engine', 'mount', 'session-start.sh')], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, CLAUDINITE_HOOK_RUN: 'testrun', ...env },
  });
}

test('orchestrator runs steps in order, forwards only step stdout, logs the lifecycle, exits 0', () => {
  const corpus = makeCorpus({
    prefs: '#!/bin/bash\necho PREFS\n',
    prose: 'process.stdout.write("PROSE\\n");',
  });
  const projectDir = mkdtempSync(join(tmpdir(), 'claudinite-proj-'));
  const r = run(corpus, projectDir);
  assert.equal(r.status, 0);
  // Only the steps' stdout reaches the hook's stdout (→ session context), in
  // order, followed by the one-line confirmation footer; the timestamped log
  // goes to stderr + the file, never stdout.
  assert.ok(r.stdout.startsWith('PREFS\nPROSE\n'), r.stdout);
  assert.match(r.stdout, /^Claudinite session-start: ran 5 steps \(inject-preferences, load-active-prose, mount-skills, env-check, interview-check\) at .+\.$/m);
  assert.doesNotMatch(r.stdout, /WARNING/); // all steps exited 0
  const log = readFileSync(join(projectDir, '.claudinite-hooks.log'), 'utf8');
  for (const s of [
    'run=testrun orchestrator: start',
    'inject-preferences: start', 'inject-preferences: done exit=0',
    'load-active-prose: start', 'load-active-prose: done exit=0',
    'mount-skills: start', 'env-check: start', 'interview-check: start',
    'run=testrun orchestrator: done',
  ]) assert.ok(log.includes(s), `log missing line: ${s}\n--- log ---\n${log}`);
});

test('a failing step never aborts the orchestrator nor turns the hook non-zero', () => {
  const corpus = makeCorpus({
    prefs: '#!/bin/bash\necho A\nexit 1\n', // a step exits non-zero...
    prose: 'process.stdout.write("B\\n");', // ...the rest still runs
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

// The REAL prefs step, standalone: local copy wins; a miss is fail-soft — a
// one-line plain-text note (never a halt directive, never a JSON envelope),
// because preferences are per-user nice-to-have, unlike the corpus itself.
test('inject-preferences: local copy wins; a miss injects a soft note, not a halt', () => {
  const corpus = mkdtempSync(join(tmpdir(), 'claudinite-prefs-'));
  mkdirSync(join(corpus, 'engine', 'mount'), { recursive: true });
  mkdirSync(join(corpus, 'preferences'), { recursive: true });
  copyFileSync(join(ENGINE_MOUNT, 'inject-preferences.sh'), join(corpus, 'engine', 'mount', 'inject-preferences.sh'));
  writeFileSync(join(corpus, 'preferences', 'me@example.com.md'), 'MY PREFS\n');
  const runPrefs = (email) => spawnSync('bash', [join(corpus, 'engine', 'mount', 'inject-preferences.sh')], {
    encoding: 'utf8',
    // An unreachable base forces the fetch path to fail fast and prove fail-soft.
    env: { ...process.env, CLAUDE_CODE_USER_EMAIL: email, CLAUDINITE_PREFS_URL: 'https://127.0.0.1:1/preferences' },
  });

  const local = runPrefs('me@example.com');
  assert.equal(local.status, 0);
  assert.match(local.stdout, /MY PREFS/);

  const miss = runPrefs('nobody@example.com');
  assert.equal(miss.status, 0);
  assert.match(miss.stdout, /PREFERENCES: no local copy and the fetch for nobody@example\.com failed/);
  assert.match(miss.stdout, /default interaction behavior/);
  assert.doesNotMatch(miss.stdout, /STOP|AskUserQuestion/);           // fail-soft, no halt-gate
  assert.doesNotMatch(miss.stdout, /hookSpecificOutput|additionalContext/); // plain text, no JSON envelope
});
