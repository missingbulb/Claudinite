import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDelivery, resolveDelivery, DEFAULT_DELIVERY, deliveryFromChecks,
  workflowTriggers, ciDispatchPlan, pullCreateError,
  deliveryAction, classifyMergeGate, pullDisposition, mergeReason, failureSummary,
  landAttempt, LAND_TIMEOUT_MS, openDeliveredPull, disposeOpenPull,
} from '../../engine/scheduler/land-pr.mjs';

// The PURE decision helpers of the shared landing procedure. They grew inside the
// baselining worker (#455/#565/#649/#677/#690) and moved here when the other
// merged-pr tasks needed the same nuances; the REST/GraphQL I/O around them
// (dispatchCiRuns, landNow, landDelivery) is validated by the live fleet, these
// are the git-free unit surface.

test('normalizeDelivery maps the accepted values and legacy aliases, rejecting the rest', () => {
  assert.equal(normalizeDelivery('auto-merge'), 'auto-merge');
  assert.equal(normalizeDelivery('auto'), 'auto-merge');   // legacy alias
  assert.equal(normalizeDelivery('push'), 'auto-merge');   // legacy alias
  assert.equal(normalizeDelivery('review'), 'review');
  assert.equal(normalizeDelivery('pr'), 'review');         // legacy alias
  assert.equal(normalizeDelivery(' review '), 'review');   // trimmed
  assert.equal(normalizeDelivery('bogus'), null);
  assert.equal(normalizeDelivery(undefined), null);
});

// A MISSING maintenance.delivery is drift, not an error: the only writer is
// check_the_world --init (first adoption), so a repo adopted before the key existed
// — or one whose key was hand-removed — has nothing that could ever put it back,
// and a hard failure would just fail its tasks every night forever. Resolve the
// default instead (baselining is the one caller that also MATERIALIZES it). An
// UNRECOGNIZED value stays a hard failure: substituting a default there would
// deliver the opposite of a stated intent.
test('resolveDelivery materializes the default for a missing key rather than failing the run', () => {
  assert.deepEqual(resolveDelivery(undefined), { delivery: DEFAULT_DELIVERY, materialize: true });
  assert.deepEqual(resolveDelivery(null), { delivery: DEFAULT_DELIVERY, materialize: true });
  assert.equal(DEFAULT_DELIVERY, 'auto-merge');
});

test('resolveDelivery treats a content-free value as absent, not as a typo', () => {
  assert.deepEqual(resolveDelivery(''), { delivery: DEFAULT_DELIVERY, materialize: true });
  assert.deepEqual(resolveDelivery('   '), { delivery: DEFAULT_DELIVERY, materialize: true });
});

test('resolveDelivery passes a stated intent through untouched — legacy aliases included', () => {
  assert.deepEqual(resolveDelivery('review'), { delivery: 'review', materialize: false });
  assert.deepEqual(resolveDelivery('auto-merge'), { delivery: 'auto-merge', materialize: false });
  assert.deepEqual(resolveDelivery('pr'), { delivery: 'review', materialize: false });
  assert.deepEqual(resolveDelivery('push'), { delivery: 'auto-merge', materialize: false });
  assert.deepEqual(resolveDelivery('auto'), { delivery: 'auto-merge', materialize: false });
});

test('resolveDelivery still fails the run on an unrecognized value — never a silent default', () => {
  assert.deepEqual(resolveDelivery('bogus'), { delivery: null, materialize: false });
  assert.deepEqual(resolveDelivery('merge'), { delivery: null, materialize: false });
});

// deliveryFromChecks is the same resolution off the raw file text — the shape a
// caller reading .claudinite-checks.json from a git blob has in hand.
test('deliveryFromChecks resolves the stated intent out of the raw checks JSON', () => {
  assert.equal(deliveryFromChecks('{"maintenance":{"delivery":"review"}}').delivery, 'review');
  assert.equal(deliveryFromChecks('{"maintenance":{"delivery":"push"}}').delivery, 'auto-merge');
  assert.equal(deliveryFromChecks('{"maintenance":{"delivery":"bogus"}}').delivery, null);
});

test('deliveryFromChecks: an absent file, absent key, or unparsable text resolves the default', () => {
  // The file's integrity is check_the_world's problem; the delivery step just
  // needs an answer, and "no stated intent" is the default, not a failure.
  assert.deepEqual(deliveryFromChecks(null), { delivery: DEFAULT_DELIVERY, materialize: true });
  assert.deepEqual(deliveryFromChecks('{"packs":["basics"]}'), { delivery: DEFAULT_DELIVERY, materialize: true });
  assert.deepEqual(deliveryFromChecks('not json at all'), { delivery: DEFAULT_DELIVERY, materialize: true });
});

// --- CI dispatch planning (#565) ----------------------------------------------
// A branch pushed and a PR opened over the Action's GITHUB_TOKEN emit no
// pull_request run (GitHub's recursion guard), so the delivery must start the
// PR's checks itself via workflow_dispatch — the guard's documented exception.
// These cover the pure planning half: reading a workflow's `on:` triggers and
// picking which files to dispatch.

test('workflowTriggers reads a block-map on: — the common shape', () => {
  const yaml = [
    'name: Tests', 'on:', '  workflow_dispatch:', '  pull_request:',
    '    branches: [main]', '  push:', '    branches: [main, "claude/**"]',
    'jobs:', '  test:', '    runs-on: ubuntu-latest',
  ].join('\n');
  assert.deepEqual(workflowTriggers(yaml), ['workflow_dispatch', 'pull_request', 'push']);
});

test('workflowTriggers reads bare-key children (no nested config)', () => {
  const yaml = 'name: CI\non:\n  pull_request:\n  push:\n    branches: [main]\njobs: {}\n';
  assert.deepEqual(workflowTriggers(yaml), ['pull_request', 'push']);
});

test('workflowTriggers reads the inline scalar and inline list forms', () => {
  assert.deepEqual(workflowTriggers('on: workflow_dispatch\njobs: {}\n'), ['workflow_dispatch']);
  assert.deepEqual(workflowTriggers('on: [pull_request, push]\njobs: {}\n'), ['pull_request', 'push']);
});

test('workflowTriggers is not fooled by nested keys deeper than the trigger level', () => {
  const yaml = [
    'on:', '  schedule:', '    - cron: "24 * * * *"', '  workflow_dispatch:',
    '    inputs:', '      overrides:', '        required: false', 'jobs: {}',
  ].join('\n');
  assert.deepEqual(workflowTriggers(yaml), ['schedule', 'workflow_dispatch']);
});

test('workflowTriggers on a file with no on: block returns nothing', () => {
  assert.deepEqual(workflowTriggers('name: fragment\njobs: {}\n'), []);
});

test('ciDispatchPlan dispatches exactly the PR-triggered AND dispatchable workflows', () => {
  const files = [
    { name: 'test.yml', content: 'on:\n  workflow_dispatch:\n  pull_request:\n    branches: [main]\njobs: {}\n' },
    { name: 'release.yml', content: 'on:\n  workflow_dispatch:\njobs: {}\n' },        // dispatchable but NOT PR CI — never touch
    { name: 'scheduler.yml', content: 'on:\n  schedule:\n    - cron: "0 * * * *"\njobs: {}\n' },
  ];
  assert.deepEqual(ciDispatchPlan(files), { dispatch: ['test.yml'], missing: [] });
});

test('ciDispatchPlan names a PR workflow it cannot dispatch, so the log can say what to fix', () => {
  const files = [{ name: 'ci.yml', content: 'on:\n  pull_request:\n  push:\n    branches: [main]\njobs: {}\n' }];
  assert.deepEqual(ciDispatchPlan(files), { dispatch: [], missing: ['ci.yml'] });
});

// The PR-open POST is status-checked. Before this, a delivery destructured only
// `json` and never read `status`, so a 403 left `pr` holding the error body:
// auto-merge was skipped (no node_id), the run reported ok, and the next cycle
// minted a fresh branch because no OPEN PR existed to reuse. Branches piled up
// nightly across the fleet while every stamp stood still.

test('pullCreateError is null only on a 201 carrying a PR number', () => {
  assert.equal(pullCreateError(201, { number: 42, node_id: 'PR_x' }), null);
});

test('pullCreateError catches the Actions PR permission 403 and names the setting', () => {
  const msg = pullCreateError(403, {
    message: 'GitHub Actions is not permitted to create or approve pull requests',
  });
  assert.match(msg, /not permitted to create or approve pull requests/);
  assert.match(msg, /Allow GitHub Actions to create and approve pull requests/);
});

test('pullCreateError rejects a 201 with no PR number — a body that is not a PR', () => {
  assert.ok(pullCreateError(201, {}));
  assert.ok(pullCreateError(201, null));
});

test('pullCreateError falls back to the bare status when there is no message', () => {
  assert.match(pullCreateError(502, null), /HTTP 502/);
});

// GitHub's auto-merge is a queue for CHECKS. On a repo with no pull_request CI the
// mutation is rejected outright, and while that rejection was swallowed the PR sat
// open forever — a member that asked for auto-merge got no merge at all. Seven of
// twelve consumers had no pull_request trigger anywhere, so this was most of the
// fleet.

test('deliveryAction merges directly when there is no PR CI to gate on', () => {
  assert.equal(deliveryAction({ delivery: 'auto-merge', hasPrCi: false }), 'merge');
  assert.equal(deliveryAction({ delivery: 'auto-merge', hasPrCi: false, gate: 'present' }), 'merge');
});

test('deliveryAction arms only when the base branch has (or may have) a merge gate', () => {
  // Auto-merge queues behind what the base REQUIRES, not behind CI existing
  // (#677): with no gate the mutation is rejected "clean status" every time, so
  // arming is skipped in favour of verify-then-land. Unknown assumes a gate —
  // never merge past a gate we could not see.
  assert.equal(deliveryAction({ delivery: 'auto-merge', hasPrCi: true, gate: 'present' }), 'arm');
  assert.equal(deliveryAction({ delivery: 'auto-merge', hasPrCi: true, gate: 'unknown' }), 'arm');
  assert.equal(deliveryAction({ delivery: 'auto-merge', hasPrCi: true }), 'arm');
  assert.equal(deliveryAction({ delivery: 'auto-merge', hasPrCi: true, gate: 'absent' }), 'land');
});

test('deliveryAction never merges or arms a review-delivery member', () => {
  assert.equal(deliveryAction({ delivery: 'review', hasPrCi: false }), 'none');
  assert.equal(deliveryAction({ delivery: 'review', hasPrCi: true, gate: 'absent' }), 'none');
});

// --- the merge-gate read (#677, rebuilt) --------------------------------------
// Classifies what the BASE BRANCH requires from the two reads the Action token
// can make (branch.protected + the rulesets that apply to the branch). Unknown is
// never collapsed into absent: a gate we cannot see gets armed, not merged past.

test('classifyMergeGate: protected branch, or a blocking ruleset rule, is a present gate', () => {
  assert.equal(classifyMergeGate({ branchStatus: 200, branchJson: { protected: true }, rulesStatus: 200, rulesJson: [] }), 'present');
  assert.equal(classifyMergeGate({ branchStatus: 200, branchJson: { protected: false }, rulesStatus: 200, rulesJson: [{ type: 'required_status_checks' }] }), 'present');
  assert.equal(classifyMergeGate({ branchStatus: 200, branchJson: { protected: false }, rulesStatus: 200, rulesJson: [{ type: 'pull_request' }] }), 'present');
});

test('classifyMergeGate: unprotected with no blocking rules is absent; non-blocking rules do not gate', () => {
  assert.equal(classifyMergeGate({ branchStatus: 200, branchJson: { protected: false }, rulesStatus: 200, rulesJson: [] }), 'absent');
  assert.equal(classifyMergeGate({ branchStatus: 200, branchJson: { protected: false }, rulesStatus: 200, rulesJson: [{ type: 'deletion' }, { type: 'non_fast_forward' }] }), 'absent');
});

test('classifyMergeGate: an unreadable answer is unknown, not absent', () => {
  assert.equal(classifyMergeGate({ branchStatus: 404, branchJson: null, rulesStatus: 200, rulesJson: [] }), 'unknown');
  assert.equal(classifyMergeGate({ branchStatus: 200, branchJson: { protected: false }, rulesStatus: 403, rulesJson: null }), 'unknown');
});

// Judging a delivered PR by the runs on its own head (#455/#205/#95). An arm that
// failed permanently must not mean the PR sits open forever — it either lands on
// the evidence of its concluded runs, or the caller disposes of it (baselining
// closes and re-cuts; a landing pass leaves it standing).

const done = (conclusion, name = 'CI') => ({ name, status: 'completed', conclusion });

test('pullDisposition merges when the only non-success run is a gated action_required one', () => {
  assert.equal(pullDisposition({
    delivery: 'auto-merge', runs: [done('success'), done('action_required')],
  }), 'merge');
});

test('pullDisposition merges an all-green PR the arm never landed (auto-merge off)', () => {
  assert.equal(pullDisposition({ delivery: 'auto-merge', runs: [done('success')] }), 'merge');
});

test('pullDisposition closes rather than merges when CI really failed', () => {
  for (const bad of ['failure', 'timed_out', 'cancelled', 'startup_failure']) {
    assert.equal(pullDisposition({
      delivery: 'auto-merge', runs: [done('success'), done('action_required'), done(bad)],
    }), 'close', `${bad} must never be merged over`);
  }
});

test('pullDisposition waits while anything is still queued or running', () => {
  assert.equal(pullDisposition({
    delivery: 'auto-merge', runs: [done('success'), { name: 'CI', status: 'in_progress', conclusion: null }],
  }), 'wait');
  assert.equal(pullDisposition({
    delivery: 'auto-merge', runs: [{ name: 'CI', status: 'queued', conclusion: null }],
  }), 'wait');
});

test('pullDisposition closes a PR with no success to stand on rather than reusing it', () => {
  assert.equal(pullDisposition({ delivery: 'auto-merge', runs: [] }), 'close');
  assert.equal(pullDisposition({ delivery: 'auto-merge', runs: null }), 'close');
  assert.equal(pullDisposition({ delivery: 'auto-merge', runs: [done('action_required')] }), 'close');
  assert.equal(pullDisposition({ delivery: 'auto-merge', runs: [done('skipped')] }), 'close');
});

// A review member's PR is the owner's: never merged behind their back, and never
// closed out from under them either.
test('pullDisposition keeps a review-delivery member\'s PR whatever its runs say', () => {
  assert.equal(pullDisposition({ delivery: 'review', runs: [done('success')] }), 'keep');
  assert.equal(pullDisposition({ delivery: 'review', runs: [done('failure')] }), 'keep');
  assert.equal(pullDisposition({ delivery: 'review', runs: [] }), 'keep');
});

// --- same-run landing (#649) ---------------------------------------------------
// On a gated member EVERY arm fails, so deferring to disposal put a standing ~24h
// offset between a task's output and that member's main. The evidence arrives in
// seconds; landAttempt is disposal's decision made now instead of tomorrow.

test('landAttempt merges the gated shape in-cycle — the dispatched run passed', () => {
  assert.equal(landAttempt({ delivery: 'auto-merge', runs: [done('success'), done('action_required')] }), 'merge');
});

test('landAttempt polls while a run is still going, and gives up at the bound', () => {
  const running = [done('success'), { name: 'CI', status: 'in_progress', conclusion: null }];
  assert.equal(landAttempt({ delivery: 'auto-merge', runs: running, elapsedMs: 0 }), 'poll');
  assert.equal(landAttempt({ delivery: 'auto-merge', runs: running, elapsedMs: LAND_TIMEOUT_MS - 1 }), 'poll');
  // At the bound the PR is left standing, which is exactly the pre-existing behaviour.
  assert.equal(landAttempt({ delivery: 'auto-merge', runs: running, elapsedMs: LAND_TIMEOUT_MS }), 'give-up');
});

// The one place this must NOT mirror disposal. Disposal may close, because the PR
// it judges is last cycle's and this cycle re-cuts it; here the PR is this run's
// own delivery and closing it would discard the work that just ran.
test('landAttempt never closes this run\'s PR — a red or empty result just stands', () => {
  for (const runs of [[done('failure')], [done('success'), done('timed_out')], [], [done('action_required')]]) {
    assert.equal(landAttempt({ delivery: 'auto-merge', runs }), 'give-up', JSON.stringify(runs));
  }
});

// THE RACE THAT STRANDED SEVEN MEMBERS (2026-08-07): the worker dispatched the
// verification run and read the head sha 0.3s later, before the run had
// registered — and read the empty list as "nothing will ever verify this"
// instead of "the run I just started has not appeared yet". Fewer runs than the
// worker itself dispatched is a POLL, for the whole landing budget.
test('landAttempt waits for the runs it knows were dispatched before judging', () => {
  assert.equal(landAttempt({ delivery: 'auto-merge', runs: [], expected: 1, elapsedMs: 0 }), 'poll');
  assert.equal(landAttempt({ delivery: 'auto-merge', runs: [done('action_required')], expected: 2, elapsedMs: 0 }), 'poll');
  // The bound still holds — a dispatched run that never registers cannot wedge the cycle.
  assert.equal(landAttempt({ delivery: 'auto-merge', runs: [], expected: 1, elapsedMs: LAND_TIMEOUT_MS }), 'give-up');
  // Once everything expected is visible and concluded green, it lands.
  assert.equal(landAttempt({ delivery: 'auto-merge', runs: [done('success')], expected: 1 }), 'merge');
  // Nothing was dispatched and nothing is there: nothing will ever come — give up now.
  assert.equal(landAttempt({ delivery: 'auto-merge', runs: [], expected: 0 }), 'give-up');
});

test('landAttempt leaves a review member\'s PR alone', () => {
  assert.equal(landAttempt({ delivery: 'review', runs: [done('success')] }), 'give-up');
});

test('mergeReason names the gated run when there is one, and no false remedy otherwise', () => {
  assert.match(mergeReason([done('success'), done('action_required')]), /action_required/);
  // The no-gate shape has NO setting to fix (#677) — pointing an owner at
  // "Allow auto-merge" about a repo where nothing was wrong sent them to fix
  // something already correct.
  assert.doesNotMatch(mergeReason([done('success')]), /Allow auto-merge/);
  assert.match(mergeReason([done('success')]), /nothing on the base branch queues/);
});

test('failureSummary names the failing workflows, or the absence of a green one', () => {
  assert.match(failureSummary([done('failure', 'verify'), done('success')]), /verify failure/);
  assert.match(failureSummary([done('action_required')]), /no successful run/);
});

// --- disposing of the previous cycle's delivery (#787) -----------------------
// The promise "leaving it open for the next run to dispose of" had no
// implementation: the update runner's quiet-cycle early return fired before
// anything looked at open PRs, so a stranded PR was superseded by a duplicate the
// next cycle opened instead. These are the three outcomes that promise needs.

test('openDeliveredPull finds the family by branch PREFIX, since the name carries a seed', () => {
  const pulls = [
    { number: 1, head: { ref: 'feature/something' } },
    { number: 2, head: { ref: 'claudinite/update-2026-08-12-ja25ab' } },
  ];
  assert.equal(openDeliveredPull(pulls, 'claudinite/update')?.number, 2);
  assert.equal(openDeliveredPull(pulls, 'claudinite/maintenance'), null);
  // A caller with nothing to dispose of must get a clean null, not a throw.
  assert.equal(openDeliveredPull(undefined, 'claudinite/update'), null);
  assert.equal(openDeliveredPull([], 'claudinite/update'), null);
});

// A fetch stub over the three endpoints disposal touches, recording the writes.
function fetchStub({ runs = [], mergeStatus = 200, closeStatus = 200 }) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const path = String(url).replace('https://api.github.com', '');
    calls.push(`${opts.method ?? 'GET'} ${path.split('?')[0]}`);
    if (path.includes('/actions/runs')) return new Response(JSON.stringify({ workflow_runs: runs }), { status: 200 });
    if (path.endsWith('/merge')) return new Response('{}', { status: mergeStatus });
    if (/\/pulls\/\d+$/.test(path.split('?')[0])) return new Response('{}', { status: closeStatus });
    return new Response(null, { status: 204 });                  // branch delete
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const pr = { number: 42, head: { ref: 'claudinite/update-2026-08-12-abc', sha: 'deadbeef' } };
const run = (conclusion) => ({ name: 'ci', status: 'completed', conclusion });
const dispose = async (stub) => {
  const said = [];
  try {
    return { outcome: await disposeOpenPull({ token: 't', repo: 'o/r', pr, delivery: 'auto-merge', log: (s) => said.push(s) }), said };
  } finally { stub.restore(); }
};

test('a verified incumbent is MERGED, and says main moved so the caller can stop', async () => {
  // The exact shape that stranded TLDR #246: the gated pull_request run never ran
  // while the dispatched one passed. That content is verified — only the arm failed.
  const stub = fetchStub({ runs: [run('success'), run('action_required')] });
  const { outcome, said } = await dispose(stub);
  assert.equal(outcome, 'merged');
  assert.match(said.join('\n'), /merged PR #42/);
  assert.ok(stub.calls.includes('PUT /repos/o/r/pulls/42/merge'));
  assert.ok(stub.calls.includes('DELETE /repos/o/r/git/refs/heads/claudinite%2Fupdate-2026-08-12-abc'), 'the dead ref is tidied');
});

test('an incumbent with nothing green is CLOSED, so this cycle re-cuts it', async () => {
  const stub = fetchStub({ runs: [run('failure')] });
  const { outcome, said } = await dispose(stub);
  assert.equal(outcome, 'closed');
  assert.match(said.join('\n'), /closed PR #42 — it did not land/);
  assert.ok(stub.calls.includes('PATCH /repos/o/r/pulls/42'));
});

test('an incumbent still running is KEPT — a cycle never delivers on top of one', async () => {
  const stub = fetchStub({ runs: [{ name: 'ci', status: 'in_progress', conclusion: null }] });
  const { outcome, said } = await dispose(stub);
  assert.equal(outcome, 'kept');
  assert.match(said.join('\n'), /keeping PR #42 \(wait\)/);
  assert.ok(!stub.calls.some((c) => c.startsWith('PUT') || c.startsWith('PATCH')), 'nothing is written to a PR still in flight');
});

test('a merge that fails falls through to a close rather than leaving two PRs alive', async () => {
  const stub = fetchStub({ runs: [run('success')], mergeStatus: 405 });
  const { outcome } = await dispose(stub);
  assert.equal(outcome, 'closed');
});

test('an unreadable head, or a close that fails, KEEPS — never a silent clear way', async () => {
  // Both are the same judgement: the helper could not establish that the way is
  // clear, and the caller must skip rather than pile a second PR on top.
  const stub = fetchStub({ runs: [run('success')], mergeStatus: 405, closeStatus: 500 });
  assert.equal((await dispose(stub)).outcome, 'kept');
});

test('a review member\'s incumbent is never disposed of — it is the owner\'s to act on', async () => {
  const stub = fetchStub({ runs: [run('success')] });
  const said = [];
  try {
    assert.equal(await disposeOpenPull({ token: 't', repo: 'o/r', pr, delivery: 'review', log: (s) => said.push(s) }), 'kept');
  } finally { stub.restore(); }
  assert.ok(!stub.calls.some((c) => c.startsWith('PUT') || c.startsWith('PATCH')));
});
