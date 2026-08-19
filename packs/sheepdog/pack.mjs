// The sheepdog pack: a MARKER + config. Declaring it on a repo makes that repo the
// fleet ENFORCER — the one that covers and maintains every repo under an owner. It's
// opt-in (a dedicated sheepdog repo declares it; NOT seeded by --init).
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
//   tasks/fleet-usage/aggregate-fleet-usage.mjs        what does the fleet USE?
//   tasks/fleet-pack-seeds/check-fleet-pack-seeds.mjs  does a member DECLARE what
//                                                      this fleet standardizes on?
//   tasks/fleet-baseline/force-fleet-baseline.mjs      make every member baseline NOW
//                                                      (frequency: manual — the
//                                                      operator's lever, forced only)
//   tasks/fleet-digest/collect-fleet-day.mjs           what did the fleet ACCOMPLISH
//                                                      yesterday, and what has it let
//                                                      go quiet?
//
// Each sweep lives INSIDE its task's folder — nothing outside that task uses it.
// The pack root holds only what they all need: fleet-api.mjs (the cross-repo REST
// primitives) and fleet-config.mjs (the one reader of this pack entry's config).
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
// adopt-requested-packs task (grow_with_claudinite) adopts with the repo checked out —
// the fan-out model (#749): the enforcer dispatches, the member executes, and no agent
// anywhere needs cross-repo access.
//
// DIGEST is the one sweep whose output is addressed to a PERSON rather than to the
// machinery: a dated plain-text brief of the day's real work, one file a morning, plus a
// prod about a project that has gone quiet. It is the only sheepdog task with an agent
// stage, and only for the half that is genuinely judgment — the collector ranks a day BY
// SIZE, which is arithmetic, and the agent picks the accomplishments out of that
// shortlist, which is a reading of the text. On a day the fleet merged nothing the
// code-work writes the brief itself and requests no agent: the dated series is what makes a
// MISSING brief legible as a fault rather than as a slow Tuesday, but "nothing happened"
// needs no model. It arrived from the enforcer's own local pack in #954; what made it
// portable is that the task ends at a written file, so it holds no address, no recipient
// and no transport, and everything the fleet has an opinion about is two defaulted config
// knobs.
//
// USAGE exists for the same shape of reason a rung up: a member folds its own
// skill-usage numbers and can therefore only say whether a skill loads THERE; whether a
// skill earns its place at all is a fleet-shaped question no member can answer about
// itself. PACK-SEEDS is the one that WRITES to members: some packs need a parameter no
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
// 2026-08-11 (#749, packs/sheepdog/migrations/2026-08-11-fleet-baseline-task) along with its
// follow-the-fleet report: dispatching is the enforcer's job, reporting is each
// member's own.
//
// Everything else — the tick, the executor, the task engine (engine/scheduler/),
// scheduling — is CORE and pack-agnostic; none of it runs, dispatches, or depends on
// these sweeps.
//
// THREE CHECKS. Two are the digest's, and live in its task folder because nothing else
// reads them: `digest-plain-text` holds the landed briefs to plain text (they are sent
// verbatim through a renderer that neither parses markdown nor keeps line breaks, so
// markdown in one reaches the owner as literal characters in a single running paragraph),
// and `dated-fixture-collision` keeps the digest's own test fixtures out of the year range
// the fleet writes real briefs in — a fixture sharing that namespace breaks when a brief
// is deleted and passes for the wrong reason when one happens to exist.
//
// The third names no pack (seeds-agree.mjs): the seed sweep writes this
// repo's `packSeeds` into every member without ever consulting what this repo declares
// for the same pack, so the two can drift apart silently. That is a fact about seeding,
// not about any pack seeded — which is why it lives here and not in the pack whose
// config happened to drift.
import seedsAgree from './seeds-agree.mjs';
import datedFixtureCollision from './tasks/fleet-digest/dated-fixture-collision.mjs';
import digestPlainText from './tasks/fleet-digest/digest-plain-text.mjs';

export default {
  id: 'sheepdog',
  // 2: fleet-digest arrives (#954) — a sixth task, two checks and an optional `digest`
  // config block. Purely additive: nothing in a member is rewritten, so the bump carries
  // no migration record; it exists to deliver the new files to enforcers already on v1.
  version: 8,
  minEngineVersion: 1,
  ruleRoutingGuidance: {
    belongs: 'fleet-enforcer duties for the repo watching every other repo — coverage, freshness, usage, standardized packs, the daily fleet brief',
    excludes: 'anything a member does to itself — tidying is tidy-repo, lesson capture is grow_with_claudinite',
  },
  badge: 'badge.svg',
  detect: null,
  marker: null,
  prose: 'RULES.md',
  // Audits the enforcer's config as it stands, whatever this session touched: a seed
  // that drifted in an earlier commit is just as silent as one that drifted in this one.
  worldRules: [seedsAgree, digestPlainText, datedFixtureCollision],
};
