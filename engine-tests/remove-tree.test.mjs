// The shared git-tree delete, and the guard that keeps it shared.
//
// This finding has been closed three times — #235, #258, #1219 — and came back
// twice, because each fix repaired the one call site that happened to fail while
// every other site kept spelling its own bare `rmSync`. So the interesting test
// here is not that `removeTree` works; it is the sweep below, which fails when a
// NEW site spells the delete itself.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeTree } from '../engine/remove-tree.mjs';
import { stripComments } from '../engine/checks/helpers/code-scanning.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const tracked = () => execFileSync('git', ['ls-files', '*.mjs'], { cwd: repoRoot, encoding: 'utf8' })
  .split('\n').filter(Boolean);

test('it removes a git working tree, and a second call is not an error', () => {
  const root = mkdtempSync(join(tmpdir(), 'remove-tree-'));
  execFileSync('git', ['init', '-q', root]);
  mkdirSync(join(root, 'nested'), { recursive: true });
  writeFileSync(join(root, 'nested', 'a.txt'), 'x');
  removeTree(root);
  assert.equal(existsSync(root), false);
  removeTree(root); // a `finally` may run twice; `force` makes that a no-op
});

// THE GUARD. A recursive delete written by hand is the bug; every one of them in
// this repo goes through `removeTree`. Comments are stripped first so a file that
// DOCUMENTS the hazard — this one, and remove-tree.mjs — does not trip it.
//
// Scoped to `git ls-files`, so a brand-new file is untracked and invisible here
// until it is added: a green run is not coverage of a file nobody staged.
test('no tracked module spells its own recursive delete', () => {
  const allowed = new Set([
    // The one implementation, which must call rmSync itself.
    'engine/remove-tree.mjs',
    // Deletes inside a generated child-process script, which has no imports of
    // ours to call: it runs `require('node:fs')` in a fresh process.
    'engine-tests/checks/check-the-world-root.test.mjs',
  ]);
  const offenders = [];
  for (const file of tracked()) {
    if (allowed.has(file)) continue;
    const src = stripComments(readFileSync(join(repoRoot, file), 'utf8'));
    for (const [i, line] of src.split('\n').entries()) {
      if (/rmSync\([^)]*recursive:\s*true/.test(line)) offenders.push(`${file}:${i + 1}`);
    }
  }
  assert.deepEqual(offenders, [],
    'these delete a tree by hand — call removeTree (engine/remove-tree.mjs) so the retry that keeps CI green applies');
});

// A guard that matches nothing is not a guard. The corpus must actually contain
// the calls it is watching over, or a refactor could empty its scope and leave it
// reading green forever.
test('the guard has a live scope: removeTree is what the repo actually calls', () => {
  const callers = tracked().filter((f) => f !== 'engine/remove-tree.mjs'
    && /removeTree\(/.test(readFileSync(join(repoRoot, f), 'utf8')));
  assert.ok(callers.length > 20, `only ${callers.length} file(s) call removeTree — has the sweep been reverted?`);
});
