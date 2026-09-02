// The claudinite-fleet-sheepdog pack: a MARKER + config. Declaring it on a repo makes that repo the
// fleet ENFORCER — the one that covers and maintains every repo under an owner. It's
// opt-in (a dedicated claudinite-fleet-sheepdog repo declares it; NOT seeded by --init).
//
// The pack is thin: prose (RULES.md), the config schema (the pack entry's config =
// { owner, kind, exclude, canonRepo, packSeeds }), and the
// account-spanning sweeps
// that ARE the cross-repo reach the pack adds — each with the ordinary agentless
// scheduled task that runs it (the sweep IS its code-work, and its
// required_secrets is what asks the repo for FLEET_GITHUB_TOKEN):
//
//   tasks/fleet-roster/check-fleet-roster.mjs          is a repo a MEMBER, and is that
//     adoption-issues.mjs + drift-issues.mjs           membership still MEANING anything?
//                                                      (one walk, two issue families)
//   tasks/fleet-add-missing-packs/                     which packs is a member MISSING — the
//     scan-for-needed-packs.mjs + force-add-packs.mjs  ones its SHAPE suspects, or the ones
//                                                      the owner named on a forced run?
//   tasks/fleet-pack-seeds/check-fleet-pack-seeds.mjs  does a member DECLARE what
//                                                      this fleet standardizes on?
//   tasks/fleet-baseline/force-fleet-baseline.mjs      make every member baseline NOW
//                                                      (frequency: manual — the
//                                                      operator's lever, forced only)
//
// Each sweep lives INSIDE its task's folder — nothing outside that task uses it.
// The pack root holds only what they all need: fleet-api.mjs (the cross-repo REST
// primitives), fleet-config.mjs (the one reader of this pack entry's config) and
// fleet-token.mjs (the one statement of what FLEET_GITHUB_TOKEN must be granted).
//
// ROSTER carries two questions rather than one because they are asked of the same
// repos from the same walk (#788): coverage, and — because per-project scheduling made
// every member maintain itself and in doing so removed the last thing that looked at a
// member from the OUTSIDE — whether that coverage still means anything. Self-maintenance
// cannot detect its own absence. Two issue families, one enumeration, one declaration
// read per repo; the split that remains is between the FAMILIES (adoption-issues.mjs,
// drift-issues.mjs), which close on unrelated conditions, and not between two walks that
// could classify the same repo differently.
//
// ADD-MISSING-PACKS exists because a pack's `detect` fingerprint is consulted ONCE, at
// bootstrap's --init: baselining backfills the seeded packs and each declared pack's
// `requires` closure, but never re-fingerprints, so a member that grows into a pack
// after adoption is never told. It is PARAMETERISED (`scan_for_needed_packs`, `repos`,
// `ADD_PACKS`… — no defaults; the weekly declaration sends its own explicitly, a forced
// run sends the rest through the scheduler's override bag) and it runs NO agent here: it
// converges a work-list issue IN each member and fires that member's own scheduler, whose
// adopt-requested-packs task (claudinite-growth) adopts with the repo checked out —
// the fan-out model (#749): the enforcer dispatches, the member executes, and no agent
// anywhere needs cross-repo access.
//
// PACK-SEEDS is the one that WRITES to members: some packs need a parameter no
// member can derive, because the answer is a fact about the FLEET — and only the enforcer
// holds it, because it IS the fleet. It names no pack itself: every id comes from this
// repo's own `packSeeds`.
//
// The pack carries NO workflow of its own: every sweep runs Action-side inside the
// repo's one scheduler workflow, where the secret is already reachable, and the two
// operator levers (fleet-baseline; a forced fleet-add-missing-packs) are `manual` /
// hand-created work items on that same queue — `create-work-item <pack>/<task>`. The
// standalone fleet-baseline workflow this pack once kept in the enforcer's .github/
// (the one file the nightly converge could never push itself, #649) was retired
// 2026-08-11 (#749, packs/claudinite-fleet-sheepdog/migrations/2026-08-11-fleet-baseline-task) along with its
// follow-the-fleet report: dispatching is the enforcer's job, reporting is each
// member's own.
//
// Everything else — the scheduler run, the executor, the task engine (packs/claudinite-tasks/),
// scheduling — is CORE and pack-agnostic; none of it runs, dispatches, or depends on
// these sweeps.
//
// ONE CHECK, and it names no pack (seeds-agree.mjs): the seed sweep writes this
// repo's `packSeeds` into every member without ever consulting what this repo declares
// for the same pack, so the two can drift apart silently. That is a fact about seeding,
// not about any pack seeded — which is why it lives here and not in the pack whose
// config happened to drift.
import { fleetTokenHandoverStep } from './fleet-token.mjs';

export default {
  version: '60902.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'fleet-enforcer duties for the repo watching every other repo — coverage, freshness, standardized packs',
    excludes: 'anything a member does to itself — tidying is tidy-repo, lessons are claudinite-growth; the fleet brief is claudinite-dashboard',
  },
  // Audits the enforcer's config as it stands, whatever this session touched: a seed
  // that drifted in an earlier commit is just as silent as one that drifted in this one.

  // The token is the whole pack's one credential and only a human can mint it. The step
  // is RENDERED from fleet-token.mjs rather than written here, because the failure this
  // exists to prevent is a person granting a subset (#1030): a sweep's own message names
  // what that sweep needs, and five such messages assemble into a grant missing exactly
  // the permission no other sweep exercises. What adoption presents is the union.
  adoptionHandover: [fleetTokenHandoverStep()],
};
