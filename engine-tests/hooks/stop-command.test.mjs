import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup, makeTranscript } from '../helpers.mjs';

// This test lives at <repo>/engine-tests/hooks/; the real Stop command is at
// <repo>/engine/hooks/. The command self-locates its checks dir relative to
// itself, so running the real file against a scratch repo exercises the true
// wiring.
const STOP = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'engine', 'hooks', 'stop-command.mjs');

// Empty stdin → no hook payload → null transcript (conversation rules self-skip),
// which is all these fixtures need.
function runStop(root, transcriptPath = null) {
  return spawnSync(process.execPath, [STOP], {
    cwd: root, encoding: 'utf8',
    input: transcriptPath ? JSON.stringify({ transcript_path: transcriptPath }) : '',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
}

// A transcript where the session merged PR #42 after consulting a plan-tracking
// tracker (#100), with no post-merge checklist flip — the shape the post-merge
// trigger must not let slip past a clean tree.
const MERGED_UNSYNCED = [
  { type: 'assistant', timestamp: '2026-07-23T09:55:00Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'L1', name: 'mcp__github__list_issues', input: { owner: 'o', repo: 'r', labels: ['plan-tracking'], state: 'OPEN' } }] } },
  { type: 'user', timestamp: '2026-07-23T09:55:01Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'L1', content: '[{"number":100,"title":"tracker"}]' }] } },
  { type: 'assistant', timestamp: '2026-07-23T10:00:00Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'M1', name: 'mcp__github__merge_pull_request', input: { owner: 'o', repo: 'r', pullNumber: 42, merge_method: 'squash' } }] } },
];

test('post-merge trigger: a clean tree still runs the sweep when the transcript shows a merge', () => {
  // No diff vs main (a fresh feature branch, nothing committed) — the merge recipe
  // leaves exactly this clean state — so only the transcript merge-peek keeps the
  // hook from fast-exiting, letting plan-tracking-freshness fire on the unsynced tracker.
  const root = makeRepo({ base: { '.claudinite-checks.json': JSON.stringify({ packs: ['basics', 'grow_with_claudinite'] }) } });
  const { path, cleanup: rmTranscript } = makeTranscript(MERGED_UNSYNCED);
  try {
    const r = runStop(root, path);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /plan-tracking-freshness/);
  } finally { rmTranscript(); cleanup(root); }
});

test('post-merge trigger: a clean tree with no merge in the transcript keeps the fast path', () => {
  const root = makeRepo({ base: { '.claudinite-checks.json': JSON.stringify({ packs: ['basics', 'grow_with_claudinite'] }) } });
  const { path, cleanup: rmTranscript } = makeTranscript([
    { type: 'user', timestamp: '2026-07-23T10:00:00Z', message: { role: 'user', content: 'just chatting, no merge' } },
  ]);
  try {
    const r = runStop(root, path);
    assert.equal(r.status, 0, r.stderr);
  } finally { rmTranscript(); cleanup(root); }
});

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
