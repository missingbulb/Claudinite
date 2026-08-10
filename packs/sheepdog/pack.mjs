// The sheepdog pack: a MARKER + config. Declaring it on a repo makes that repo the
// fleet ENFORCER — the one that covers and maintains every repo under an owner. It's
// opt-in (a dedicated sheepdog repo declares it; NOT seeded by --init).
//
// The pack is thin: prose (RULES.md), the config schema (the pack entry's config =
// { owner, kind, exclude, canonRepo, staleDays, packSeeds }), and the
// account-spanning sweeps
// that ARE the cross-repo reach the pack adds — each with the ordinary agentless
// scheduled task that runs it (the sweep IS its prework, and its
// required_secrets is what asks the repo for FLEET_GITHUB_TOKEN):
//
//   tasks/fleet-census/check-fleet-coverage.mjs        is a repo a MEMBER?
//   tasks/fleet-freshness/check-fleet-freshness.mjs    is a member KEEPING UP?
//   tasks/fleet-fit/check-fleet-fit.mjs                does a member declare what its SHAPE suspects?
//   tasks/fleet-usage/aggregate-fleet-usage.mjs        what does the fleet USE?
//   tasks/fleet-pack-seeds/check-fleet-pack-seeds.mjs  does a member DECLARE what
//                                                      this fleet standardizes on?
//
// Each sweep lives INSIDE its task's folder — nothing outside that task uses it.
// The pack root holds only what they all need: fleet-api.mjs (the cross-repo REST
// primitives) and fleet-config.mjs (the one reader of this pack entry's config).
//
// The second exists because per-project scheduling made every member maintain
// itself and, in doing so, removed the last thing that looked at a member from the
// outside — self-maintenance cannot detect its own absence. The third exists because
// a pack's `detect` fingerprint is consulted ONCE, at bootstrap's --init: baselining
// backfills the seeded packs and each declared pack's `requires` closure, but never
// re-fingerprints, so a member that grows into a pack after adoption is never told.
// It is also the one task here with an agent stage — the detecting is code, the
// adopting is a repo edit. No session scope anywhere: the enforcer repo's own
// executor is provisioned with the fleet reach this whole pack presumes, so its
// dispatches ride the ordinary ready label like any other task's. The fourth exists
// for the same shape of reason a rung up: a member folds its own skill-usage numbers
// and can therefore only say whether a skill loads THERE; whether a skill earns its
// place at all is a fleet-shaped question no member can answer about itself. The
// fifth is the one that WRITES to members: some packs need a parameter no member can
// derive, because the answer is a fact about the FLEET — and only the enforcer holds
// it, because it IS the fleet. It names no pack itself: every id comes from this
// repo's own `packSeeds`.
//
// The sweeps carry no workflow of their own: preprocessing runs Action-side inside
// the repo's one scheduler workflow, where that secret is already reachable. The
// pack's ONE workflow is fleet-baseline (stubs/workflows/fleet-baseline.yml, driven
// by fleet-baseline/force-fleet-baseline.mjs, which follows what it dispatched via
// fleet-baseline/follow-fleet-baseline.mjs) — the owner's manual lever to make every
// member baseline now, and the report of what the fleet then did. It answers no
// recurring question, so it is not a task; it
// declares workflow_dispatch and no schedule, so it adds no second cron; and because
// GitHub reads workflows only from a repo's own .github/, a migration keeps a copy there
// — delivered by the converge's withhold-and-hand-to-the-agent path, since the Action
// token cannot write a workflow file itself (#649).
//
// Everything else — the SCHEDULER (engine/scheduler/run.mjs), the
// orchestrator/daily-run, the task engine (engine/scheduler/), scheduling — is CORE and
// pack-agnostic; the planner never runs, dispatches, or depends on these sweeps.
export default {
  id: 'sheepdog',
  ruleRoutingGuidance: {
    belongs: 'fleet-enforcer duties for the repo watching every other repo — coverage, freshness, usage, the packs the fleet standardizes on',
    excludes: 'anything a member does to itself — tidying is tidy-repo, lesson capture is grow_with_claudinite',
  },
  badge: 'badge.svg',
  detect: null,
  marker: null,
  prose: 'RULES.md',
  worldRules: [],
};
