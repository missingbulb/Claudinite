import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup } from '../helpers.mjs';

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
      '.claudinite-checks.json': JSON.stringify({ packs: ['basics'] }),
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
      '.claudinite-checks.json': JSON.stringify({ packs: ['basics'] }),
    },
  });
  try {
    const r = runStop(root);
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /warning-suppression/);
  } finally { cleanup(root); }
});
