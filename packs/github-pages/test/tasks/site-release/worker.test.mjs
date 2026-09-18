import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, git, makeRepo } from '../../../../../engine-tests/helpers.mjs';
import { removeTree } from '../../../../../engine/remove-tree.mjs';
import {
  deploy, deploymentAt, loadVersioning, pushRelease, reportServed, VERSIONING_SEAM,
} from '../../../tasks/site-release/worker.mjs';

const CONFIG = 'publish_root=.\npublish_paths=index.html assets\nbuild_command=\n';

// A repo on the scheme, with a bare clone standing in for GitHub: the worker fetches
// the tip from it and pushes the bump back to it, exactly as it does against origin.
async function withRemote(fn) {
  const root = makeRepo({ base: {
    '.github/site.config': CONFIG,
    'index.html': '<p title="version 1.10910.4">c</p>\n',
    'assets/style.css': 'body{}\n',
    'package.json': '{\n  "version": "1.10910.4"\n}\n',
  } });
  const remote = mkdtempSync(join(tmpdir(), 'site-release-remote-'));
  git(root, 'clone', '--bare', '--quiet', root, join(remote, 'r.git'));
  try { return await fn(root, join(remote, 'r.git')); } finally { cleanup(root); removeTree(remote); }
}

const silenced = async (fn) => {
  const { error } = console;
  const lines = [];
  console.error = (m) => lines.push(String(m));
  try { return { result: await fn(), lines }; } finally { console.error = error; }
};

// The seam is resolved beside this pack, so in the canon — where public-website sits
// beside github-pages — it loads; a mount without the pack answers the not-found code
// and nothing else, which is the documented no-bump release.
test('the versioning seam loads from beside the pack, and its absence is a null', async () => {
  const seam = await loadVersioning();
  assert.equal(typeof seam.bumpedFiles, 'function');
  const absent = Object.assign(new Error('nope'), { code: 'ERR_MODULE_NOT_FOUND' });
  assert.equal(await loadVersioning(async () => { throw absent; }), null);
  await assert.rejects(loadVersioning(async () => { throw new SyntaxError('broken seam'); }), /broken seam/);
  assert.match(VERSIONING_SEAM, /public-website\/public\/version\.mjs$/);
});

test('deploymentAt reads the publish set at the commit and parks on a path the branch lacks', async () => {
  await withRemote((root) => {
    const tip = git(root, 'rev-parse', 'main').trim();
    const d = deploymentAt(root, tip);
    assert.ok(d.tracked.includes('assets/style.css'));
    assert.equal(d.values.get('publish_root'), '.');

    git(root, 'rm', '-q', '-r', 'assets');
    git(root, 'commit', '-q', '-m', 'drop assets');
    const broken = git(root, 'rev-parse', 'HEAD').trim();
    assert.throws(() => deploymentAt(root, broken), /publish path\(s\) that do not exist on the branch: assets/);
  });
});

// The release with public-website declared: the bump is committed onto the remote's
// tip and pushed, the record and the stamped page both move, and the commit carries
// the trailer the gate reads.
test('pushRelease advances the version on the remote and stamps the page', async () => {
  await withRemote(async (root, remote) => {
    const versioning = await loadVersioning();
    const { version, commit, attempts } = pushRelease(root, {
      remote, base: 'main', taskId: 'github-pages/site-release', versioning, now: new Date('2026-09-17T10:00:00Z'),
    });
    assert.equal(version, '1.10917.5');
    assert.equal(attempts, 1);
    assert.equal(git(root, 'ls-remote', remote, 'refs/heads/main').split('\t')[0], commit);
    assert.match(git(root, 'show', `${commit}:package.json`), /"version": "1\.10917\.5"/);
    assert.match(git(root, 'show', `${commit}:index.html`), /version 1\.10917\.5/);
    assert.match(git(root, 'log', '-1', '--format=%B', commit), /Claudinite-Task: github-pages\/site-release/);
  });
});

// Without the pack: nothing is written, nothing is pushed, and the release is the tip
// as found.
test('pushRelease with no versioning releases the tip and writes nothing', async () => {
  await withRemote((root, remote) => {
    const before = git(root, 'ls-remote', remote, 'refs/heads/main').split('\t')[0];
    const { version, commit } = pushRelease(root, { remote, base: 'main', taskId: 'github-pages/site-release', versioning: null });
    assert.equal(version, null);
    assert.equal(commit, before);
    assert.equal(git(root, 'ls-remote', remote, 'refs/heads/main').split('\t')[0], before);
  });
});

test('a declared version pack with no record to advance parks as a decision', async () => {
  await withRemote(async (root, remote) => {
    git(root, 'rm', '-q', 'package.json');
    git(root, 'commit', '-q', '-m', 'drop the record');
    git(root, 'push', '--quiet', remote, 'HEAD:main');
    const versioning = await loadVersioning();
    const { lines } = await silenced(async () => {
      assert.throws(() => pushRelease(root, { remote, base: 'main', taskId: 't', versioning }), /nothing to advance/);
    });
    assert.match(lines[0], /^claudinite-needs-human: decision/);
  });
});

// A fake GitHub: the dispatch answers with the status the case names, the run list
// shows a run created after the dispatch, and reads of that run walk it to completion.
function fakeGitHub({ dispatchStatus = 204, conclusion = 'success', appears = true } = {}) {
  const calls = [];
  let reads = 0;
  const run = { id: 7, event: 'workflow_dispatch', created_at: '2026-09-17T10:00:30Z', status: 'in_progress', conclusion: null, html_url: 'https://github.com/o/r/actions/runs/7' };
  const gh = async (path, opts = {}) => {
    calls.push(`${opts.method ?? 'GET'} ${path}`);
    if (path.endsWith('/dispatches')) return { status: dispatchStatus, json: null };
    if (path.includes('/workflows/') && path.includes('/runs')) return { status: 200, json: { workflow_runs: appears ? [run] : [] } };
    if (path.endsWith('/actions/runs/7')) {
      reads += 1;
      return { status: 200, json: reads >= 2 ? { ...run, status: 'completed', conclusion } : run };
    }
    return { status: 404, json: null };
  };
  return { gh, calls };
}

const clock = () => {
  let t = Date.parse('2026-09-17T10:00:00Z');
  return { now: () => t, sleep: async (ms) => { t += ms; } };
};

test('deploy dispatches at the commit, finds its run and waits for success', async () => {
  const { gh, calls } = fakeGitHub();
  const run = await deploy(gh, 'o/r', { base: 'main', commit: 'abc1234', ...clock() });
  assert.equal(run.conclusion, 'success');
  assert.match(calls[0], /^POST \/repos\/o\/r\/actions\/workflows\/github-pages-deploy\.yml\/dispatches$/);
  assert.ok(calls.some((c) => c === 'GET /repos/o/r/actions/runs/7'));
});

// The lanes: a missing workflow or a token that cannot dispatch is a person's
// five-second fix; a run that failed is a trace to read, with its URL.
test('deploy parks on the lane the failure belongs to', async () => {
  for (const [dispatchStatus, lane, what] of [[404, 'action', /re-vendor/], [403, 'action', /actions: write/], [500, 'failure', /answered 500/]]) {
    const { gh } = fakeGitHub({ dispatchStatus });
    const { lines } = await silenced(() => assert.rejects(deploy(gh, 'o/r', { base: 'main', commit: 'abc', ...clock() }), what));
    assert.match(lines[0], new RegExp(`^claudinite-needs-human: ${lane}`));
  }
  const failed = fakeGitHub({ conclusion: 'failure' });
  const { lines } = await silenced(() => assert.rejects(deploy(failed.gh, 'o/r', { base: 'main', commit: 'abc', ...clock() }), /ended failure: https:\/\/github\.com\/o\/r\/actions\/runs\/7/));
  assert.match(lines[0], /Settings → Pages/);
  const vanished = fakeGitHub({ appears: false });
  await silenced(() => assert.rejects(deploy(vanished.gh, 'o/r', { base: 'main', commit: 'abc', ...clock() }), /no run of github-pages-deploy\.yml appeared/));
});

// A release is not finished when the API says success — what matters is that a
// visitor reaches the page and sees the version that was cut. Pages propagates for a
// while, so a stale stamp is reported rather than parked.
test('what the site answered is reported, with the stamp it shows', async () => {
  const page = (body) => async () => ({ status: 200, text: async () => body });
  assert.deepEqual(await reportServed('https://o.github.io/r/', { version: '1.10917.5', fetchImpl: page('<p title="version 1.10917.5">') }),
    { url: 'https://o.github.io/r/', status: 200, stamp: 'matches' });
  assert.equal((await reportServed('u', { version: '1.10917.5', fetchImpl: page('<p title="version 1.10917.4">') })).stamp, 'stale');
  assert.equal((await reportServed('u', { version: '1.10917.5', fetchImpl: page('<p>no stamp</p>') })).stamp, 'none');
  assert.equal((await reportServed('u', { version: null, fetchImpl: page('<p title="version 1">') })).stamp, null);
  assert.deepEqual(await reportServed('u', { fetchImpl: async () => { throw new Error('ENOTFOUND'); } }), { url: 'u', error: 'ENOTFOUND' });
});
