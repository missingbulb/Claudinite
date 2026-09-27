import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, realpathSync } from 'node:fs';
import { makeRepo, makeTranscript, cleanup } from '../helpers.mjs';

// This test lives at <repo>/engine-tests/hooks/; the real Stop command is at
// <repo>/engine/hooks/. The command self-locates its checks dir relative to
// itself, so running the real file against a scratch repo exercises the true
// wiring.
const STOP = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'engine', 'hooks', 'stop-command.mjs');

// Empty stdin → no hook payload → null transcript (conversation rules self-skip),
// which is all these fixtures need.
function runStop(root) {
  return spawnSync(process.execPath, [STOP], {
    cwd: root, input: '', encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
}

test('the Stop hook runs the WORK scope only — a world finding does not fire here', () => {
  // doc.md dangles a link (reference-integrity, a WORK rule) and a.js carries a
  // bare suppression (warning-suppression, a WORLD rule). The Stop hook must
  // surface the work finding and block, and must NOT report the world one — that
  // rides the test/CI flow, not the per-turn hook.
  const root = makeRepo({
    changed: {
      'doc.md': '[gone](missing.md)\n',
      'a.js': '// eslint-disable-next-line no-undef\ny();\n',
      '.claudinite-settings.json': JSON.stringify({ packs: ['basics'] }), // @real-entity the real corpus the hook resolves its checks from
    },
  });
  try {
    const r = runStop(root);
    assert.equal(r.status, 2, r.stderr); // blocking findings block the stop
    assert.match(r.stderr, /reference-integrity/); // the work rule fired
    assert.doesNotMatch(r.stderr, /warning-suppression/); // the world rule did NOT
  } finally { cleanup(root); }
});

test('the Stop hook exits 0 when the work scope is clean, even with an outstanding world finding', () => {
  // Only a world violation (bare suppression) and a clean, issue-referencing
  // change: nothing in the work scope fires, so the stop is allowed through.
  const root = makeRepo({
    changed: {
      'a.js': '// eslint-disable-next-line no-undef\ny();\n',
      '.claudinite-settings.json': JSON.stringify({ packs: ['basics'] }), // @real-entity the real corpus the hook resolves its checks from
    },
  });
  try {
    const r = runStop(root);
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /warning-suppression/);
  } finally { cleanup(root); }
});

// --- the rules-loaded probe, once per session --------------------------------

const PROSE = '.claudinite/local/packs/acme-pack/RULES.md';

function runStopWith(root, transcriptPath) {
  return spawnSync(process.execPath, [STOP], {
    cwd: root, input: JSON.stringify({ transcript_path: transcriptPath }), encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
}

// A clean tree on purpose: a first turn that only answered a question changes
// nothing, and the load must still be judged.
function repoWithProse() {
  return makeRepo({
    base: {
      [PROSE]: '# acme\n\n- **Doing a thing** — do it well. (doing-thing)\n',
      '.claudinite/local/packs/acme-pack/pack.mjs': 'export default {};\n',
      '.claudinite-settings.json': JSON.stringify({ packs: ['local/acme-pack'] }),
    },
  });
}

const loadedEntry = (files) => ({
  type: 'attachment', timestamp: new Date(Date.now() + 60_000).toISOString(),
  attachment: { type: 'instructions', files },
});

test('the Stop hook blocks once on a session whose pack rules never loaded, then only advises', () => {
  const root = repoWithProse();
  const t = makeTranscript([{ type: 'attachment', attachment: { type: 'date' } }, loadedEntry([])]);
  try {
    const first = runStopWith(root, t.path);
    assert.equal(first.status, 2, first.stderr);
    assert.match(first.stderr, /never loaded: acme-pack/);
    const second = runStopWith(root, t.path);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /never loaded: acme-pack/);
  } finally { cleanup(root); t.cleanup(); }
});

test('the Stop hook stays silent on a session that loaded every active pack\'s rules', () => {
  const root = repoWithProse();
  const path = realpathSync(join(root, PROSE));
  const t = makeTranscript([loadedEntry([{ path, content: readFileSync(path, 'utf8') }])]);
  try {
    const r = runStopWith(root, t.path);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), '');
  } finally { cleanup(root); t.cleanup(); }
});
