// grow_with_claudinite task: plan-status-update — the nightly convergence sweep
// over the repo's plan-tracking issues (docs/tracking-issue-freshness/DESIGN.md,
// "Per-phase verifiers"). The in-session plan-tracking-freshness check is the
// timely guard at merge; this task is the net under it: it re-derives each open
// tracker's checklist from the plan's own per-phase verifiers — code where a
// phase declared one (exit 0 ⇒ done), prose criteria judged otherwise — and
// flips the boxes sessions missed or that completed implicitly. Worker: task.md.
//
// Self-contained (imports nothing): the whole contract is this default export.

const PLAN_LABEL = 'plan-tracking';

export default {
  id: 'plan-status-update',
  frequency: 'daily',
  precondition_signals: ['issues'],
  agent_model: 'sonnet',                 // prose-criteria judgment; the code verifiers decide themselves
  expected_outcome: 'none',              // writes issue state (boxes, comments), never a PR
  agent_instructions: 'task.md',
  agent_execution_timeout: 1200,

  // Fire iff an open issue carries the plan-tracking label — the deterministic
  // "a plan is in flight" gate. The tracker numbers are binding scope: the run
  // updates exactly these issues and nothing else.
  precondition(signals) {
    const open = signals.issues?.open ?? [];
    const trackers = open.filter((i) => (i.labels ?? []).includes(PLAN_LABEL));
    if (!trackers.length) return { run: false, reason: 'no open plan-tracking issue' };
    return {
      run: true,
      reason: `${trackers.length} open plan-tracking issue(s)`,
      context: [`Scope: the open plan-tracking issue(s) to re-verify — ${trackers.map((i) => `#${i.number} ("${i.title}")`).join(', ')}.`],
    };
  },
};
