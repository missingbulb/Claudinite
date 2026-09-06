// The pack-version-bump entry point: cut a new version for every pack on the shelf
// whose shipping content moved since its version last did, in one commit straight
// onto the base branch. Run by the canon's push-to-main workflow the moment a merge
// lands, and as this task's daily code-work for the merges GitHub turns into no push
// run (a pull request the queue lands with the Action's own token).
//
// The decision — which packs, which numbers — is `../../pack-versions.mjs`; this
// file is the I/O shell around it: fetch the base tip with enough history to find
// each pack's last bump, commit the new manifests onto that tip with git plumbing,
// push without force, and try again from the new tip when the branch moved under
// the push. Nothing here touches the checkout: one executor run drains several items
// from one working tree, so the commit is built in a throwaway index against the
// fetched tip, exactly as the generated-file lane does.

import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { remoteUrl, withTaskTrailer } from '../../../claudinite-tasks/shared-code/delivery.mjs';
import { planBumps, bumpSubject, BUMP_TASK } from '../../pack-versions.mjs';

const item = process.env.CLAUDINITE_ITEM || '';
const log = (s) => console.log(`pack-version-bump${item ? ` [#${item}]` : ''}: ${s}`);

export const makeGit = (root) => (args, opts = {}) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8',
  stdio: [opts.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  ...opts,
});

// The base branch's remote tip, with the whole first-parent history behind it: the
// walk stops at each pack's last bump, which for a quiet pack can be months back,
// and an Actions checkout is one commit deep. Unshallowing is a fetch the size of the
// repository once and a no-op after; on a complete clone the plain fetch is enough.
export function fetchBase(git, remote, base) {
  const shallow = git(['rev-parse', '--is-shallow-repository']).trim() === 'true';
  git(['fetch', '--quiet', ...(shallow ? ['--unshallow'] : []), remote, base]);
  return git(['rev-parse', 'FETCH_HEAD']).trim();
}

// Commit `files` ({ path: content }) onto `baseSha` and push the result to `branch`
// as a fast-forward. Returns the commit, or null when the remote refused the push
// because the branch had moved — the caller replans from the new tip.
//
// `date` is the run's own clock, and the commit is stamped with it rather than with
// git's: a version's DATE is read back off this commit (`bumpCommits`'s `%cs`), so a
// second clock here lets a run cut a version numbered from one day and dated another.
export function pushOnto(git, { remote, baseSha, branch, files, message, date = new Date() }) {
  const index = join(tmpdir(), `claudinite-bump-${process.pid}-${Date.now()}.index`);
  const plumb = (args, opts) => git(args, { ...opts, env: { ...process.env, GIT_INDEX_FILE: index } });
  try {
    plumb(['read-tree', baseSha]);
    for (const [path, content] of Object.entries(files)) {
      const blob = git(['hash-object', '-w', '--stdin'], { input: content }).trim();
      plumb(['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`]);
    }
    const tree = plumb(['write-tree']).trim();
    const stamp = date.toISOString();
    const commit = git([
      '-c', 'user.name=claudinite[bot]', '-c', 'user.email=claudinite@users.noreply.github.com',
      'commit-tree', tree, '-p', baseSha, '-m', message,
    ], { env: { ...process.env, GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp } }).trim();
    try {
      git(['push', '--quiet', remote, `${commit}:refs/heads/${branch}`]);
    } catch (e) {
      if (/rejected|fetch first|non-fast-forward|stale info/i.test(String(e.stderr ?? e.message))) return null;
      throw e;
    }
    return commit;
  } finally { rmSync(index, { force: true }); }
}

// One pass: plan against the fetched tip, commit, push. `attempts` bounds the replans
// a moving base branch can cost; a busy canon lands a handful of merges an hour, so
// three is generous and a fourth rejection is worth a red run. `git` is injectable
// so a test can move the branch between the plan and the push.
export async function run({ root, remote, base, today = new Date(), attempts = 3, log: say = log, git = makeGit(root) }) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const tip = fetchBase(git, remote, base);
    const bumps = planBumps(git, tip, { today });
    if (!bumps.length) {
      say(`${base} at ${tip.slice(0, 10)}: every pack's version already covers its content — nothing to bump`);
      return { bumped: [], commit: null };
    }
    for (const b of bumps) say(`${b.id}: ${b.from} → ${b.to} (${b.changed.length} shipping file(s) changed since ${b.from})`);
    const files = Object.fromEntries(bumps.map((b) => [b.manifest, b.text]));
    const commit = pushOnto(git, { remote, baseSha: tip, branch: base, files, message: withTaskTrailer(bumpSubject(bumps), BUMP_TASK), date: today });
    if (commit) {
      say(`pushed ${commit.slice(0, 10)} onto ${base}`);
      return { bumped: bumps.map((b) => ({ id: b.id, from: b.from, to: b.to })), commit };
    }
    say(`${base} moved under the push (attempt ${attempt} of ${attempts}) — replanning from its new tip`);
  }
  throw new Error(`${base} kept moving under ${attempts} pushes — run again`);
}

export async function main() {
  const root = process.env.CLAUDINITE_REPO_ROOT || process.cwd();
  const repo = process.env.CLAUDINITE_REPO || process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const base = process.env.CLAUDINITE_DEFAULT_BRANCH || 'main';
  if (!repo) throw new Error('CLAUDINITE_REPO / GITHUB_REPOSITORY is not set (owner/repo)');
  if (!token) throw new Error('GITHUB_TOKEN is not set — the bump cannot push to the base branch');
  await run({ root, remote: remoteUrl(repo, token), base });
}

// Run only when invoked directly (`node worker.mjs`), never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`pack-version-bump failed: ${e.message}`); process.exit(1); });
}
