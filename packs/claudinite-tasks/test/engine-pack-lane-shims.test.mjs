import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The engine lane and the pack lane deliver in SEPARATE PRs on separate cycles, and
// pack delivery is version-gated per pack — so every member spends a window holding
// the new engine beside an old pack. A `packs/**` file importing an `engine/**`
// module is therefore a stale caller of an instantly-current engine, and an engine
// module it names may not simply vanish.
//
// It vanished once (#1004). `packs/claudinite-lifecycle/task-declaration-shape.mjs` imported
// the engine's own `slots.mjs`, #974 renamed that to `calendar.mjs`, and the next
// member to converge got a mount whose `core` pack would not load — which fails the
// self-test, which makes the converge refuse to land AT ALL, so the member could not
// even receive the pack version that would have fixed it.
//
// QUANTIFIED OVER HISTORY, NOT A LIST. Which symbols matter is a fact about the pack
// versions members are actually carrying, and members carry old ones — so the
// question is asked of every version of every pack file that ever REACHED the trunk,
// not of HEAD and not of a list someone remembers to update.
//
// The trunk, not `--all`: a member's pack version came from a release cut from the
// default branch, so an import that only ever existed on an unmerged branch is not a
// fielded import. Scanning every ref instead fires on whatever else is in flight —
// which is exactly what it did the first time this test ran.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64e6 });
const gitOk = (...args) => { try { git(...args); return true; } catch { return false; } };

// The trunk as this checkout can name it. CI checks out the PR head with full
// history and `origin/main` present; a local branch has it too. `HEAD` is the
// fallback rather than a hard failure, since a checkout without the remote ref is a
// worse-scoped run, not a broken one.
const TRUNK = gitOk('rev-parse', '--verify', 'origin/main') ? 'origin/main' : 'HEAD';

// Every `import { … } from '…/engine/<path>'` that any version of any packs/** file
// has ever carried, as `{ enginePath -> Set<symbol> }`.
function fieldedEngineImports() {
  // One log walk over the pack tree, with each commit's blobs; `-p` gives the diffs
  // and the added lines are what a member could have installed.
  const text = git('log', TRUNK, '--format=%H', '-p', '--unified=0', '--', 'packs/');
  const out = new Map();
  const RE = /^\+\s*import\s*\{([^}]*)\}\s*from\s*'[^']*?engine\/([^']+)'/;
  // A pack's tests live inside the pack and are dropped from every vendor set, so no
  // member ever holds one — their imports are not fielded, and counting them would
  // pin an engine symbol alive on the strength of a file nobody installs. The `+++`
  // header names the file each run of added lines belongs to.
  let file = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('+++ ')) { file = line.slice(4).replace(/^b\//, ''); continue; }
    if (file.endsWith('.test.mjs')) continue;
    const m = RE.exec(line);
    if (!m) continue;
    const path = `engine/${m[2].replace(/^(\.\.\/)+/, '')}`;
    const syms = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    if (!out.has(path)) out.set(path, new Set());
    for (const s of syms) out.get(path).add(s);
  }
  return out;
}

// A RETIRED PATH is one whose fielded callers were READ AND FOUND GONE — not one whose
// deletion was convenient. `engine/scheduler/*` moved to the tasks pack in #1317 and its
// shims came out at chain link L4, after L3 observed every member's stamp carrying the
// pack and a full queue cycle running from the new paths. Nothing goes in this list on
// the strength of "the current tree does not import it": the whole point of the scan is
// that the current tree is not what members are carrying.
const RETIRED = [/^engine\/scheduler\//];

test('every engine module a fielded pack version imports still resolves, with the symbols it named', async () => {
  // A SHALLOW checkout has no history to walk, so the scan would find nothing and
  // report clean — a green run that proved nothing. Say so instead: CI checks out
  // with `fetch-depth: 0` precisely so scans like this one can work.
  assert.ok(gitOk('rev-parse', `${TRUNK}~50`),
    `this checkout is too shallow to walk ${TRUNK}'s pack history — fetch with depth 0 before trusting this test`);

  const imports = fieldedEngineImports();
  assert.ok(imports.size > 0, 'the history walk found no pack->engine imports at all — the scan is broken, not the tree');

  const missing = [];
  for (const [path, symbols] of imports) {
    if (RETIRED.some((r) => r.test(path))) continue;
    let mod;
    try {
      mod = await import(join(ROOT, path));
    } catch (e) {
      missing.push(`${path} — cannot be imported at all (${e.code ?? e.message}); a pack that fails to load fails the mount's self-test`);
      continue;
    }
    for (const s of symbols) {
      if (!(s in mod)) missing.push(`${path} no longer exports \`${s}\``);
    }
  }
  assert.deepEqual(missing, [], `a fielded pack version imports these and would break mid-converge:\n  ${missing.join('\n  ')}`);
});

test('the frozen queue entry points re-export rather than re-declare, so they cannot drift', async () => {
  // `queue/` is workflow and routine ABI: a member's workflow names those paths
  // literally and moves only through a PR somebody merges, while the mount beside
  // it refreshes nightly. A shim that re-DECLARED anything would be a second copy
  // of the mechanism, delivered on the frozen path's cycle rather than the code's.
  const [shim, home] = await Promise.all([
    import(join(ROOT, 'packs/claudinite-tasks/queue/executor.mjs')),
    import(join(ROOT, 'packs/claudinite-tasks/src/execute/loop.mjs')),
  ]);
  assert.equal(shim.runExecutor, home.runExecutor, 'same function, not a copy');
  assert.equal(shim.runExecutorJob, home.runExecutorJob, 'the entry point the workflow runs is the real one');

  const [schedShim, schedHome] = await Promise.all([
    import(join(ROOT, 'packs/claudinite-tasks/queue/scheduler-run.mjs')),
    import(join(ROOT, 'packs/claudinite-tasks/src/schedule/run.mjs')),
  ]);
  assert.equal(schedShim.runSchedulerRun, schedHome.runSchedulerRun, 'same function, not a copy');
});
