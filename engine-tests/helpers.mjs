import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadDeclaredChecks } from '../engine/checks/helpers/pattern-rules.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test',
  GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test',
  // No detached git process may outlive a fixture command (#235): auto-gc runs in
  // the foreground and the newer maintenance path stays off, so cleanup() never
  // races a background repack still writing into .git/objects. The rmSync
  // maxRetries below is the second line of defense, not the fix.
  GIT_CONFIG_COUNT: '2',
  GIT_CONFIG_KEY_0: 'gc.autoDetach', GIT_CONFIG_VALUE_0: 'false',
  GIT_CONFIG_KEY_1: 'maintenance.auto', GIT_CONFIG_VALUE_1: 'false',
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

// One declared check, by rule id, out of a pack's or skill's declared-checks.json
// — the test-side counterpart to the registry's structural discovery, so a test
// proves the same compiled rule object the runner runs. `dir` is repo-relative
// (`packs/aws-sam`). An unknown id is the test's bug, not a silent undefined.
export function declaredCheck(dir, id) {
  const rules = loadDeclaredChecks(join(repoRoot, dir));
  const rule = rules.find((r) => r.id === id);
  if (!rule) throw new Error(`${dir}/declared-checks.json declares no rule "${id}" (it has: ${rules.map((r) => r.id).join(', ')})`);
  return rule;
}

export function cleanup(root) {
  // maxRetries: under parallel `node --test`, git leaves transient files in the temp
  // repo's .git/* while this recursive rmdir walks it, so the delete intermittently
  // throws ENOTEMPTY. rmSync retries that error class with linear backoff — without it
  // a healthy run reddens CI (seen on PR #255).
  rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}
