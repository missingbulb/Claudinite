// The publish-pages code-work entry point — the script the executor runs as
// `node worker.mjs` (cwd = this task dir, bounded by code_work_timeout).
//
// Four steps, each of which has to succeed before the next is worth starting:
//
//   1. BUILD. `build-site.mjs` assembles the site into a scratch directory. A
//      declaration the build refuses (no `mode`, a contradicting roster) fails here,
//      in the executor's log. A mount that does not yet carry the page is the build's
//      own "nothing to publish", and the run ends there as an empty outcome.
//   2. PUSH. The built tree becomes one root commit force-pushed to `gh-pages`, which
//      is how it reaches the deploy's runner: the workflow checks that branch out and
//      uploads it as the Pages artifact. No history — the branch holds the last build
//      and nothing else — and the push uses the Action's own token, `contents: write`
//      being the executor's already.
//   3. DISPATCH the seeded workflow on the default branch. `workflow_dispatch` is one
//      of the two events the Action's own token may fire, so no wider credential is
//      involved; the executor already holds `actions: write` for the queue's chaining.
//   4. FOLLOW the run to a terminal state. A dispatch answers 204 whether or not the
//      deploy will work, and a Pages deploy fails for exactly one non-code reason —
//      Pages not enabled with source "GitHub Actions", a repository setting no Action
//      can flip. That failure parks as an action for a person; any other parks as a
//      failure with the run's URL, where the trace is.
//
// Runnable by hand from anywhere, given a token that may push `gh-pages` and dispatch:
//   GITHUB_TOKEN=… CLAUDINITE_REPO=owner/name CLAUDINITE_REPO_ROOT=/path/to/member node worker.mjs

import { execFileSync, spawn } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeGh, dispatchWorkflow } from '../../../claudinite-tasks/shared-code/github.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// The site assembler, in the pack above this task, and the workflow adoption seeded.
// One canonical spelling of each; nothing else here names them.
export const BUILD_SCRIPT = resolve(HERE, '../../build-site.mjs');
export const WORKFLOW_FILE = 'claudinite-dashboard-pages.yml';

// The branch that carries the built tree to the deploy's runner — the one the seeded
// workflow checks out, so not configurable: a member that changed it here would move
// the build out from under the workflow it cannot converge.
export const PAGES_BRANCH = 'gh-pages';

// A record of what the branch holds, at the site root beside `.nojekyll`.
export const STAMP_FILE = 'deployed.json';

// A park the operator can act on, in the executor's own vocabulary: the last marker
// printed decides the lane. `action` means something outside the code must change
// before this can run; `decision` means the run stopped and the next step is a choice.
export class NeedsHuman extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

const item = process.env.CLAUDINITE_ITEM || '';
const defaultLog = (s) => console.log(`publish-pages${item ? ` [#${item}]` : ''}: ${s}`);

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const remoteUrl = (repo, token) => `https://x-access-token:${token}@github.com/${repo}.git`;

// --- 1. build --------------------------------------------------------------------

// Run the assembler exactly as an operator would, into `out`. Resolves `{ built,
// output }`: `built` false is the script's own clean "no dashboard in the mount"
// exit, not a failure.
export async function buildInto(out, { repoRoot, log = defaultLog, run = spawnBuild }) {
  const { code, output } = await run([BUILD_SCRIPT, '--root', repoRoot, '--out', out]);
  for (const line of output.trim().split('\n').filter(Boolean)) log(`build: ${line}`);
  if (code !== 0) throw new Error(`build-site.mjs exited ${code}`);
  return { built: await exists(join(out, 'index.html')), output };
}

function spawnBuild(args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('error', reject);
    child.on('close', (code) => resolveRun({ code, output }));
  });
}

// --- 2. push ---------------------------------------------------------------------

const git = (cwd, args, opts = {}) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

// The built tree as one root commit on the Pages branch. Force, always: the branch
// holds the last build and nothing else, so there is no history to keep and no
// reconcile to do — and a re-run of the same sources is a re-push, not a conflict.
export function pushSite(out, { remote, branch = PAGES_BRANCH, message }) {
  git(out, ['init', '--quiet', '--initial-branch', branch]);
  git(out, ['add', '--all']);
  const author = ['-c', 'user.name=claudinite[bot]', '-c', 'user.email=claudinite@users.noreply.github.com'];
  git(out, [...author, 'commit', '--quiet', '--message', message]);
  const sha = git(out, ['rev-parse', 'HEAD']).trim();
  try {
    git(out, ['push', '--quiet', '--force', remote, `HEAD:refs/heads/${branch}`]);
  } catch (e) {
    // The token is in the remote URL; keep it out of the trace.
    throw new Error(`push to ${branch} failed: ${String(e.stderr ?? e.message).replace(/x-access-token:[^@]*@/g, 'x-access-token:***@')}`);
  }
  return sha;
}

// --- 3 + 4. dispatch and follow ----------------------------------------------------

// The run this dispatch created: the newest `workflow_dispatch` run of the file
// created at or after `since`. The dispatch endpoint returns no run id, so the run
// is found by its event and its time, and a queued runner can delay its appearance
// by a few seconds — hence the retries.
export async function findRun(gh, repo, since, { attempts = 12, wait = 5000 } = {}) {
  const created = encodeURIComponent(`>=${since.toISOString()}`);
  for (let i = 0; i < attempts; i += 1) {
    const { status, json } = await gh(`/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?event=workflow_dispatch&created=${created}&per_page=5`);
    if (status !== 200) throw new Error(`listing runs of ${WORKFLOW_FILE} answered ${status}`);
    const run = (json?.workflow_runs ?? [])[0];
    if (run) return run;
    await sleep(wait);
  }
  return null;
}

export async function followRun(gh, repo, runId, { deadline, wait = 10000 } = {}) {
  for (;;) {
    const { status, json } = await gh(`/repos/${repo}/actions/runs/${runId}`);
    if (status !== 200) throw new Error(`reading run ${runId} answered ${status}`);
    if (json.status === 'completed') return json;
    if (Date.now() >= deadline) return json;
    await sleep(wait);
  }
}

// Whether Pages is enabled on the repo. `null` when this token cannot tell — the
// executor's token holds no `pages` permission, and an unreadable setting must not be
// reported as a disabled one.
export async function pagesEnabled(gh, repo) {
  const { status } = await gh(`/repos/${repo}/pages`);
  if (status === 200) return true;
  if (status === 404) return false;
  return null;
}

export async function main({
  repoRoot = process.env.CLAUDINITE_REPO_ROOT,
  repo = process.env.CLAUDINITE_REPO,
  ref = process.env.CLAUDINITE_DEFAULT_BRANCH || 'main',
  token = process.env.GITHUB_TOKEN,
  remote = null,
  gh = makeGh(),
  build = buildInto,
  log = defaultLog,
  // Well inside `code_work_timeout`, so a run still going when this gives up is
  // reported rather than killed mid-sentence.
  followMs = 8 * 60 * 1000,
} = {}) {
  if (!repoRoot || !repo) throw new Error('CLAUDINITE_REPO_ROOT and CLAUDINITE_REPO are required');
  if (!remote && !token) throw new Error('GITHUB_TOKEN is not set — the executor always provides it');

  const out = await mkdtemp(join(tmpdir(), 'claudinite-dashboard-'));
  try {
    const { built } = await build(out, { repoRoot, log });
    if (!built) {
      log('nothing to publish — the mount does not yet carry the dashboard, so nothing was pushed');
      return { published: false, reason: 'no-site' };
    }

    const source = git(repoRoot, ['rev-parse', 'HEAD']).trim();
    await writeFile(join(out, STAMP_FILE), `${JSON.stringify({ source, builtAt: new Date().toISOString() }, null, 2)}\n`);
    const sha = pushSite(out, {
      remote: remote ?? remoteUrl(repo, token),
      message: `Claudinite dashboard built from ${source.slice(0, 12)}${item ? ` (#${item})` : ''}\n\nClaudinite-Task: claudinite-dashboard/publish-pages`,
    });
    log(`pushed ${sha.slice(0, 12)} to ${PAGES_BRANCH}`);
  } finally {
    await rm(out, { recursive: true, force: true });
  }

  const since = new Date(Date.now() - 1000);
  const sent = await dispatchWorkflow(gh, repo, WORKFLOW_FILE, ref);
  if (!sent.ok) {
    if (sent.status === 404) {
      throw new NeedsHuman('action', `${WORKFLOW_FILE} is not on ${ref} — the pack's seeded workflow never landed in .github/workflows/, or was removed`);
    }
    throw new Error(`dispatching ${WORKFLOW_FILE} on ${ref} answered ${sent.status}`);
  }
  log(`dispatched ${WORKFLOW_FILE} on ${ref}`);

  const run = await findRun(gh, repo, since);
  if (!run) throw new Error(`dispatched ${WORKFLOW_FILE} but no run of it appeared within a minute`);
  log(`following run ${run.id} — ${run.html_url}`);

  const done = await followRun(gh, repo, run.id, { deadline: Date.now() + followMs });
  if (done.status !== 'completed') {
    throw new NeedsHuman('decision', `run ${done.html_url} was still ${done.status} after ${Math.round(followMs / 60000)} minutes — check it, then re-queue or abandon`);
  }
  if (done.conclusion === 'success') {
    log(`published — ${done.html_url}`);
    return { published: true, run: done.html_url };
  }
  if (done.conclusion === 'cancelled') {
    // The workflow cancels a superseded deploy itself; the newer run is the one to read.
    throw new NeedsHuman('decision', `run ${done.html_url} was cancelled — a newer deploy superseded it, or someone stopped it; re-queue to republish`);
  }
  if (await pagesEnabled(gh, repo) === false) {
    throw new NeedsHuman('action', `run ${done.html_url} failed and GitHub Pages is not enabled on ${repo} — enable it with source "GitHub Actions" under /settings/pages, then re-queue`);
  }
  throw new Error(`run ${done.html_url} concluded ${done.conclusion}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => {
    console.error(e instanceof NeedsHuman
      ? `claudinite-needs-human: ${e.kind} — ${e.message}`
      : `publish-pages failed: ${e.stack ?? e.message}`);
    process.exit(1);
  });
}
