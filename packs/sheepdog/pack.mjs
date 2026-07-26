// The sheepdog pack: a MARKER + config. Declaring it on a repo makes that repo the
// fleet ENFORCER — the one that covers and maintains every repo under an owner. It's
// opt-in (a dedicated sheepdog repo declares it; NOT seeded by --init).
//
// The pack is thin: prose (RULES.md), the config schema (the pack entry's config =
// { owner, kind, exclude }), the CENSUS (check-fleet-coverage.mjs, in this pack) —
// the account-spanning coverage/adoption audit that IS the cross-repo reach the
// pack adds — and the ordinary scheduled task that runs it (tasks/fleet-census/,
// agentless: the census IS its agent_preprocessing, and its required_secrets is
// what asks the repo for FLEET_GITHUB_TOKEN). No workflow of its own: preprocessing
// runs Action-side inside the repo's one scheduler workflow, where that secret is
// already reachable. Everything else — the PLANNER (routines/fleet/plan.mjs), the
// orchestrator/daily-run, the task engine (engine/scheduler/), scheduling — is CORE and
// pack-agnostic; the planner never runs, dispatches, or depends on this census.
export default {
  id: 'sheepdog',
  detect: null,
  marker: null,
  prose: 'RULES.md',
  rules: [],
};
