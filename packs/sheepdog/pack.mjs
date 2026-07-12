// The sheepdog pack: a MARKER + config. Declaring it on a repo makes that repo the
// fleet ENFORCER — the one that covers and maintains every repo under an owner. It's
// opt-in (a dedicated sheepdog repo declares it; NOT seeded by --init).
//
// The pack itself is thin: prose (RULES.md), the config schema (packConfig.sheepdog =
// { owner, kind, exclude }), and the coverage workflow stub (stubs/fleet-coverage.yml)
// that baselining materializes into the sheepdog repo and that prompts for the
// FLEET_GITHUB_TOKEN secret. The actual work — the census (routines/check-fleet-coverage.mjs),
// running the daily-run (the orchestrator), the run_daily engine, scheduling — is all
// Claudinite CORE, not in this pack. The sheepdog pack only adds the cross-repo reach.
export default {
  id: 'sheepdog',
  detect: null,
  marker: null,
  prose: 'RULES.md',
  rules: [],
};
