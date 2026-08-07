import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pendingAgentic, heldStamp,
  maintenanceBranchName, openMaintenanceBranch, openMaintenancePull, shouldRequestAgent,
  unconfiguredSecrets, SECRETS_ISSUE_TITLE, canonSource,
  withheldWorkflowPaths, UNPUSHABLE_PREFIX, escalation, gateOutcome, GATE_ABSENT,
} from '../../packs/basics/tasks/baselining/worker.mjs';

// The worker's PURE decision helpers (task-prework DESIGN §7, E4). The
// native-git / clone / REST I/O in main() is validated by the live pilot; these
// are the git-free unit surface. The DELIVERY/LANDING helpers the worker used to
// own (delivery resolution, CI dispatch planning, the arm/land/merge decision)
// moved to the shared engine module and are tested there —
// engine-tests/scheduler/land-pr.test.mjs.

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

// --- required_secrets ask (task-prework DESIGN §9) --------------------
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
