import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { removeTree } from '../../engine/remove-tree.mjs';

const STEP = join(dirname(fileURLToPath(import.meta.url)), '../../packs/claude-code-web-users-support/session-start.mjs');

// The pack's session-start step, run exactly as the engine runs it: a subprocess,
// handed its own entry config in CLAUDINITE_PACK_CONFIG and the session's identity in
// CLAUDE_CODE_USER_EMAIL. Everything below is one of the ways it can miss, because
// every one of them must be fail-soft — the step contributes a nicety, and a nicety
// that can stop a session from starting is a defect, not a feature.
const run = (project, { email = 'me@example.com', config = {}, ...extra } = {}) => spawnSync('node', [STEP], {
  encoding: 'utf8',
  env: {
    ...process.env,
    CLAUDE_PROJECT_DIR: project,
    CLAUDE_CODE_USER_EMAIL: email,
    CLAUDINITE_PACK_CONFIG: JSON.stringify(config),
    // An unreachable base forces the fetch path to fail fast and prove fail-soft.
    CLAUDINITE_PREFS_URL: 'https://127.0.0.1:1/preferences',
    ...extra,
  },
});

const project = () => mkdtempSync(join(tmpdir(), 'claudinite-prefs-'));

test('the store is read locally when this tree IS the store', () => {
  // The working copy wins: in the store repo itself, a fetch would serve the default
  // branch and quietly hide the edit the owner is making right now.
  const root = project();
  try {
    mkdirSync(join(root, 'preferences'), { recursive: true });
    writeFileSync(join(root, 'preferences', 'me@example.com.md'), 'MY PREFS\n');
    const r = run(root, { config: { repo: 'owner/store' } });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /MY PREFS/);
  } finally { removeTree(root); }
});

test('a declared path is honoured, not just the default', () => {
  const root = project();
  try {
    mkdirSync(join(root, 'team', 'people'), { recursive: true });
    writeFileSync(join(root, 'team', 'people', 'me@example.com.md'), 'ELSEWHERE\n');
    assert.match(run(root, { config: { repo: 'owner/store', path: 'team/people' } }).stdout, /ELSEWHERE/);
  } finally { removeTree(root); }
});

test('no file for this person is a soft note, never a halt', () => {
  const root = project();
  try {
    const r = run(root, { email: 'nobody@example.com', config: { repo: 'owner/store' } });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /USER PREFERENCES: nobody@example\.com at owner\/store could not be read/);
    assert.match(r.stdout, /default interaction behavior/);
    assert.doesNotMatch(r.stdout, /STOP|AskUserQuestion/);              // fail-soft, no halt-gate
    assert.doesNotMatch(r.stdout, /hookSpecificOutput|additionalContext/); // plain text, no JSON envelope
  } finally { removeTree(root); }
});

test('no configured store is an ordinary state — a project may have none', () => {
  const root = project();
  try {
    for (const config of [{}, { repo: 'not-a-repo' }, { repo: 'o/n', path: '../escape' }]) {
      const r = run(root, { config });
      assert.equal(r.status, 0);
      assert.match(r.stdout, /declares no preferences store/, JSON.stringify(config));
    }
    // A malformed hand-off is the same case, not a crash.
    const r = run(root, { CLAUDINITE_PACK_CONFIG: 'not json' });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /declares no preferences store/);
  } finally { removeTree(root); }
});

test('no usable identity means there is nothing to look up', () => {
  const root = project();
  try {
    const unset = run(root, { email: '', config: { repo: 'owner/store' } });
    assert.equal(unset.status, 0);
    assert.match(unset.stdout, /CLAUDE_CODE_USER_EMAIL is not set/);

    // The identity becomes a path and a URL component — an implausible one is refused
    // rather than traversed with.
    const traversal = run(root, { email: '../../../etc/passwd', config: { repo: 'owner/store' } });
    assert.equal(traversal.status, 0);
    assert.match(traversal.stdout, /is not a usable file name/);
  } finally { removeTree(root); }
});

test('the loaded preferences are weighed onto the engine facet channel', () => {
  // The session's opening summary states how much loaded, and states it in TOKENS,
  // because a context window is what every part of the load is spent against. This
  // is the only thing in the session that can weigh these: the file came from
  // another repository.
  const root = project();
  try {
    mkdirSync(join(root, 'preferences'), { recursive: true });
    // 76 words: 2 in the title, 2 in the heading, 3 of bullet-and-bold markup, and
    // 69 of prose — 101 tokens at the ratio, stated as 100 on the facet's rounding.
    writeFileSync(join(root, 'preferences', 'me@example.com.md'), [
      '# Prefs', '', '## Preferences', '',
      `- **First** — ${Array.from({ length: 69 }, (_, i) => `w${i}`).join(' ')}`,
      '',
    ].join('\n'));
    const r = run(root, { config: { repo: 'owner/store' } });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^CLAUDINITE-FACET: 100 personal preference tokens$/m);
    assert.match(r.stdout, /## Preferences/);                           // the content still lands
  } finally { removeTree(root); }
});

test('prose weighs the same as bullets — the window does not care about markup', () => {
  // Counting bullets would call this file empty. It is not: it is in the window,
  // and the facet reports what being in the window costs.
  const root = project();
  try {
    mkdirSync(join(root, 'preferences'), { recursive: true });
    writeFileSync(join(root, 'preferences', 'me@example.com.md'), 'Just prose, no bullets.\n');
    const r = run(root, { config: { repo: 'owner/store' } });
    assert.match(r.stdout, /^CLAUDINITE-FACET: \d+ personal preference tokens$/m);
  } finally { removeTree(root); }
});

test('a file with no words at all states no facet', () => {
  const root = project();
  try {
    mkdirSync(join(root, 'preferences'), { recursive: true });
    writeFileSync(join(root, 'preferences', 'me@example.com.md'), '  \n\n \t\n');
    const r = run(root, { config: { repo: 'owner/store' } });
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /CLAUDINITE-FACET/);
  } finally { removeTree(root); }
});
