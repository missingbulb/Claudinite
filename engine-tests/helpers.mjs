import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const CANON_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOADER_DIR = join('engine', 'pack_loader');

/**
 * Copy the REAL pack loader into a fake corpus at `root`, so a test drives the
 * live discovery code against fixture packs. WHOLESALE, not module by module:
 * which files the registry needs is the loader's own business, and a fixture that
 * enumerates them goes stale silently the next time it gains one — the fake
 * corpus then fails soft to empty output, which reads as "the feature broke".
 * Tests are skipped; the pack.schema.json the loader validates against is not.
 */
export function copyPackLoader(root) {
  mkdirSync(join(root, LOADER_DIR), { recursive: true });
  for (const entry of readdirSync(join(CANON_ROOT, LOADER_DIR), { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.endsWith('.test.mjs')) continue;
    copyFileSync(join(CANON_ROOT, LOADER_DIR, entry.name), join(root, LOADER_DIR, entry.name));
  }
}

// Every canon pack plus this repo's own local packs, loaded once for the suite.
let loaded;

/**
 * One pack of this corpus, as the LOADER produces it: the manifest with its rule
 * filenames resolved to rule objects and its `detect` spec compiled to a
 * predicate. A test asks for a pack this way because `pack.json` is data — there
 * is no module to `import`, and a test that re-parsed the JSON itself would be
 * asserting a shape the engine never actually runs.
 */
export async function canonPack(id) {
  loaded ??= (await import('../engine/pack_loader/pack-registry.mjs')).loadPacks({ localRoot: CANON_ROOT });
  const pack = (await loaded).find((p) => p.id === id);
  if (pack === undefined) throw new Error(`no pack "${id}" in this corpus`);
  return pack;
}

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test',
  GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test',
};

export function git(root, ...args) {
  const r = spawnSync('git', args, { cwd: root, env: GIT_ENV, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

/**
 * `git` with the commit's author/committer date pinned to `epochSeconds`. History whose
 * commits all share one timestamp is ambiguous to git where dates break ties — most
 * visibly `merge-base`, which returns one of several equally-good answers — so a test
 * that depends on the shape of the graph pins the dates instead of racing the clock.
 */
export function gitDated(root, epochSeconds, ...args) {
  const stamp = `${epochSeconds} +0000`;
  const r = spawnSync('git', args, {
    cwd: root, encoding: 'utf8',
    env: { ...GIT_ENV, GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

export function writeFiles(root, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

/**
 * Scratch git repo: `base` files committed on main, then a feature branch with
 * `changed` files committed on top (message `commitMsg`). Mirrors the runner's
 * real scoping model — merge-base with `main` — without needing a remote.
 */
export function makeRepo({ base = {}, changed = {}, commitMsg = 'change Refs #1', uncommitted = {} }) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-checks-'));
  git(root, 'init', '-q', '-b', 'main');
  writeFiles(root, { 'README.md': 'seed\n', ...base });
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'seed');
  git(root, 'checkout', '-q', '-b', 'feature');
  if (Object.keys(changed).length) {
    writeFiles(root, changed);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', commitMsg);
  }
  writeFiles(root, uncommitted);
  return root;
}

export function deletePath(root, path, commitMsg = 'delete Refs #1') {
  git(root, 'rm', '-q', path);
  git(root, 'commit', '-q', '-m', commitMsg);
}

/**
 * Scratch session transcript (Claude Code JSONL) for conversation-surface
 * rules. Lives outside any scratch repo so it never appears in ctx.files.
 */
export function makeTranscript(entries) {
  const dir = mkdtempSync(join(tmpdir(), 'claudinite-transcript-'));
  const path = join(dir, 'session.jsonl');
  writeFileSync(path, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }) };
}

export function cleanup(root) {
  // maxRetries: under parallel `node --test`, git leaves transient files in the temp
  // repo's .git/* while this recursive rmdir walks it, so the delete intermittently
  // throws ENOTEMPTY. rmSync retries that error class with linear backoff — without it
  // a healthy run reddens CI (seen on PR #255).
  rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}
