// THE TARGET — which pull request a run works on (tasks-dispatch DESIGN §6.4b,
// decision §15.32). The executor resolves it once, after the precondition's go and
// before code-work, and hands it to both phases; neither phase discovers, chooses
// or disposes of a pull request on its own. What this pins is the planner's matrix
// over the four outcomes, how a task's open pull requests are recognised, and the
// I/O shell's reads and writes against a fake GitHub.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planTarget, taskPullsOf, taskBranchPrefix, mintBranch, targetEnv,
  resolveTarget, closeSuperseded, TARGET_MODES,
} from '../../queue/target.mjs';

const TASK = 'claudinite-lifecycle/update';
const NOW = new Date('2026-09-04T04:10:00Z');
const pull = (number, ref, sha = `sha${number}`) => ({ number, head: { ref, sha }, node_id: `node${number}` });

// --- recognising a task's pull requests ---------------------------------------

test('a task\'s open pull requests are the ones on its branch prefix, newest first', () => {
  const pulls = [
    pull(3, 'claudinite/claudinite-lifecycle/update/2026-09-01-aaa'),
    pull(9, 'feature/unrelated'),
    pull(5, 'claudinite/claudinite-lifecycle/update/2026-09-03-bbb'),
    pull(4, 'claudinite/claudinite-lifecycle/updater/2026-09-02-ccc'),
  ];
  assert.deepEqual(taskPullsOf(pulls, TASK).map((p) => p.number), [5, 3]);
  assert.equal(taskBranchPrefix(TASK), 'claudinite/claudinite-lifecycle/update/');
});

// A pull request the lanes opened before the executor minted branch names — the
// update task's `claudinite/update-<day>-<seed>`, an agent session's own name — is
// still this task's: its head commit carries the `Claudinite-Task:` trailer, which is
// the same authority the movement signals read.
test('a pull request off the prefix is recognised by the trailer on its head commit', () => {
  const pulls = [pull(12, 'claudinite/update-2026-09-02-xyz'), pull(13, 'someone/elses')];
  const headTaskOf = (p) => (p.number === 12 ? TASK : null);
  assert.deepEqual(taskPullsOf(pulls, TASK, headTaskOf).map((p) => p.number), [12]);
  assert.deepEqual(taskPullsOf(pulls, 'other/task', headTaskOf), []);
  assert.deepEqual(taskPullsOf(undefined, TASK), []);
});

test('a minted branch carries the task, the day and a seed, under the task\'s prefix', () => {
  const branch = mintBranch(TASK, NOW, 'ab12cd');
  assert.equal(branch, 'claudinite/claudinite-lifecycle/update/2026-09-04-ab12cd');
  assert.ok(branch.startsWith(taskBranchPrefix(TASK)));
});

// --- the planner's matrix ----------------------------------------------------------

const branch = 'claudinite/claudinite-lifecycle/update/2026-09-04-fresh1';

test('no_code_changes gets no branch and no pull request', () => {
  const t = planTarget({ outcome: 'no_code_changes', incumbents: [pull(3, 'x')], branch });
  assert.equal(t.mode, 'none');
  assert.equal(t.branch, null);
  assert.equal(t.pr, null);
  assert.deepEqual(t.supersedes, []);
  assert.equal(t.landed, null);
});

test('fresh_pr gets the minted branch and leaves the task\'s earlier pull requests alone', () => {
  const t = planTarget({ outcome: 'fresh_pr', incumbents: [pull(3, 'x')], branch });
  assert.deepEqual([t.mode, t.branch, t.pr, t.supersedes, t.landed], ['fresh', branch, null, [], null]);
});

test('amend_existing_or_create_new_pr amends the newest open pull request when it has no conflicts', () => {
  const incumbents = [pull(5, 'claudinite/claudinite-lifecycle/update/2026-09-03-bbb'), pull(3, 'older')];
  const t = planTarget({ outcome: 'amend_existing_or_create_new_pr', incumbents, mergeable: true, branch });
  assert.equal(t.mode, 'amend');
  assert.equal(t.branch, 'claudinite/claudinite-lifecycle/update/2026-09-03-bbb');
  assert.equal(t.pr, 5);
  assert.deepEqual(t.supersedes, []);
});

test('amend falls back to a fresh branch on a conflicted incumbent, and on one whose mergeability could not be read', () => {
  const incumbents = [pull(5, 'claudinite/claudinite-lifecycle/update/2026-09-03-bbb')];
  for (const mergeable of [false, null]) {
    const t = planTarget({ outcome: 'amend_existing_or_create_new_pr', incumbents, mergeable, branch });
    assert.equal(t.mode, 'fresh', `mergeable=${mergeable}`);
    assert.equal(t.branch, branch);
    assert.equal(t.pr, null);
    assert.match(t.reason, mergeable === false ? /conflict/ : /could not be read/);
  }
  const none = planTarget({ outcome: 'amend_existing_or_create_new_pr', incumbents: [], branch });
  assert.deepEqual([none.mode, none.branch, none.pr], ['fresh', branch, null]);
});

test('supersede_existing_pr gets a fresh branch and names every open pull request of the task to close once its own exists', () => {
  const incumbents = [pull(5, 'b'), pull(3, 'a')];
  const t = planTarget({ outcome: 'supersede_existing_pr', incumbents, disposition: 'close', branch });
  assert.deepEqual([t.mode, t.branch, t.pr], ['fresh', branch, null]);
  assert.deepEqual(t.supersedes, [5, 3]);
  assert.equal(t.landed, null);
  // Nothing to supersede is an ordinary fresh branch.
  assert.deepEqual(planTarget({ outcome: 'supersede_existing_pr', incumbents: [], branch }).supersedes, []);
});

// A verified, unlanded incumbent on an auto-merge repo is what disposal used to
// merge on the next cycle: that content is this task's own delivery, and closing it
// to re-cut the same diff would strand exactly the member whose CI outruns the
// landing budget every day. So it lands, and the occurrence ends there — the tree
// this run holds predates the merge, and the next occurrence converges from it.
test('supersede lands a green incumbent instead of re-cutting it, and the occurrence ends', () => {
  const incumbents = [pull(5, 'b'), pull(3, 'a')];
  const t = planTarget({ outcome: 'supersede_existing_pr', incumbents, disposition: 'merge', branch });
  assert.equal(t.mode, 'none');
  assert.equal(t.landed, 5);
  assert.deepEqual(t.supersedes, [3], 'the older ones close as superseded by the landed one');
});

test('the legacy ceilings plan as the values they normalize to', () => {
  assert.equal(planTarget({ outcome: 'none', incumbents: [], branch }).mode, 'none');
  assert.equal(planTarget({ outcome: 'pr', incumbents: [], branch }).mode, 'fresh');
  assert.equal(planTarget({ outcome: 'open-pr', incumbents: [], branch }).mode, 'fresh');
  assert.throws(() => planTarget({ outcome: 'push', incumbents: [], branch }), /not a legal outcome/);
});

test('the env a target becomes is exactly the three variables, every mode', () => {
  assert.deepEqual(targetEnv({ mode: 'none', branch: null, pr: null }),
    { CLAUDINITE_TARGET_MODE: 'none', CLAUDINITE_TARGET_BRANCH: '', CLAUDINITE_TARGET_PR: '' });
  assert.deepEqual(targetEnv({ mode: 'amend', branch: 'b', pr: 5 }),
    { CLAUDINITE_TARGET_MODE: 'amend', CLAUDINITE_TARGET_BRANCH: 'b', CLAUDINITE_TARGET_PR: '5' });
  assert.deepEqual(targetEnv({ mode: 'fresh', branch: 'b', pr: null }),
    { CLAUDINITE_TARGET_MODE: 'fresh', CLAUDINITE_TARGET_BRANCH: 'b', CLAUDINITE_TARGET_PR: '' });
  assert.deepEqual(TARGET_MODES, ['none', 'fresh', 'amend']);
});

// --- the I/O shell over a fake GitHub ---------------------------------------------

function fakeGitHub({ pulls = [], mergeable = {}, heads = {}, runs = {}, mergeStatus = 200 } = {}) {
  const calls = [];
  const gh = async (path, { method = 'GET', body } = {}) => {
    calls.push(`${method} ${path.split('?')[0]}`);
    let m;
    if (method === 'GET' && /^\/repos\/[^/]+\/[^/]+\/pulls\?/.test(path)) return { status: 200, json: pulls };
    if ((m = /^\/repos\/[^/]+\/[^/]+\/pulls\/(\d+)$/.exec(path))) {
      const pr = pulls.find((p) => p.number === Number(m[1]));
      if (method === 'PATCH') { pr.state = body.state; return { status: 200, json: pr }; }
      const reads = (mergeable[pr.number] ?? [true]);
      const value = reads.length > 1 ? reads.shift() : reads[0];
      return { status: 200, json: { ...pr, mergeable: value } };
    }
    if ((m = /^\/repos\/[^/]+\/[^/]+\/commits\/([^/]+)$/.exec(path))) {
      return { status: 200, json: { commit: { message: heads[m[1]] ?? 'plain commit' } } };
    }
    if (/\/actions\/runs\?/.test(path)) {
      const sha = /head_sha=([^&]+)/.exec(path)[1];
      return { status: 200, json: { workflow_runs: runs[sha] ?? [] } };
    }
    if (/\/pulls\/\d+\/merge$/.test(path)) return { status: mergeStatus, json: {} };
    if (/\/git\/refs\/heads\//.test(path)) return { status: 204, json: null };
    if (/\/issues\/\d+\/comments$/.test(path)) return { status: 201, json: {} };
    return { status: 404, json: null };
  };
  return { gh, calls };
}

const resolve = (gh, outcome, over = {}) => resolveTarget({
  gh, repo: 'o/r', taskId: TASK, outcome, delivery: 'auto-merge', now: NOW, seed: 'seed01',
  sleep: async () => {}, log: () => {}, ...over,
});

test('fresh_pr and no_code_changes read nothing at all', async () => {
  const { gh, calls } = fakeGitHub({ pulls: [pull(3, 'claudinite/claudinite-lifecycle/update/2026-09-01-aaa')] });
  const fresh = await resolve(gh, 'fresh_pr');
  assert.equal(fresh.mode, 'fresh');
  assert.equal(fresh.branch, 'claudinite/claudinite-lifecycle/update/2026-09-04-seed01');
  assert.equal((await resolve(gh, 'no_code_changes')).mode, 'none');
  assert.deepEqual(calls, [], 'a target that involves no existing pull request costs no read');
});

test('amend reads the newest incumbent\'s mergeability, polling while GitHub is still computing it', async () => {
  const pulls = [pull(5, 'claudinite/claudinite-lifecycle/update/2026-09-03-bbb')];
  const { gh, calls } = fakeGitHub({ pulls, mergeable: { 5: [null, null, true] } });
  const t = await resolve(gh, 'amend_existing_or_create_new_pr');
  assert.equal(t.mode, 'amend');
  assert.equal(t.pr, 5);
  assert.equal(calls.filter((c) => c === 'GET /repos/o/r/pulls/5').length, 3);
});

test('amend on an incumbent GitHub never finishes judging takes a fresh branch, never a guess', async () => {
  const pulls = [pull(5, 'claudinite/claudinite-lifecycle/update/2026-09-03-bbb')];
  const { gh } = fakeGitHub({ pulls, mergeable: { 5: [null, null, null, null] } });
  const t = await resolve(gh, 'amend_existing_or_create_new_pr');
  assert.equal(t.mode, 'fresh');
  assert.match(t.reason, /could not be read/);
});

test('an incumbent off the prefix is found by the trailer on its head commit', async () => {
  const pulls = [pull(12, 'claudinite/update-2026-09-02-xyz', 'abc'), pull(13, 'feature/x', 'def')];
  const { gh } = fakeGitHub({ pulls, heads: { abc: `Claudinite: update\n\nClaudinite-Task: ${TASK}\n` }, mergeable: { 12: [true] } });
  const t = await resolve(gh, 'amend_existing_or_create_new_pr');
  assert.equal(t.pr, 12);
});

test('supersede judges the newest incumbent by the runs on its head: red closes after the successor, green lands now', async () => {
  const pulls = [pull(5, 'claudinite/claudinite-lifecycle/update/2026-09-03-bbb', 'shaB'), pull(3, 'claudinite/claudinite-lifecycle/update/2026-09-01-aaa', 'shaA')];
  const red = fakeGitHub({ pulls, runs: { shaB: [{ name: 'ci', status: 'completed', conclusion: 'failure' }] } });
  const t = await resolve(red.gh, 'supersede_existing_pr');
  assert.deepEqual([t.mode, t.supersedes, t.landed], ['fresh', [5, 3], null]);
  assert.ok(!red.calls.some((c) => c.startsWith('PUT') || c.startsWith('PATCH')), 'nothing is written before the successor exists');

  const green = fakeGitHub({ pulls, runs: { shaB: [{ name: 'ci', status: 'completed', conclusion: 'success' }] } });
  const g = await resolve(green.gh, 'supersede_existing_pr');
  assert.equal(g.mode, 'none');
  assert.equal(g.landed, 5);
  assert.deepEqual(g.supersedes, [3]);
  assert.ok(green.calls.includes('PUT /repos/o/r/pulls/5/merge'));
  assert.ok(green.calls.includes('DELETE /repos/o/r/git/refs/heads/claudinite%2Fclaudinite-lifecycle%2Fupdate%2F2026-09-03-bbb'));
});

test('a review member\'s green incumbent is superseded, never landed by the machinery', async () => {
  const pulls = [pull(5, 'claudinite/claudinite-lifecycle/update/2026-09-03-bbb', 'shaB')];
  const { gh, calls } = fakeGitHub({ pulls, runs: { shaB: [{ name: 'ci', status: 'completed', conclusion: 'success' }] } });
  const t = await resolve(gh, 'supersede_existing_pr', { delivery: 'review' });
  assert.deepEqual([t.mode, t.supersedes, t.landed], ['fresh', [5], null]);
  assert.ok(!calls.some((c) => c.startsWith('PUT')));
});

test('a merge that fails falls back to superseding — one open pull request either way', async () => {
  const pulls = [pull(5, 'claudinite/claudinite-lifecycle/update/2026-09-03-bbb', 'shaB')];
  const { gh } = fakeGitHub({ pulls, runs: { shaB: [{ name: 'ci', status: 'completed', conclusion: 'success' }] }, mergeStatus: 405 });
  const t = await resolve(gh, 'supersede_existing_pr');
  assert.deepEqual([t.mode, t.supersedes, t.landed], ['fresh', [5], null]);
});

test('an unreadable pull request list is an error, not an empty one', async () => {
  const gh = async () => ({ status: 500, json: null });
  const t = await resolve(gh, 'supersede_existing_pr');
  assert.match(t.error, /could not list/);
  assert.equal((await resolve(gh, 'fresh_pr')).error, undefined, 'a target that needs no read has no read to fail');
});

test('closeSuperseded comments the successor, closes each and tidies its branch, best-effort', async () => {
  const pulls = [pull(5, 'claudinite/claudinite-lifecycle/update/2026-09-03-bbb'), pull(3, 'claudinite/claudinite-lifecycle/update/2026-09-01-aaa')];
  const { gh, calls } = fakeGitHub({ pulls });
  const said = [];
  await closeSuperseded({ gh, repo: 'o/r', numbers: [5, 3], successor: 9, log: (s) => said.push(s) });
  for (const n of [5, 3]) {
    assert.ok(calls.includes(`POST /repos/o/r/issues/${n}/comments`));
    assert.ok(calls.includes(`PATCH /repos/o/r/pulls/${n}`));
  }
  assert.ok(calls.includes('DELETE /repos/o/r/git/refs/heads/claudinite%2Fclaudinite-lifecycle%2Fupdate%2F2026-09-01-aaa'));
  assert.match(said.join('\n'), /#5 .*superseded by #9/);
  // Already closed, or unreadable: log and carry on — the successor is the deliverable.
  const gone = async () => ({ status: 404, json: null });
  await closeSuperseded({ gh: gone, repo: 'o/r', numbers: [77], successor: 9, log: (s) => said.push(s) });
  assert.match(said.join('\n'), /could not close #77/);
});
