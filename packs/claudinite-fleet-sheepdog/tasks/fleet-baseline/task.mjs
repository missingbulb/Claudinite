// claudinite-fleet-sheepdog task: fleet-baseline — the enforcer's MANUAL lever: force every covered
// member (or the ones named) to baseline NOW instead of at its next anchor.
//
// `frequency: 'manual'` — the first task on the non-cadence (#749). It answers no
// recurring question, so the scheduler run never instantiates it; the ONLY way it runs is a
// work item created by hand, optionally carrying its parameters as Context lines:
//
//   create-work-item claudinite-fleet-sheepdog/fleet-baseline
//   --context "REPOS=Alpha Beta"        (optional — omit for every covered member; space-separated)
//   --context "DRY_RUN=true"            (optional — report what would fire, fire nothing)
//   --context "INCLUDE_DORMANT=true"    (optional — dormant members are skipped by default)
//   --context "FOLLOW_MINUTES=30"       (optional — how long to follow members to current)
//
// This replaces the pack's standalone fleet-baseline WORKFLOW (retired 2026-08-11,
// #749). The workflow existed for two reasons that are both gone: its FOLLOW half
// (watch every member to a terminal state — a 45-minute sleep no serialized run
// should hold) is given up, and its typed `workflow_dispatch` inputs are carried by
// the item's Context instead. What the workflow shape COST is what this shape
// recovers: the `.github/` managed copy was the one file the nightly converge could
// not push (#649's withhold-and-hand-to-the-agent path), while a task rides the
// ordinary vendor refresh like everything else.
//
// `agent_model: 'none'` — pure code. The whole pass is the dispatch sweep
// (force-fleet-baseline.mjs, invoked by worker.mjs): enumerate the fleet over the
// PAT, wake each covered member's own `update` item, follow each one until it stamps
// canon's published versions, and report the full roster by OUTCOME (#1293). Nothing
// agentic happens HERE — each member's own converge may hand off to that member's own
// agent, which is the fan-out model's point: the enforcer dispatches, the member
// executes, and no agent anywhere needs cross-repo access.
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'fleet-baseline',
  frequency: 'manual',                   // an operator lever — never due on any cadence, runs only when forced
  // Never due on its own — `manual` means the scheduler run never instantiates
  // this task, so an item exists ONLY because a human created one, and that IS the
  // request.
  preconditions: ['none'],
  agent_model: 'none',                   // pure code: enumerate, fire, report (task-code-work DESIGN §4)
  expected_outcome: 'none',              // it queues Actions runs in MEMBERS; it writes nothing here or there
  code_work: 'node worker.mjs',
  // The dispatch half is one enumeration plus a declaration read and one POST per
  // member — under a minute. What sizes this bound is the FOLLOW (#1293): the sweep
  // stays until every dispatched member stamps canon's versions, and a member's own
  // update takes 5–10 minutes end to end. The follow gives up at
  // DEFAULT_FOLLOW_MINUTES (20) and reports what it was still waiting on, so this
  // must sit above that with room for the dispatch walk and the final probe —
  // otherwise the platform kills the run at the bound and the report is never
  // printed, which is the one outcome worse than a slow one.
  code_work_timeout: 1800,
  required_secrets: ['FLEET_GITHUB_TOKEN'], // the account-spanning PAT; fleet-token.mjs states the grant
};
