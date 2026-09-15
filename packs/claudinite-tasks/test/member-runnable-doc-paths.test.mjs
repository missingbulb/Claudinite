import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// A MEMBER'S OWN PROSE IS A CALLER THIS REPOSITORY CANNOT REWRITE. When a canon doc
// spells a command as a literal mount path — `node .claudinite/shared/packs/<pack>/<x>.mjs`
// — members copy that line into their `.claudinite/local/packs/**`, where it becomes a
// caller of the vendored tree. The nightly converge refreshes `.claudinite/shared/` and
// nothing else, so moving the file it names leaves prose no converge can correct, in a
// repository no canon session reads.
//
// It happened at #1478. `queue/create-work-item.mjs` moved to `src/schedule/`, the canon's
// own three docs were swept with it, and Shepherd's local pack — three call sites nobody
// here could see — began failing `runnable-doc-commands` at BLOCKING on its next update.
// Nothing went red in this repository, because this repository's copies were correct.
//
// QUANTIFIED OVER HISTORY, NOT A LIST, for the same reason as the engine-lane scan beside
// it: which paths matter is a fact about what members copied, and they copied from
// versions this tree no longer has. A list at HEAD describes the one state that cannot be
// wrong, since HEAD's docs are exactly the copies a move sweeps.
//
// The trunk, not `--all`: prose reached a member only through a vendor set cut from the
// default branch, so a path that existed on an unmerged branch was never copied.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64e6 });
const gitOk = (...args) => { try { git(...args); return true; } catch { return false; } };

const TRUNK = gitOk('rev-parse', '--verify', 'origin/main') ? 'origin/main' : 'HEAD';

// Every mount path any version of any pack doc has told an agent to RUN, as
// `{ mountPath -> Set<doc that carried it> }`. `node` is the whole of the test for
// "runnable": a path merely mentioned in prose breaks nothing when it moves, and
// `runnable-doc-commands` draws that same line.
function fieldedRunnableMountPaths() {
  const text = git('log', TRUNK, '--format=%H', '-p', '--unified=0', '--', 'packs/');
  const out = new Map();
  const RE = /^\+.*\bnode\s+\.claudinite\/shared\/(packs\/[A-Za-z0-9/_.-]+\.mjs)/;
  let file = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('+++ ')) { file = line.slice(4).replace(/^b\//, ''); continue; }
    if (!file.endsWith('.md')) continue;
    const m = RE.exec(line);
    if (!m) continue;
    if (!out.has(m[1])) out.set(m[1], new Set());
    out.get(m[1]).add(file);
  }
  return out;
}

// A RETIRED path is one whose holders were reached and moved — an advisory fired in their
// own repository for a stated window, and the window closed. Never a path whose absence
// from HEAD's docs made it look unused.
const RETIRED = [];

// TRACKED is a path this scan found gone with no holder known and no shim available,
// carried under its own issue rather than silently waived. It differs from RETIRED in
// what is owed: a retired path is finished, a tracked one is a question — does any member
// still name it — that only a per-repo read can answer.
const TRACKED = [
  // The growth pack's rename left this behind; standing `packs/grow_with_claudinite/` up
  // again to re-export one module would resurrect the id the rename map retires (#2050).
  /^packs\/grow_with_claudinite\//,
];

test('every mount path a fielded canon doc told a member to run still resolves', () => {
  // A SHALLOW checkout has no history to walk, so the scan would find nothing and report
  // clean — a green run that proved nothing. CI checks out with `fetch-depth: 0`.
  assert.ok(gitOk('rev-parse', `${TRUNK}~50`),
    `this checkout is too shallow to walk ${TRUNK}'s doc history — fetch with depth 0 before trusting this test`);

  const paths = fieldedRunnableMountPaths();
  assert.ok(paths.size > 0, 'the history walk found no runnable mount paths at all — the scan is broken, not the tree');

  const missing = [];
  for (const [path, docs] of paths) {
    if (RETIRED.some((r) => r.test(path)) || TRACKED.some((r) => r.test(path))) continue;
    if (existsSync(join(ROOT, path))) continue;
    missing.push(`${path} — told to run by ${[...docs].sort().join(', ')}`);
  }

  assert.deepEqual(missing, [],
    `a member's local prose may still name these, and no converge can rewrite it:\n  ${missing.join('\n  ')}`);
});
