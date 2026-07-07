import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

function sh(root, cmd, args, { allowFail = false } = {}) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && !allowFail) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${r.status}): ${r.stderr}`);
  }
  return r.status === 0 ? r.stdout : null;
}

const git = (root, ...args) => sh(root, 'git', args);
const gitTry = (root, ...args) => sh(root, 'git', args, { allowFail: true });

function resolveBaseRef(root) {
  for (const ref of ['origin/main', 'origin/master', 'main', 'master']) {
    if (gitTry(root, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`) !== null) return ref;
  }
  return null;
}

function lines(out) {
  return (out || '').split('\n').filter(Boolean);
}

export function loadConfig(root) {
  const path = join(root, '.claudinite-checks.json');
  if (!existsSync(path)) return { packs: [], rules: {}, accept: [], sharedConstants: [], error: null };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return {
      packs: Array.isArray(raw.packs) ? raw.packs : [],
      rules: raw.rules && typeof raw.rules === 'object' ? raw.rules : {},
      accept: Array.isArray(raw.accept) ? raw.accept : [],
      sharedConstants: Array.isArray(raw.sharedConstants) ? raw.sharedConstants : [],
      error: null,
    };
  } catch (e) {
    return { packs: [], rules: {}, accept: [], sharedConstants: [], error: e.message };
  }
}

export function buildContext({ root, mode = 'changed', baseOverride = null }) {
  root = resolve(root);
  const baseRef = baseOverride || resolveBaseRef(root);
  const mergeBase = baseRef ? (gitTry(root, 'merge-base', 'HEAD', baseRef) || '').trim() || null : null;
  // Diffing against HEAD keeps uncommitted work in scope even when no base branch resolves.
  const diffBase = mergeBase || 'HEAD';

  const tracked = lines(gitTry(root, 'ls-files'));
  const untracked = lines(gitTry(root, 'ls-files', '--others', '--exclude-standard'));

  let files;
  if (mode === 'all') {
    files = [...tracked, ...untracked];
  } else {
    const vsBase = lines(gitTry(root, 'diff', '--name-only', '--diff-filter=d', diffBase));
    files = [...new Set([...vsBase, ...untracked])];
  }
  files = files.filter((f) => existsSync(join(root, f)) && statSync(join(root, f)).isFile());

  const deleted = mergeBase ? lines(gitTry(root, 'diff', '--name-only', '--diff-filter=D', mergeBase)) : [];

  let commits = [];
  if (mergeBase) {
    const out = gitTry(root, 'log', '--format=%s%n%b%x00', `${mergeBase}..HEAD`);
    commits = (out || '').split('\0').map((m) => m.trim()).filter(Boolean);
  }

  const branch = (gitTry(root, 'rev-parse', '--abbrev-ref', 'HEAD') || '').trim();

  return {
    root,
    mode,
    baseRef,
    mergeBase,
    files,
    tracked,
    deleted,
    commits,
    branch,
    config: loadConfig(root),

    exists: (path) => existsSync(join(root, path)),
    read(path) {
      try { return readFileSync(join(root, path), 'utf8'); } catch { return null; }
    },

    // Added lines of one file relative to the scoping base (untracked file = every line).
    addedLines(file) {
      if (!tracked.includes(file)) {
        const text = this.read(file);
        return text === null ? [] : text.split('\n').map((t, i) => ({ line: i + 1, text: t }));
      }
      const out = gitTry(root, 'diff', '-U0', diffBase, '--', file);
      const added = [];
      let lineNo = 0;
      for (const l of (out || '').split('\n')) {
        const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
        if (hunk) { lineNo = Number(hunk[1]); continue; }
        if (l.startsWith('+') && !l.startsWith('+++')) { added.push({ line: lineNo, text: l.slice(1) }); lineNo += 1; }
        else if (!l.startsWith('-')) lineNo += l ? 1 : 0;
      }
      return added;
    },

    // Merge commits the current change introduces — those on HEAD's first-parent
    // chain since the merge-base with the base branch (the squash-only effect
    // check, scoped to the work). Empty when no base resolves or the branch is
    // even with it; pre-existing merges already on the base are out of range.
    introducedMergeCommits() {
      if (!mergeBase) return [];
      const out = gitTry(root, 'log', '--merges', '--first-parent', '--format=%h %s', `${mergeBase}..HEAD`);
      return lines(out).map((l) => {
        const i = l.indexOf(' ');
        return { sha: l.slice(0, i), subject: l.slice(i + 1) };
      });
    },

    // Fixed-string search across tracked files; git grep exits 1 on no match.
    grepTracked(needle) {
      const out = gitTry(root, 'grep', '-n', '-F', needle, '--', '.');
      return lines(out).map((l) => {
        const m = /^([^:]+):(\d+):(.*)$/.exec(l);
        return m ? { file: m[1], line: Number(m[2]), text: m[3] } : null;
      }).filter(Boolean);
    },
  };
}

export const pathDepth = (p) => (p === '.' || p === '' ? [] : p.split(sep));
