// The sheepdog pack: a MARKER + config. Declaring it on a repo makes that repo the
// fleet ENFORCER — the one that covers and maintains every repo under an owner. It's
// opt-in (a dedicated sheepdog repo declares it; NOT seeded by --init).
//
// The pack is thin: prose (RULES.md), the config schema (the pack entry's config =
// { owner, kind, exclude, canonRepo, staleDays }), and the account-spanning sweeps
// that ARE the cross-repo reach the pack adds — each with the ordinary agentless
// scheduled task that runs it (the sweep IS its agent_preprocessing, and its
// required_secrets is what asks the repo for FLEET_GITHUB_TOKEN):
//
//   check-fleet-coverage.mjs   → tasks/fleet-census/     is a repo a MEMBER?
//   check-fleet-freshness.mjs  → tasks/fleet-freshness/  is a member KEEPING UP?
//
// The second exists because per-project scheduling made every member maintain
// itself and, in doing so, removed the last thing that looked at a member from the
// outside — self-maintenance cannot detect its own absence.
//
// No workflow of its own: preprocessing
// runs Action-side inside the repo's one scheduler workflow, where that secret is
// already reachable. Everything else — the SCHEDULER (engine/scheduler/run.mjs), the
// orchestrator/daily-run, the task engine (engine/scheduler/), scheduling — is CORE and
// pack-agnostic; the planner never runs, dispatches, or depends on these sweeps.
export default {
  id: 'sheepdog',
  detect: null,
  marker: null,
  prose: 'RULES.md',
  rules: [],
};
