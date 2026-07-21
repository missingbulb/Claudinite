import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// This test lives at <repo>/engine/hooks/session-start.test.mjs.
const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));

// A hermetic corpus mirroring the real layout: the REAL engine/hooks/session-start.sh
// (it self-locates via BASH_SOURCE and resolves the mount-local prefs step
// beside itself, the rest one level up at the corpus root) plus tiny STUB
// steps, so the test exercises the ORCHESTRATOR's own contract — sequence,
// stdout forwarding, lifecycle logging, exit 0 — without dragging in the real
// children and their dependencies.
function makeCorpus({ prefs = '#!/bin/bash\n', prose = '', skills = '', env = '', interview = '' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-sessionstart-'));
  mkdirSync(join(root, 'engine', 'hooks'), { recursive: true });
  mkdirSync(join(root, 'engine', 'pack_loader'), { recursive: true });
  mkdirSync(join(root, 'engine', 'skill_loader'), { recursive: true });
  copyFileSync(join(HOOKS_DIR, 'session-start.sh'), join(root, 'engine', 'hooks', 'session-start.sh'));
  writeFileSync(join(root, 'engine', 'hooks', 'inject-preferences.sh'), prefs);
  writeFileSync(join(root, 'engine', 'pack_loader', 'load-active-prose.mjs'), prose);
  writeFileSync(join(root, 'engine', 'skill_loader', 'mount-skills.mjs'), skills);
  writeFileSync(join(root, 'engine', 'pack_loader', 'env.mjs'), env);
  // The interview machinery is the adoption skill's, bundled in the lifecycle pack.
  mkdirSync(join(root, 'packs', 'grow_with_claudinite', 'skills', 'adopt-claudinite'), { recursive: true });
  writeFileSync(join(root, 'packs', 'grow_with_claudinite', 'skills', 'adopt-claudinite', 'interview.mjs'), interview);
  return root;
}

function run(corpus, projectDir, env = {}) {
  return spawnSync('bash', [join(corpus, 'engine', 'hooks', 'session-start.sh')], {
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
  mkdirSync(join(corpus, 'engine', 'hooks'), { recursive: true });
  mkdirSync(join(corpus, 'preferences'), { recursive: true });
  copyFileSync(join(HOOKS_DIR, 'inject-preferences.sh'), join(corpus, 'engine', 'hooks', 'inject-preferences.sh'));
  writeFileSync(join(corpus, 'preferences', 'me@example.com.md'), 'MY PREFS\n');
  const runPrefs = (email) => spawnSync('bash', [join(corpus, 'engine', 'hooks', 'inject-preferences.sh')], {
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
