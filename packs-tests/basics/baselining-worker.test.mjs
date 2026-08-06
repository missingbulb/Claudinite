import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDelivery, resolveDelivery, DEFAULT_DELIVERY, pendingAgentic, heldStamp,
  maintenanceBranchName, openMaintenanceBranch, openMaintenancePull, shouldRequestAgent,
  unconfiguredSecrets, SECRETS_ISSUE_TITLE, workflowTriggers, ciDispatchPlan,
  pullCreateError, deliveryAction, pullDisposition, mergeReason, failureSummary, canonSource,
  withheldWorkflowPaths, UNPUSHABLE_PREFIX, escalation, gateOutcome, GATE_ABSENT,
  landAttempt, LAND_TIMEOUT_MS, mergeGatePresent, armFailureAdvice, NO_GATE_REASON,
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

// --- the escalation REASON (#664) -------------------------------------------
// The worker knows which of four conditions fired; before this it threw that away and
// the woken agent re-derived it from the repo — wrongly, on EdFringeAllocator#82.

test('escalation names the condition, and shouldRequestAgent is derived from it', () => {
  // The drift guard: one decision, two readings. A precedence that disagreed with its
  // own bit is exactly the two-copies failure this shape exists to prevent.
  const cases = [
    { pendingCount: 1, meaningfulChange: false, checksPass: true },
    { pendingCount: 0, meaningfulChange: true, checksPass: true, withheldCount: 2 },
    { pendingCount: 0, meaningfulChange: false, checksPass: true, selftestOk: false },
    { pendingCount: 0, meaningfulChange: true, checksPass: false },
    { pendingCount: 0, meaningfulChange: true, checksPass: true },
    { pendingCount: 0, meaningfulChange: false, checksPass: false },
  ];
  for (const c of cases) {
    assert.equal(shouldRequestAgent(c), escalation(c) !== null, JSON.stringify(c));
  }
});

test('escalation: each condition gets its own code, in precedence order', () => {
  assert.equal(escalation({ pendingCount: 2, meaningfulChange: true, checksPass: false }).code, 'agentic-notes');
  assert.equal(escalation({ pendingCount: 0, meaningfulChange: true, checksPass: true, withheldCount: 1 }).code, 'withheld-workflows');
  assert.equal(escalation({ pendingCount: 0, meaningfulChange: true, checksPass: true, selftestOk: false }).code, 'selftest-failed');
  assert.equal(escalation({ pendingCount: 0, meaningfulChange: true, checksPass: false }).code, 'checks-not-green');
  assert.equal(escalation({ pendingCount: 0, meaningfulChange: true, checksPass: true }), null);
});

test('escalation: a gate that could not run is not the same sentence as a gate that failed', () => {
  // The distinction `catch { return false }` erased: a verdict about the repo vs no
  // verdict at all. Both escalate; only one is a statement about the content.
  assert.equal(escalation({
    pendingCount: 0, meaningfulChange: true, checksPass: false, checksCrashed: true,
  }).code, 'checks-could-not-run');
  assert.equal(escalation({
    pendingCount: 0, meaningfulChange: true, checksPass: true, selftestOk: false, selftestCrashed: true,
  }).code, 'selftest-could-not-run');
});

test('escalation: the detail counts what fired, and never carries findings', () => {
  const notes = escalation({ pendingCount: 3, meaningfulChange: false, checksPass: true });
  assert.match(notes.detail, /3 pending agentic migration note/);
  const withheld = escalation({ pendingCount: 0, meaningfulChange: true, checksPass: true, withheldCount: 2 });
  assert.match(withheld.detail, /2 workflow file/);
  // Every detail is a sentence about the CONDITION — the §3 boundary the payload rides.
  for (const c of [notes, withheld, escalation({ pendingCount: 0, meaningfulChange: true, checksPass: false })]) {
    assert.equal(typeof c.detail, 'string');
    assert.ok(c.detail.length > 0 && c.detail.length < 160, c.detail);
  }
});

// --- gate outcomes (#665) ----------------------------------------------------
// Both gates the worker escalates on used to collapse to a boolean and drop the
// findings that explained it — so an escalation was unexplainable after the fact.

test('gateOutcome: a clean run is green with nothing to say', () => {
  assert.deepEqual(gateOutcome(null), { ok: true, ran: true, crashed: false, status: 0, output: '' });
});

test('gateOutcome: a non-zero exit keeps the findings the check printed', () => {
  const out = gateOutcome({ status: 1, stdout: 'FINDING: x\n', stderr: '' });
  assert.equal(out.ok, false);
  assert.equal(out.crashed, false);   // it answered — the answer was "no"
  assert.equal(out.status, 1);
  assert.match(out.output, /FINDING: x/);
});

test('gateOutcome: no exit status at all is a crash, not a verdict', () => {
  // A signal kill or a spawn failure (ENOENT) produces no status. The repo was never
  // judged, and saying "not green" about it would be a claim nothing made.
  for (const e of [{ status: null, signal: 'SIGKILL' }, { code: 'ENOENT', stderr: 'not found' }]) {
    const out = gateOutcome(e);
    assert.equal(out.ok, false);
    assert.equal(out.crashed, true);
    assert.equal(out.status, null);
  }
});

test('GATE_ABSENT: a gate that is not vendored is nothing to run, not a failure', () => {
  assert.equal(GATE_ABSENT.ok, true);
  assert.equal(GATE_ABSENT.ran, false);
  assert.equal(GATE_ABSENT.crashed, false);
});

// --- the unpushable set ------------------------------------------------------
// The Action's GITHUB_TOKEN may not write under .github/workflows/, and GitHub
// rejects the WHOLE ref when a push contains one. Withholding those paths is what
// keeps one undeliverable file from failing the mount converge, the wiring, and
// every other note along with it.

test('withheldWorkflowPaths: selects workflow files and nothing else', () => {
  const changed = [
    '.claudinite-checks.json',
    '.claudinite/shared/engine/scheduler/run.mjs',
    '.github/workflows/fleet-baseline.yml',
    '.github/workflows/claudinite-scheduler.yml',   // convergeWiring's own output — the latent case
    '.github/actions/report-failure/action.yml',    // an action, not a workflow: pushable
    'docs/workflows/notes.md',                      // the prefix must anchor, not merely appear
  ];
  assert.deepEqual(withheldWorkflowPaths(changed), [
    '.github/workflows/fleet-baseline.yml',
    '.github/workflows/claudinite-scheduler.yml',
  ]);
});

test('withheldWorkflowPaths: an ordinary converge withholds nothing, and a missing list is not a crash', () => {
  assert.deepEqual(withheldWorkflowPaths(['.claudinite-checks.json']), []);
  assert.deepEqual(withheldWorkflowPaths([]), []);
  assert.deepEqual(withheldWorkflowPaths(undefined), []);
  assert.equal(UNPUSHABLE_PREFIX, '.github/workflows/');
});

test('shouldRequestAgent: a withheld workflow file escalates — nothing else can land it', () => {
  // Green, no note, no self-test failure: agentless by every other measure. But the
  // file the converge could not push would then never land at all, and the cycle would
  // report itself clean while the repo stayed un-updated.
  assert.equal(shouldRequestAgent({
    pendingCount: 0, meaningfulChange: true, checksPass: true, withheldCount: 1,
  }), true);
  // And the default keeps every existing caller's verdict unchanged.
  assert.equal(shouldRequestAgent({ pendingCount: 0, meaningfulChange: true, checksPass: true }), false);
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
  assert.equal(deliveryAction({ delivery: 'auto-merge', hasPrCi: true, hasMergeGate: true }), 'arm');
});

test('deliveryAction never merges or arms a review-delivery member', () => {
  assert.equal(deliveryAction({ delivery: 'review', hasPrCi: false }), 'none');
  assert.equal(deliveryAction({ delivery: 'review', hasPrCi: true }), 'none');
});

// The second way to have nothing to wait for (#674): CI that runs but that the
// base branch requires nothing of. `"protected": false` and no ruleset means the
// PR is mergeable the whole time its checks run, so the arm is rejected as
// "clean status" exactly as it is on a repo with no CI — but the checks are real
// and must still be honoured, which is why this is `land`, not `merge`.
test('deliveryAction lands on the runs, rather than arming, when nothing requires the PR to wait', () => {
  assert.equal(deliveryAction({ delivery: 'auto-merge', hasPrCi: true, hasMergeGate: false }), 'land');
});

test('deliveryAction still merges outright when there is no CI to honour, gate or not', () => {
  assert.equal(deliveryAction({ delivery: 'auto-merge', hasPrCi: false, hasMergeGate: false }), 'merge');
  assert.equal(deliveryAction({ delivery: 'auto-merge', hasPrCi: false, hasMergeGate: true }), 'merge');
});

// An older caller that knows nothing of the gate must keep arming, never merge
// past a protection it could not see.
test('deliveryAction assumes a gate when none was read', () => {
  assert.equal(deliveryAction({ delivery: 'auto-merge', hasPrCi: true }), 'arm');
});

// A gate is anything auto-merge can wait behind — required checks OR required
// review — so this asks whether the base branch blocks a PR at all, and never
// which rule does it.
test('mergeGatePresent reads classic protection off the branch', () => {
  assert.equal(mergeGatePresent({ branch: { protected: true }, rules: [] }), true);
  assert.equal(mergeGatePresent({ branch: { protected: false }, rules: [] }), false);
});

test('mergeGatePresent reads a ruleset that requires something of a PR', () => {
  const branch = { protected: false };
  assert.equal(mergeGatePresent({ branch, rules: [{ type: 'required_status_checks' }] }), true);
  assert.equal(mergeGatePresent({ branch, rules: [{ type: 'pull_request' }] }), true);
});

test('mergeGatePresent ignores rules a merge never waits on', () => {
  assert.equal(mergeGatePresent({ branch: { protected: false }, rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }] }), false);
});

test('mergeGatePresent treats a missing read as no gate, leaving the caller to default', () => {
  assert.equal(mergeGatePresent({}), false);
  assert.equal(mergeGatePresent(), false);
});

// Disposing of the previous cycle's PR (#455/#205/#95). An arm that failed
// permanently must not mean a maintenance PR sits open forever — so a PR either
// lands on the evidence of its own concluded runs, or it is closed and re-cut.
// Nothing is ever inherited: baselining is deterministic and idempotent, so the
// previous attempt carries nothing this one needs.

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

// --- same-cycle landing (#649) ----------------------------------------------
// On a gated member EVERY arm fails, so deferring to disposal put a standing ~24h
// offset between canon and that member's main. The evidence arrives in seconds;
// landAttempt is disposal's decision made now instead of tomorrow.

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
// it judges is last cycle's and this cycle re-cuts it; here the PR is this cycle's
// own delivery and closing it would discard the converge that just ran.
test('landAttempt never closes this cycle\'s PR — a red or empty result just stands', () => {
  for (const runs of [[done('failure')], [done('success'), done('timed_out')], [], [done('action_required')]]) {
    assert.equal(landAttempt({ delivery: 'auto-merge', runs }), 'give-up', JSON.stringify(runs));
  }
});

test('landAttempt leaves a review member\'s PR alone', () => {
  assert.equal(landAttempt({ delivery: 'review', runs: [done('success')] }), 'give-up');
});

test('mergeReason names the gated run when there is one, the arm otherwise', () => {
  assert.match(mergeReason([done('success'), done('action_required')]), /action_required/);
  assert.match(mergeReason([done('success')]), /Allow auto-merge/);
});

// The shape with no remedy. Sending an owner to fix a setting that is already
// correct is worse than saying nothing, and it is what an unprotected base branch
// got told every cycle.
test('mergeReason blames no setting when GitHub rejected the arm as already-mergeable', () => {
  const reason = mergeReason([done('success')], 'Pull request is in clean status');
  assert.equal(reason, NO_GATE_REASON);
  assert.doesNotMatch(reason, /Settings/);
});

test('armFailureAdvice names both repo settings, except where neither is the cause', () => {
  assert.match(armFailureAdvice('auto-merge is not allowed for this repository'), /Allow auto-merge/);
  assert.match(armFailureAdvice('Pull request is in clean status'), /nothing for auto-merge to wait behind/i);
  assert.doesNotMatch(armFailureAdvice('Pull request is in clean status'), /Settings/);
});

test('failureSummary names the failing workflows, or the absence of a green one', () => {
  assert.match(failureSummary([done('failure', 'verify'), done('success')]), /verify failure/);
  assert.match(failureSummary([done('action_required')]), /no successful run/);
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
