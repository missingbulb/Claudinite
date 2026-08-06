// sheepdog task: fleet-freshness — is each COVERED member actually keeping up?
// `agent_model: 'none'` with `prework: 'node worker.mjs'`: the whole
// pass is deterministic code the scheduler runs as a subprocess — no agent, no
// dispatch issue. The worker calls its sibling, the sweep (check-fleet-freshness.mjs):
// probe every covered repo under the configured owner, classify its drift by root
// cause (no-stamp / no-scheduler / ref-not-on-trunk / behind / fresh), and converge
// one drift ISSUE per unhealthy repo in this (sheepdog) repo.
//
// WHY: per-project scheduling made every member maintain itself, and in doing so
// removed the last thing that looked at a member from the OUTSIDE. A member whose
// scheduler was never vendored or has been failing for a fortnight is invisible —
// it is still `covered` to the census, and it files no failure issue because
// nothing runs there to fail. Self-maintenance cannot detect its own absence. The
// census answers "is this repo covered"; this task answers "is that coverage still
// meaning anything".
//
// CLASSIFICATION (per-project-scheduling DESIGN §6, the same note the census and
// RULES.md carry): an ORDINARY PACK TASK, not a fleet mechanism. Its
// *implementation* reads every repo under the owner over a PAT, but its
// declaration, scheduling and lifecycle are exactly those of any pack task — it is
// active because this repo declares the sheepdog pack, and it runs however this
// repo's tasks run. Hence no `session_scope: 'fleet'` and no `fleet` signal: those
// describe how a task is WIRED, and nothing about this task's wiring is
// fleet-shaped. The cross-repo reach lives in the implementation, never in the
// declaration.
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'fleet-freshness',
  frequency: 'weekly',                   // drift is measured in DAYS (staleDays, default 14) — a daily sweep would re-ask a question whose answer cannot have changed
  precondition_signals: [],              // no signal — the sweep reads the fleet itself, over the PAT
  agent_model: 'none',                   // pure code — no agent (task-prework DESIGN §4)
  expected_outcome: 'none',              // the honest ceiling: the sweep opens DRIFT ISSUES, never a PR — it reports, it does not repair
  prework: 'node worker.mjs',
  // Three REST reads per member (declaration, scheduler workflow, canon compare)
  // plus the enumeration and the issue convergence, all serial, and a secondary
  // rate limit makes it slower still. Same 900s the census carries, for the same
  // reason: ~10x the expected walk while staying well inside the hourly cadence.
  prework_timeout: 900,
  required_secrets: ['FLEET_GITHUB_TOKEN'], // the account-spanning PAT the sweep reads the fleet with

  // Fire weekly unconditionally. Every input lives OUTSIDE this repo — another
  // member's stamp, another member's workflow, canon's head — and no per-repo
  // collector can see any of them, so there is no signal that would tell us in
  // advance whether the answer changed. The sweep is cheap to no-op: a fleet with
  // nothing behind opens and closes nothing, and an unhealthy member that is still
  // unhealthy for the same reason is not even commented on.
  precondition() {
    return { run: true, reason: 'weekly fleet freshness sweep (the sweep converges drift issues and no-ops cheaply on a fleet that is keeping up)' };
  },
};
