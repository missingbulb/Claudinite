import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  main, pushSite, NeedsHuman, WORKFLOW_FILE, PAGES_BRANCH, STAMP_FILE,
} from '../../../tasks/publish-pages/worker.mjs';
import declarationJson from '../../../tasks/publish-pages/task.json' with { type: 'json' };
import { normalizeTaskDeclaration, validateTaskDeclaration } from '../../../../claudinite-tasks/task-contract.mjs';

const REPO = 'o/r';

test('the declaration is the contract\'s, and yields to the converge it publishes', () => {
  const decl = normalizeTaskDeclaration(declarationJson);
  assert.deepEqual(validateTaskDeclaration(decl, {}), []);
  assert.equal(decl.agent_model, 'none');
  assert.equal(decl.expected_outcome, 'no_code_changes', 'it opens no PR — its one write is the Pages branch');
  assert.deepEqual(decl.schedule_after, ['claudinite-lifecycle/update']);
});

// A bare repo standing in for GitHub: what the worker pushes is read back from it.
async function remote(t) {
  const dir = await mkdtemp(join(tmpdir(), 'cd-pages-remote-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet', '--bare', dir]);
  return dir;
}
const git = (dir, args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();

// A source checkout the worker reads HEAD from, and a build that lays down a site.
async function source(t) {
  const dir = await mkdtemp(join(tmpdir(), 'cd-pages-source-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet', dir]);
  await writeFile(join(dir, 'a'), 'a');
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', 'a']);
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'src']);
  return dir;
}
const siteBuild = async (out) => {
  await writeFile(join(out, 'index.html'), '<!doctype html>');
  await writeFile(join(out, '.nojekyll'), '');
  return { built: true, output: '' };
};
const noSiteBuild = async () => ({ built: false, output: 'No dashboard in the mount' });

// GitHub, scripted: the dispatch, the run it creates, and the Pages setting.
function fakeGh({ dispatch = 204, conclusion = 'success', pages = 403 } = {}) {
  const calls = [];
  const gh = async (path, opts = {}) => {
    calls.push(`${opts.method ?? 'GET'} ${path.replace(/\?.*/, '')}`);
    if (path.endsWith('/dispatches')) return { status: dispatch, json: null };
    if (path.includes('/runs?')) return { status: 200, json: { workflow_runs: [{ id: 7, html_url: 'https://x/runs/7' }] } };
    if (path.endsWith('/runs/7')) return { status: 200, json: { id: 7, html_url: 'https://x/runs/7', status: 'completed', conclusion } };
    if (path.endsWith('/pages')) return { status: pages, json: null };
    throw new Error(`unexpected ${path}`);
  };
  gh.calls = calls;
  return gh;
}

const run = async (t, { gh, build = siteBuild }) => {
  const [bare, root] = [await remote(t), await source(t)];
  const result = await main({ repoRoot: root, repo: REPO, ref: 'main', remote: bare, gh, build, followMs: 500, log: () => {} });
  return { result, bare, root };
};

test('a build is pushed as one commit, the workflow dispatched, and its run followed to success', async (t) => {
  const gh = fakeGh();
  const { result, bare, root } = await run(t, { gh });
  assert.deepEqual(result, { published: true, run: 'https://x/runs/7' });
  assert.equal(git(bare, ['rev-list', '--count', PAGES_BRANCH]), '1', 'no history — the branch is the last build');
  assert.deepEqual(git(bare, ['ls-tree', '--name-only', PAGES_BRANCH]).split('\n').sort(), ['.nojekyll', STAMP_FILE, 'index.html']);
  const stamp = JSON.parse(git(bare, ['show', `${PAGES_BRANCH}:${STAMP_FILE}`]));
  assert.equal(stamp.source, git(root, ['rev-parse', 'HEAD']), 'the stamp names the sources it was built from');
  assert.deepEqual(gh.calls, [
    `POST /repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    `GET /repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs`,
    `GET /repos/${REPO}/actions/runs/7`,
  ]);
});

test('a re-run is a re-push, never a conflict', async (t) => {
  const bare = await remote(t);
  for (const n of [1, 2]) {
    const out = await mkdtemp(join(tmpdir(), 'cd-pages-build-'));
    t.after(() => rm(out, { recursive: true, force: true }));
    await writeFile(join(out, 'index.html'), `build ${n}`);
    pushSite(out, { remote: bare, message: `build ${n}` });
  }
  assert.equal(git(bare, ['rev-list', '--count', PAGES_BRANCH]), '1');
  assert.equal(git(bare, ['show', `${PAGES_BRANCH}:index.html`]), 'build 2');
});

test('a mount without the page publishes nothing and starts no run', async (t) => {
  const gh = fakeGh();
  const { result, bare } = await run(t, { gh, build: noSiteBuild });
  assert.deepEqual(result, { published: false, reason: 'no-site' });
  assert.deepEqual(gh.calls, []);
  assert.throws(() => git(bare, ['rev-parse', PAGES_BRANCH]), 'nothing was pushed');
});

// The one non-code failure a Pages deploy has, routed to the person who can fix it.
test('a failed deploy with Pages disabled parks as an action naming the setting', async (t) => {
  await assert.rejects(run(t, { gh: fakeGh({ conclusion: 'failure', pages: 404 }) }),
    (e) => e instanceof NeedsHuman && e.kind === 'action' && /GitHub Actions/.test(e.message) && /settings\/pages/.test(e.message));
});

// An unreadable setting is not a disabled one: the executor's token cannot read Pages.
test('a failed deploy with the setting unreadable is a failure, with the run to read', async (t) => {
  await assert.rejects(run(t, { gh: fakeGh({ conclusion: 'failure', pages: 403 }) }),
    (e) => !(e instanceof NeedsHuman) && /https:\/\/x\/runs\/7/.test(e.message));
});

test('a workflow that never landed parks as an action, after the push', async (t) => {
  const gh = fakeGh({ dispatch: 404 });
  await assert.rejects(main({ repoRoot: await source(t), repo: REPO, ref: 'main', remote: await remote(t), gh, build: siteBuild, log: () => {} }),
    (e) => e instanceof NeedsHuman && e.kind === 'action' && e.message.includes(WORKFLOW_FILE));
  assert.deepEqual(gh.calls, [`POST /repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`]);
});
