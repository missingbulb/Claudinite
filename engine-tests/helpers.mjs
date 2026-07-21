import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

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
