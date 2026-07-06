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

export function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}
