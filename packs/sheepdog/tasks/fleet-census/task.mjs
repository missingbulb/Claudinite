// sheepdog task: fleet-census — the coverage/adoption audit, as a scheduled task.
// `agent_model: 'none'` with `agent_preprocessing: 'node worker.mjs'`: the whole
// pass is deterministic code the scheduler runs as a subprocess — no agent, no
// dispatch issue. The worker calls its sibling, the census (check-fleet-coverage.mjs):
// enumerate every repo under the configured owner, classify each (covered /
// uncovered / excluded / skipped), and converge one adoption ISSUE per uncovered
// repo in this (sheepdog) repo.
//
// It used to be a `workflow_dispatch`-only Action of its own, materialized into
// the sheepdog repo, existing only to hold FLEET_GITHUB_TOKEN. That workflow is
// gone: preprocessing runs Action-side inside the scheduler workflow, so repo
// Actions secrets are reachable there, and `required_secrets` stamps the name into
// the scheduler workflow's env (basics/scheduled-tasks.md — "a workflow that
// exists only to hold a secret is redundant"). Its `report-failure` job is gone
// too: a non-zero preprocessing exit now converges to a `needs-human` issue via
// the scheduler (and a scheduler-run failure to `workflow-failure`), which is the
// same escalation with one fewer file.
//
// CLASSIFICATION (per-project-scheduling DESIGN §6, the same note RULES.md
// carries): this is an ORDINARY PACK TASK, not a fleet mechanism. Its
// *implementation* happens to scan every repo under the owner, but its
// declaration, scheduling and lifecycle are exactly those of any pack task — it is
// active because this repo declares the sheepdog pack, and it runs however this
// repo's tasks run. Hence no `session_scope: 'fleet'` and no `fleet` signal: those
// describe how a task is WIRED, and nothing about this task's wiring is fleet-shaped.
// The cross-repo reach lives in the implementation, never in the declaration.
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'fleet-census',
  frequency: 'daily',                    // a daily coverage audit — the 04:00 slot
  precondition_signals: [],              // no signal — the worker reads the fleet itself, over the PAT
  agent_model: 'none',                   // pure code — no agent (agent-preprocessing DESIGN §4)
  expected_outcome: 'none',              // the honest ceiling: the census opens ADOPTION ISSUES, never a PR
  agent_preprocessing: 'node worker.mjs',
  // The census walks EVERY repo in the fleet: one paged enumeration plus one
  // marker-check REST call per repo, all serial, then the adoption-issue
  // convergence. A few hundred repos is minutes, not seconds — and a secondary
  // rate limit makes it slower still. 15 minutes is ~10x the expected walk while
  // staying well inside the hourly scheduler cadence, so a hung census is killed
  // long before the next run could collide with it.
  agent_preprocessing_timeout: 900,
  required_secrets: ['FLEET_GITHUB_TOKEN'], // the account-spanning PAT the census reads the fleet with

  // Fire daily unconditionally: the census is cheap to no-op (a converged fleet
  // opens and closes nothing) and there is no collectable signal that would tell
  // us in advance whether coverage changed — a repo created, deleted, archived or
  // adopted under the owner is invisible to every per-repo collector. The whole
  // question the task answers lives outside this repo, so the answer is the run.
  precondition() {
    return { run: true, reason: 'daily fleet coverage audit (the census converges adoption issues and no-ops cheaply on a covered fleet)' };
  },
};
