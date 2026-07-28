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
//   tasks/fleet-census/check-fleet-coverage.mjs      is a repo a MEMBER?
//   tasks/fleet-freshness/check-fleet-freshness.mjs  is a member KEEPING UP?
//   tasks/fleet-usage/aggregate-fleet-usage.mjs      what does the fleet USE?
//
// Each sweep lives INSIDE its task's folder — nothing outside that task uses it.
// The pack root holds only what they all need: fleet-api.mjs (the cross-repo REST
// primitives) and fleet-config.mjs (the one reader of this pack entry's config).
//
// The second exists because per-project scheduling made every member maintain
// itself and, in doing so, removed the last thing that looked at a member from the
// outside — self-maintenance cannot detect its own absence. The third exists for the
// same shape of reason a rung up: a member folds its own skill-usage numbers and can
// therefore only say whether a skill loads THERE; whether a skill earns its place at
// all is a fleet-shaped question no member can answer about itself.
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
