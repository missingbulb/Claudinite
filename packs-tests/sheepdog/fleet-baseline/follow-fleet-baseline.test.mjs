import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  settle, timedOut, pickDispatchedRun, runDurationMs, splitAnnotations, failedSteps,
  deliveryOf, stampedRef, parseFollowMinutes, asBool, humanDuration, didUpdate,
  memberRow, findingsSection, renderFollowReport, followFleet, findMaintenancePull,
  findAgentIssue, collectFindings, MAINT_PREFIX, AGENT_ISSUE_PREFIX,
} from '../../../packs/sheepdog/fleet-baseline/follow-fleet-baseline.mjs';

// The follow half's judgement is `settle` — the table that decides when a member has
// FINISHED baselining, as opposed to when its Actions run went green. Every branch is a
// different wait-or-stop decision, so each is exercised on its own: a test that only
// asserted done/not-done would let the reasons collapse, and the reasons are what the
// summary reports.

test('settle: a run that has not appeared, or has not finished, is a wait', () => {
  assert.equal(settle({ run: null }).done, false);
  assert.equal(settle({ run: null }).state, 'awaiting-run');
  const running = settle({ run: { status: 'in_progress' } });
  assert.equal(running.done, false);
  assert.equal(running.state, 'running');
});

test('settle: a failed member run stops the wait and is not ok — no PR is coming', () => {
  const v = settle({ run: { status: 'completed', conclusion: 'failure' } });
  assert.equal(v.done, true);
  assert.equal(v.ok, false);
  assert.equal(v.state, 'run-failed');
  assert.match(v.detail, /failure/);
});

// The case the whole file exists for: the Actions run is green and over, and the actual
// baselining has not started yet.
test('settle: an open agent dispatch issue keeps the follow waiting even on a green run', () => {
  const v = settle({
    run: { status: 'completed', conclusion: 'success' },
    pull: { number: 7, state: 'open', merged: false },
    agent: { number: 9, state: 'open' },
    delivery: 'auto-merge',
  });
  assert.equal(v.done, false);
  assert.equal(v.state, 'agent-working');
  assert.match(v.detail, /#9/);
});

test('settle: no PR on a green run is a finished no-op, and names whether an agent ran', () => {
  const quiet = settle({ run: { status: 'completed', conclusion: 'success' } });
  assert.deepEqual([quiet.done, quiet.ok, quiet.state], [true, true, 'no-change']);

  const agentic = settle({
    run: { status: 'completed', conclusion: 'success' },
    agent: { number: 4, state: 'closed' },
  });
  assert.deepEqual([agentic.done, agentic.ok, agentic.state], [true, true, 'agent-no-pr']);
});

test('settle: merged is the win; closed-unmerged is done but not ok', () => {
  const run = { status: 'completed', conclusion: 'success' };
  const merged = settle({ run, pull: { number: 3, state: 'closed', merged: true }, delivery: 'auto-merge' });
  assert.deepEqual([merged.done, merged.ok, merged.state], [true, true, 'converged']);

  const closed = settle({ run, pull: { number: 3, state: 'closed', merged: false }, delivery: 'auto-merge' });
  assert.deepEqual([closed.done, closed.ok, closed.state], [true, false, 'pr-closed']);
});

// A `review` member's PR is the owner's to merge on their own clock. Waiting for it would
// hang every followed run until the deadline, and report a healthy member as a failure.
test('settle: an open PR ends the wait for a review member and continues it for auto-merge', () => {
  const run = { status: 'completed', conclusion: 'success' };
  const pull = { number: 11, state: 'open', merged: false };
  const review = settle({ run, pull, delivery: 'review' });
  assert.deepEqual([review.done, review.ok, review.state], [true, true, 'open-for-review']);

  const auto = settle({ run, pull, delivery: 'auto-merge' });
  assert.equal(auto.done, false);
  assert.equal(auto.state, 'pr-open');
});

test('timedOut: carries the state the member was stuck in — that is the diagnosis', () => {
  const v = timedOut({ state: 'agent-working', detail: 'agentic baselining in flight (issue #9)' }, 45);
  assert.equal(v.done, true);
  assert.equal(v.ok, false);
  assert.equal(v.state, 'timed-out');
  assert.match(v.detail, /agent-working/);
  assert.match(v.detail, /45 minutes/);
});

// --- identifying OUR run ------------------------------------------------------

test('pickDispatchedRun: the run we started, not the cron run that fired beside it', () => {
  const t = Date.parse('2026-08-06T10:00:00Z');
  const runs = [
    { id: 100, created_at: '2026-08-06T09:10:00Z' },   // the hourly cron run, before us
    { id: 101, created_at: '2026-08-06T10:00:05Z' },   // ours
    { id: 102, created_at: '2026-08-06T10:00:30Z' },   // a second run started after ours
  ];
  assert.equal(pickDispatchedRun(runs, { afterRunId: 100, sinceMs: t }).id, 101);
  assert.equal(pickDispatchedRun(runs, { afterRunId: 102, sinceMs: t }), null);
});

test('pickDispatchedRun: with no prior run to be newer than, the timestamp bound carries it', () => {
  const t = Date.parse('2026-08-06T10:00:00Z');
  const runs = [{ id: 5, created_at: '2026-08-05T10:00:00Z' }, { id: 6, created_at: '2026-08-06T10:00:10Z' }];
  assert.equal(pickDispatchedRun(runs, { afterRunId: null, sinceMs: t }).id, 6);
});

// Clock skew between this runner and GitHub is real, and the failure it causes is silent:
// a run stamped a few seconds before our own clock says we dispatched must not be dropped.
test('pickDispatchedRun: a small backwards skew does not lose the run', () => {
  const t = Date.parse('2026-08-06T10:00:00Z');
  const runs = [{ id: 9, created_at: '2026-08-06T09:59:30Z' }];
  assert.equal(pickDispatchedRun(runs, { afterRunId: 8, sinceMs: t }).id, 9);
});

test('runDurationMs: unknown when a timestamp is missing, never zero', () => {
  assert.equal(runDurationMs({ run_started_at: '2026-08-06T10:00:00Z', updated_at: '2026-08-06T10:04:00Z' }), 240_000);
  assert.equal(runDurationMs({ run_started_at: '2026-08-06T10:00:00Z' }), null);
  assert.equal(runDurationMs(null), null);
});

// --- what went wrong ----------------------------------------------------------

test('splitAnnotations: failures and warnings are kept apart, notices are dropped', () => {
  const { errors, warnings } = splitAnnotations([
    { annotation_level: 'failure', message: 'boom', path: 'a.mjs', title: 'check' },
    { annotation_level: 'warning', message: 'hmm', path: 'b.mjs' },
    { annotation_level: 'notice', message: 'fyi' },
  ]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, 'boom');
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].path, 'b.mjs');
});

// A step that exits non-zero without emitting `::error::` produces no annotation at all —
// so a red run would otherwise show an empty error column.
test('failedSteps: a non-green step is an error even with no annotation behind it', () => {
  const out = failedSteps([{
    name: 'schedule',
    steps: [{ name: 'Evaluate', conclusion: 'failure' }, { name: 'Checkout', conclusion: 'success' }],
  }]);
  assert.equal(out.length, 1);
  assert.match(out[0].title, /schedule › Evaluate/);
});

// --- reading the member's own declaration -------------------------------------

test('deliveryOf: review and its alias are the only thing that changes the wait', () => {
  assert.equal(deliveryOf({ maintenance: { delivery: 'review' } }), 'review');
  assert.equal(deliveryOf({ maintenance: { delivery: 'pr' } }), 'review');
  assert.equal(deliveryOf({ maintenance: { delivery: 'auto-merge' } }), 'auto-merge');
  assert.equal(deliveryOf({}), 'auto-merge');
  assert.equal(deliveryOf(null), 'auto-merge');
});

test('stampedRef: the canon commit is the member version, absent when never vendored', () => {
  assert.equal(stampedRef({ claudinite: { ref: 'abc1234def' } }), 'abc1234def');
  assert.equal(stampedRef({}), null);
});

test('parseFollowMinutes / asBool: junk inputs fall back rather than failing the sweep', () => {
  assert.equal(parseFollowMinutes('30'), 30);
  assert.equal(parseFollowMinutes(''), 45);
  assert.equal(parseFollowMinutes('soon'), 45);
  assert.equal(parseFollowMinutes('0'), 45);
  assert.equal(parseFollowMinutes('-5', 10), 10);
  assert.equal(asBool('true'), true);
  assert.equal(asBool('false', true), false);
  assert.equal(asBool('', true), true);
});

test('humanDuration: seconds, minutes, hours — and unknown stays unknown', () => {
  assert.equal(humanDuration(4_000), '4s');
  assert.equal(humanDuration(125_000), '2m 5s');
  assert.equal(humanDuration(3 * 3600e3 + 4 * 60e3), '3h 4m');
  assert.equal(humanDuration(null), '—');
});

test('didUpdate: a moved stamp or a merged PR — not a forced run that changed nothing', () => {
  assert.equal(didUpdate({ beforeRef: 'aaa', afterRef: 'bbb' }), true);
  assert.equal(didUpdate({ beforeRef: 'aaa', afterRef: 'aaa' }), false);
  assert.equal(didUpdate({ beforeRef: 'aaa', afterRef: 'aaa', pull: { merged: true } }), true);
});

// --- the loop -----------------------------------------------------------------

// The end-to-end shape, with an injected clock and sleep: a member whose run is still
// going, then completes, then merges its PR — the sweep must keep polling across all
// three and stop at the merge, not at the green run.
test('followFleet: polls until the PR lands, then finalizes with the new stamp', async () => {
  let tick = 0;
  const gh = async (path) => {
    if (path.includes('/actions/workflows/')) {
      return { status: 200, json: { workflow_runs: [{ id: 2, created_at: '2026-08-06T10:00:05Z', status: 'in_progress', html_url: 'u' }] } };
    }
    if (/\/actions\/runs\/2$/.test(path)) {
      return { status: 200, json: { id: 2, status: 'completed', conclusion: 'success', run_started_at: '2026-08-06T10:00:05Z', updated_at: '2026-08-06T10:03:05Z' } };
    }
    if (path.includes('/pulls?')) {
      return { status: 200, json: [{ number: 12, head: { ref: `${MAINT_PREFIX}-2026-08-06-ab12` }, created_at: '2026-08-06T10:02:00Z', state: 'open' }] };
    }
    if (/\/pulls\/12$/.test(path)) {
      // Merged only from the second poll on, so the loop is proven to keep going.
      const merged = tick > 1;
      return { status: 200, json: { number: 12, state: merged ? 'closed' : 'open', merged_at: merged ? '2026-08-06T10:05:00Z' : null, additions: 40, deletions: 12, changed_files: 5, html_url: 'p' } };
    }
    if (path.includes('/issues?')) return { status: 200, json: [] };
    if (path.includes('/jobs')) return { status: 200, json: { jobs: [{ id: 55, name: 'schedule', steps: [{ name: 'Evaluate', conclusion: 'success' }] }] } };
    if (path.includes('/check-runs/')) return { status: 200, json: [{ annotation_level: 'warning', message: 'slow step' }] };
    if (path.includes('/contents/')) {
      return { status: 200, json: { content: Buffer.from(JSON.stringify({ claudinite: { ref: 'newsha0000' } })).toString('base64') } };
    }
    throw new Error(`unexpected ${path}`);
  };
  const w = {
    fullName: 'o/alpha', delivery: 'auto-merge', beforeRef: 'oldsha0000', afterRef: 'oldsha0000',
    afterRunId: 1, dispatchedAtMs: Date.parse('2026-08-06T10:00:00Z'), verdict: null,
  };
  const logs = [];
  const { watches } = await followFleet(gh, [w], {
    workflow: 'claudinite-scheduler.yml',
    now: () => Date.parse('2026-08-06T10:00:00Z') + (tick += 1) * 1000,
    sleep: async () => {},
    log: (m) => logs.push(m),
  });
  assert.equal(watches[0].verdict.state, 'converged');
  assert.equal(watches[0].afterRef, 'newsha0000');
  assert.equal(watches[0].pull.additions, 40);
  assert.equal(watches[0].warnings.length, 1);
  assert.equal(watches[0].durationMs, 180_000);
  // Progress reaches the Action log as it happens — a 40-minute silence is not a report.
  assert.ok(logs.some((l) => /o\/alpha finished \(converged\)/.test(l)), logs.join('\n'));
});

test('followFleet: the deadline ends the follow with a report, not a hang', async () => {
  const gh = async (path) => {
    if (path.includes('/actions/workflows/')) return { status: 200, json: { workflow_runs: [] } };
    return { status: 200, json: null };
  };
  let t = 0;
  const w = { fullName: 'o/slow', delivery: 'auto-merge', beforeRef: 'a', afterRef: 'a', afterRunId: 1, dispatchedAtMs: 0, verdict: null };
  const { watches } = await followFleet(gh, [w], {
    workflow: 'claudinite-scheduler.yml', minutes: 1,
    now: () => (t += 30_000), sleep: async () => {}, log: () => {},
  });
  assert.equal(watches[0].verdict.state, 'timed-out');
  assert.equal(watches[0].verdict.ok, false);
});

// A read that fails mid-follow must not end the follow: the member is still baselining
// whether or not we could ask about it this round.
test('followFleet: a transient read error is recorded and retried, not fatal', async () => {
  let calls = 0;
  const gh = async (path) => {
    calls += 1;
    if (calls === 1) throw new Error('502 from GitHub');
    if (path.includes('/actions/workflows/')) {
      return { status: 200, json: { workflow_runs: [{ id: 3, created_at: '2026-08-06T10:00:05Z', status: 'completed', conclusion: 'success' }] } };
    }
    if (path.includes('/pulls?') || path.includes('/issues?')) return { status: 200, json: [] };
    if (path.includes('/jobs')) return { status: 200, json: { jobs: [] } };
    if (path.includes('/contents/')) return { status: 200, json: { content: Buffer.from('{}').toString('base64') } };
    return { status: 200, json: null };
  };
  let t = 0;
  const w = { fullName: 'o/flaky', delivery: 'auto-merge', beforeRef: null, afterRef: null, afterRunId: null, dispatchedAtMs: Date.parse('2026-08-06T10:00:00Z'), verdict: null };
  const { watches } = await followFleet(gh, [w], {
    workflow: 'claudinite-scheduler.yml', minutes: 10,
    now: () => (t += 1000), sleep: async () => {}, log: () => {},
  });
  assert.equal(watches[0].verdict.state, 'no-change');
  assert.equal(watches[0].pollErrors, 1);
});

// --- what the sweep actually hands the owner ----------------------------------

test('findMaintenancePull: only a claudinite maintenance branch, only from this cycle', async () => {
  const since = Date.parse('2026-08-06T10:00:00Z');
  const gh = async (path) => {
    if (path.includes('/pulls?')) {
      return { status: 200, json: [
        { number: 1, head: { ref: 'feature/x' }, created_at: '2026-08-06T10:05:00Z', state: 'open' },
        { number: 2, head: { ref: `${MAINT_PREFIX}-2026-08-01-zz` }, created_at: '2026-08-01T10:00:00Z', state: 'open' },
        { number: 3, head: { ref: `${MAINT_PREFIX}-2026-08-06-ab` }, created_at: '2026-08-06T10:02:00Z', state: 'open' },
      ] };
    }
    return { status: 200, json: { number: 3, state: 'open', additions: 1, deletions: 2, changed_files: 1, html_url: 'x' } };
  };
  const pull = await findMaintenancePull(gh, 'o/alpha', since);
  assert.equal(pull.number, 3);
  assert.equal(pull.merged, false);
});

test('findAgentIssue: the baselining dispatch issue is the agentic-work signal', async () => {
  const since = Date.parse('2026-08-06T10:00:00Z');
  const gh = async () => ({ status: 200, json: [
    { number: 8, title: 'something else', created_at: '2026-08-06T10:05:00Z', state: 'open' },
    { number: 9, title: `${AGENT_ISSUE_PREFIX} d2026-08-06`, created_at: '2026-08-06T10:04:00Z', state: 'open', labels: [{ name: 'ready-for-agent' }] },
  ] });
  const issue = await findAgentIssue(gh, 'o/alpha', since);
  assert.equal(issue.number, 9);
  assert.equal(issue.state, 'open');
  assert.equal(issue.ready, true);
});

test('collectFindings: annotations per job, plus any step that concluded non-green', async () => {
  const gh = async (path) => {
    if (path.includes('/jobs')) {
      return { status: 200, json: { jobs: [{ id: 5, name: 'schedule', steps: [{ name: 'Evaluate', conclusion: 'failure' }] }] } };
    }
    return { status: 200, json: [{ annotation_level: 'failure', message: 'exit 1' }, { annotation_level: 'warning', message: 'deprecated' }] };
  };
  const { errors, warnings } = await collectFindings(gh, 'o/alpha', 2);
  assert.equal(errors.length, 2);          // the annotation and the failed step
  assert.equal(warnings.length, 1);
});

test('memberRow: the old ref and the new one, both, on a member that moved', () => {
  const row = memberRow({
    fullName: 'o/alpha', verdict: { state: 'converged' }, beforeRef: 'oldsha1111', afterRef: 'newsha2222',
    pull: { number: 12, additions: 40, deletions: 12, changedFiles: 5, url: 'p' },
    agent: { number: 9, url: 'i' }, durationMs: 180_000, errors: [{ message: 'x' }], warnings: [],
  });
  assert.match(row, /oldsha1/);
  assert.match(row, /newsha2/);
  assert.match(row, /\+40\/-12 \(5f\)/);
  assert.match(row, /3m 0s/);
  assert.match(row, /yes \(\[#9\]/);
});

test('findingsSection: every finding in full — the count alone is what sent the owner to thirteen tabs', () => {
  const text = findingsSection([
    { fullName: 'o/alpha', errors: [{ path: 'a.mjs', title: 'check', message: 'boom\nmore' }], warnings: [] },
    { fullName: 'o/beta', errors: [], warnings: [] },
  ]);
  assert.match(text, /o\/alpha/);
  assert.match(text, /boom/);
  assert.doesNotMatch(text, /o\/beta/);
});

test('renderFollowReport: the fleet totals a reader actually asked for', () => {
  const report = renderFollowReport([
    {
      fullName: 'o/alpha', verdict: { state: 'converged', ok: true }, beforeRef: 'old1111111', afterRef: 'new2222222',
      pull: { number: 12, additions: 40, deletions: 12, changedFiles: 5, url: 'p', merged: true },
      agent: { number: 9, url: 'i' }, durationMs: 180_000, errors: [], warnings: [{ path: null, title: null, message: 'slow' }],
    },
    {
      fullName: 'o/beta', verdict: { state: 'no-change', ok: true }, beforeRef: 'same000000', afterRef: 'same000000',
      pull: null, agent: null, durationMs: 20_000, errors: [], warnings: [],
    },
  ], 600_000, 45);
  assert.match(report, /\| 1 \| 1 \| 1 \| 0 \| \+40\/-12 \| 0 \| 1 \|/);   // updated/unchanged/agentic/failed/lines/errors/warnings
  assert.match(report, /`old1111` → `new2222`/);                            // old AND new, in the updated list
  assert.match(report, /10m 0s/);                                           // the whole sweep's wall time
});

// A dry run renders the SAME document with honest zeros — the one run on which the owner
// can inspect the report's shape without changing anything is the run that changes nothing.
test('renderFollowReport: a dry run reports the same columns with true zeros', () => {
  const report = renderFollowReport([], 0, 45, { dryRun: true });
  assert.match(report, /DRY RUN/);
  assert.match(report, /\| 0 \| 0 \| 0 \| 0 \| \+0\/-0 \| 0 \| 0 \|/);
  assert.match(report, /canon ref/);      // the real columns, not a shorter substitute
  assert.match(report, /_none_/);
});
