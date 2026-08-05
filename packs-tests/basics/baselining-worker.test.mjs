import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDelivery, resolveDelivery, DEFAULT_DELIVERY, pendingAgentic, heldStamp,
  maintenanceBranchName, openMaintenanceBranch, openMaintenancePull, shouldRequestAgent,
  unconfiguredSecrets, SECRETS_ISSUE_TITLE, workflowTriggers, ciDispatchPlan,
  pullCreateError, deliveryAction, reconcileAction, reconcileReason, canonSource,
} from '../../packs/basics/tasks/baselining/worker.mjs';

// The worker's PURE decision helpers (agent-preprocessing DESIGN §7, E4). The
// native-git / clone / REST I/O in main() is validated by the live pilot; these
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
// and a hard failure would just fail baselining every night forever. Materialize
// the default instead. An UNRECOGNIZED value stays a hard failure: substituting a
// default there would deliver the opposite of a stated intent.
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

test('pendingAgentic keeps notes dated on/after the stamp DAY (same-day inclusive), oldest first', () => {
  const notes = [
    { id: 'newer', landed: '2026-07-25' },
    { id: 'sameday', landed: '2026-07-18' },
    { id: 'older', landed: '2026-07-10' },
  ];
  const pending = pendingAgentic(notes, '2026-07-18T09:00:00.000Z');
  assert.deepEqual(pending.map((n) => n.id), ['sameday', 'newer']); // 'older' dropped; sorted asc
});

test('pendingAgentic with no prior stamp returns all, sorted oldest first', () => {
  const notes = [{ id: 'b', landed: '2026-07-20' }, { id: 'a', landed: '2026-07-01' }];
  assert.deepEqual(pendingAgentic(notes, undefined).map((n) => n.id), ['a', 'b']);
  assert.deepEqual(pendingAgentic([], '2026-07-01').length, 0);
});

test('heldStamp is the day BEFORE the earliest pending note; null when nothing pends', () => {
  assert.equal(heldStamp([{ id: 'x', landed: '2026-07-19' }]), '2026-07-18T00:00:00.000Z');
  // month boundary: the day before the 1st is the previous month's last day
  assert.equal(heldStamp([{ id: 'y', landed: '2026-08-01' }]), '2026-07-31T00:00:00.000Z');
  assert.equal(heldStamp([]), null);
});

test('maintenanceBranchName carries the prefix, date, and seed', () => {
  assert.equal(maintenanceBranchName('2026-07-23', 'ab12cd'), 'claudinite/maintenance-2026-07-23-ab12cd');
});

test('openMaintenanceBranch finds an open PR head by prefix, else null', () => {
  const pulls = [{ head: { ref: 'feature/x' } }, { head: { ref: 'claudinite/maintenance-2026-07-23-zz' } }];
  assert.equal(openMaintenanceBranch(pulls), 'claudinite/maintenance-2026-07-23-zz');
  assert.equal(openMaintenanceBranch([{ head: { ref: 'other' } }]), null);
  assert.equal(openMaintenanceBranch([]), null);
  assert.equal(openMaintenanceBranch(undefined), null);
});

// deliver() re-asserts the auto-merge arm on EVERY cycle, so the reuse path needs
// the PR's node_id, not just its head ref — hence the whole object.
test('openMaintenancePull returns the whole PR, so a reused one can still be armed', () => {
  const mine = { node_id: 'PR_kw1', head: { ref: 'claudinite/maintenance-2026-07-23-zz' } };
  assert.equal(openMaintenancePull([{ head: { ref: 'feature/x' } }, mine]), mine);
  assert.equal(openMaintenancePull([{ head: { ref: 'other' } }]), null);
  assert.equal(openMaintenancePull([]), null);
  assert.equal(openMaintenancePull(undefined), null);
});

test('shouldRequestAgent: agent iff a pending note, or a change left non-green', () => {
  assert.equal(shouldRequestAgent({ pendingCount: 1, meaningfulChange: false, checksPass: true }), true);  // agentic note
  assert.equal(shouldRequestAgent({ pendingCount: 0, meaningfulChange: true, checksPass: false }), true);  // change, not green
  assert.equal(shouldRequestAgent({ pendingCount: 0, meaningfulChange: true, checksPass: true }), false);  // change, green → agentless
  assert.equal(shouldRequestAgent({ pendingCount: 0, meaningfulChange: false, checksPass: false }), false); // no change → agentless
});

// --- required_secrets ask (agent-preprocessing DESIGN §9) --------------------
// The wiring converge stamps every declared name into the workflow, so by the time
// the worker runs the value is either in the environment or genuinely unset. That
// makes the ask a plain env read — no probe, no bundle, no engine-side machinery.

test('unconfiguredSecrets: a stamped-and-set secret is not asked about', () => {
  assert.deepEqual(unconfiguredSecrets(['SOME_API_KEY'], { SOME_API_KEY: 'v' }), []);
});

test('unconfiguredSecrets: an unset name is asked about — and so is the empty string Actions renders for one', () => {
  assert.deepEqual(unconfiguredSecrets(['SOME_API_KEY'], {}), ['SOME_API_KEY']);
  assert.deepEqual(unconfiguredSecrets(['SOME_API_KEY'], { SOME_API_KEY: '' }), ['SOME_API_KEY']);
});

test('unconfiguredSecrets: reports only the missing ones, and nothing when none are declared', () => {
  assert.deepEqual(unconfiguredSecrets(['A', 'B'], { A: 'set' }), ['B']);
  assert.deepEqual(unconfiguredSecrets([], { A: 'set' }), []);
  assert.deepEqual(unconfiguredSecrets(undefined, {}), []);
});

test('the ask issue title is a stable exact-match key (the at-most-one-open guard depends on it)', () => {
  assert.equal(SECRETS_ISSUE_TITLE, 'Claudinite: configure required Actions secrets');
});

// --- CI dispatch on the maintenance PR (#565) --------------------------------
// A branch pushed and a PR opened over the Action's GITHUB_TOKEN emit no
// pull_request run (GitHub's recursion guard), so deliver() must start the PR's
// checks itself via workflow_dispatch — the guard's documented exception. These
// cover the pure planning half: reading a workflow's `on:` triggers and picking
// which files to dispatch.

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

// The PR-open POST is status-checked. Before this, deliver() destructured only
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
// twelve consumers have no pull_request trigger anywhere, so this was most of the
// fleet.

test('deliveryAction merges directly when there is no PR CI to gate on', () => {
  assert.equal(deliveryAction({ delivery: 'auto-merge', hasPrCi: false }), 'merge');
});

test('deliveryAction arms auto-merge when the repo does have PR CI', () => {
  assert.equal(deliveryAction({ delivery: 'auto-merge', hasPrCi: true }), 'arm');
});

test('deliveryAction never merges or arms a review-delivery member', () => {
  assert.equal(deliveryAction({ delivery: 'review', hasPrCi: false }), 'none');
  assert.equal(deliveryAction({ delivery: 'review', hasPrCi: true }), 'none');
});

// The reconcile (#455/#205/#95): an arm that failed permanently must not mean a
// maintenance PR sits open forever on top of green CI. The gated-run shape is
// the one that produced these issues — the dispatched run passed, and a
// pull_request run that NEVER EXECUTED is what auto-merge refuses over.

const done = (conclusion, name = 'CI') => ({ name, status: 'completed', conclusion });

test('reconcileAction merges when the only non-success run is a gated action_required one', () => {
  assert.equal(reconcileAction({
    delivery: 'auto-merge', runs: [done('success'), done('action_required')],
  }), 'merge');
});

test('reconcileAction merges an all-green PR the arm never landed (auto-merge off)', () => {
  assert.equal(reconcileAction({ delivery: 'auto-merge', runs: [done('success')] }), 'merge');
});

test('reconcileAction is blocked by a real failure, gated run or not', () => {
  for (const bad of ['failure', 'timed_out', 'cancelled', 'startup_failure']) {
    assert.equal(reconcileAction({
      delivery: 'auto-merge', runs: [done('success'), done('action_required'), done(bad)],
    }), 'blocked', `${bad} must block the reconcile`);
  }
});

test('reconcileAction waits while anything is still queued or running', () => {
  assert.equal(reconcileAction({
    delivery: 'auto-merge', runs: [done('success'), { name: 'CI', status: 'in_progress', conclusion: null }],
  }), 'wait');
  assert.equal(reconcileAction({
    delivery: 'auto-merge', runs: [{ name: 'CI', status: 'queued', conclusion: null }],
  }), 'wait');
});

test('reconcileAction never merges without a success to stand on', () => {
  assert.equal(reconcileAction({ delivery: 'auto-merge', runs: [] }), 'none');
  assert.equal(reconcileAction({ delivery: 'auto-merge', runs: null }), 'none');
  assert.equal(reconcileAction({ delivery: 'auto-merge', runs: [done('action_required')] }), 'none');
  assert.equal(reconcileAction({ delivery: 'auto-merge', runs: [done('skipped')] }), 'none');
});

test('reconcileAction leaves a review-delivery member alone however green it is', () => {
  assert.equal(reconcileAction({ delivery: 'review', runs: [done('success')] }), 'none');
});

test('reconcileReason names the gated run when there is one, the arm otherwise', () => {
  assert.match(reconcileReason([done('success'), done('action_required')]), /action_required/);
  assert.match(reconcileReason([done('success')]), /Allow auto-merge/);
});

// A converged mount that cannot pass its own self-test escalates to the agent
// even when the diff looks clean and the content checks report green. That
// combination is exactly #555: a pack that fails validation contributes NO
// rules, so check_the_world went on reporting green about a corpus it had
// stopped running.

test('shouldRequestAgent escalates on a failed self-test even when checks report green', () => {
  assert.equal(shouldRequestAgent({
    pendingCount: 0, meaningfulChange: true, checksPass: true, selftestOk: false,
  }), true);
});

test('shouldRequestAgent escalates on a failed self-test even with no visible change', () => {
  assert.equal(shouldRequestAgent({
    pendingCount: 0, meaningfulChange: false, checksPass: true, selftestOk: false,
  }), true);
});

test('shouldRequestAgent defaults selftestOk true, so an older mount without one is unchanged', () => {
  assert.equal(shouldRequestAgent({ pendingCount: 0, meaningfulChange: true, checksPass: true }), false);
});

// --- rehearsal mode (#593 phase 0) ------------------------------------------
// A run can be pointed at a canon BRANCH so a change is tried against a real
// repo before it merges. The stamp is why this needs a decision of its own: a
// branch head is not on trunk, and stamping it leaves the member in the exact
// `ref-not-on-trunk` shape the #328 guard then refuses to converge over.

test('canonSource defaults to the canon default branch, and is not a rehearsal', () => {
  const s = canonSource({});
  assert.equal(s.ref, null);
  assert.equal(s.rehearsal, false);
  assert.match(s.url, /missingbulb\/Claudinite/);
});

test('canonSource treats a ref as a rehearsal', () => {
  const s = canonSource({ CLAUDINITE_CANON_REF: 'claude/some-branch' });
  assert.equal(s.ref, 'claude/some-branch');
  assert.equal(s.rehearsal, true);
});

test('canonSource ignores a blank ref — an unset Actions input arrives as ""', () => {
  assert.equal(canonSource({ CLAUDINITE_CANON_REF: '' }).rehearsal, false);
  assert.equal(canonSource({ CLAUDINITE_CANON_REF: '   ' }).rehearsal, false);
});

test('canonSource honours a fork url, and falls back when it is blank', () => {
  assert.equal(canonSource({ CLAUDINITE_CANON_URL: 'https://example.test/x.git' }).url, 'https://example.test/x.git');
  assert.match(canonSource({ CLAUDINITE_CANON_URL: '' }).url, /missingbulb\/Claudinite/);
});
