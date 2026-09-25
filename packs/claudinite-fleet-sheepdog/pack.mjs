// The claudinite-fleet-sheepdog pack: a MARKER + config. Declaring it on a repo makes that repo the
// fleet ENFORCER — the one that covers and maintains every repo under an owner. It's
// opt-in (a dedicated claudinite-fleet-sheepdog repo declares it; NOT seeded by --init).
//
// The pack is thin: prose (RULES.md), the config schema (the pack entry's config =
// { owner, kind, exclude, canonRepo, packSeeds }), and the
// account-spanning sweeps
// that ARE the cross-repo reach the pack adds — each with the ordinary agentless
// scheduled task that runs it (the sweep IS its code-work, and its
// code_work_required_secrets is what asks the repo for FLEET_GITHUB_TOKEN):
//
//   tasks/fleet-roster/check-fleet-roster.mjs          is a repo a MEMBER, and is that
//     adoption-issues.mjs + freshness.mjs               membership still MEANING anything?
//                                                      (one walk, two issue families)
//   tasks/fleet-add-missing-packs/                     which packs is a member MISSING — the
//     scan-for-needed-packs.mjs + force-add-packs.mjs  ones its SHAPE suspects, or the ones
//                                                      the owner named on a forced run?
//   tasks/fleet-pack-seeds/check-fleet-pack-seeds.mjs  does a member DECLARE what
//                                                      this fleet standardizes on?
//   tasks/fleet-update/force-fleet-update.mjs      make every member update NOW
//                                                      (no preconditions — the
//                                                      operator's lever, forced only)
//
// Each sweep lives INSIDE its task's folder — nothing outside that task uses it.
// The pack root holds only what they all need: fleet-api.mjs (the cross-repo REST
// primitives), fleet-config.mjs (the one reader of this pack entry's config) and
// fleet-token.mjs (the one statement of what FLEET_GITHUB_TOKEN must be granted).
//
// Everything else - the scheduler run, the executor, the task engine
// (packs/claudinite-tasks/), scheduling - is CORE and pack-agnostic; none of it runs,
// dispatches, or depends on these sweeps.
//
// ONE CHECK, and it names no pack (seeds-agree.mjs): what it holds together is a fact
// about seeding, not about any pack seeded.
import { fleetTokenHandoverStep } from './fleet-token.mjs';

export default {
  version: '60922.6',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'fleet-enforcer duties for the repo watching every other repo — coverage, freshness, standardized packs',
    excludes: 'anything a member does to itself — its comments are basics, lessons are claudinite-growth; the fleet brief is claudinite-dashboard',
  },
  // Every sweep here runs as a task on the enforcer's own queue, and each one reads the
  // queue's vocabulary (its published `task-constants.mjs`) to ask whether a member's
  // scheduler is dormant. Declared so the vendor set carries the code this pack imports:
  // an enforcer that mounted the sweeps without it would fail its own converge on a
  // dangling import.
  requires: ['claudinite-tasks'],
  // Audits the enforcer's config as it stands, whatever this session touched: a seed
  // that drifted in an earlier commit is just as silent as one that drifted in this one.

  // The token is the whole pack's one credential and only a human can mint it. The step
  // is RENDERED from fleet-token.mjs rather than written here, so what adoption presents
  // is the union of what every sweep needs rather than any one sweep's subset.
  adoptionHandover: [fleetTokenHandoverStep()],
};
