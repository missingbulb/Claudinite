# sheepdog

The fleet **enforcer** marker — declaring it makes a repo the one that covers and maintains every repo
under an owner. Opt-in (a dedicated sheepdog repo declares it; **not** seeded by `--init`). It
standardizes the fleet coverage that used to be bespoke Claudinite infrastructure into a declaration.

Thin by design: prose + the config schema (the sheepdog pack entry's `config` = `{ owner, kind, exclude,
canonRepo, staleDays, packSeeds }`) + five cross-repo **sweeps/levers**, each an agentless
scheduled task whose sweep is its `prework`. The pack carries **no workflow and no agent of its
own**: anything agentic happens in the *member*, on the fan-out model
([#749](https://github.com/missingbulb/Claudinite/issues/749)) — the enforcer dispatches, the
member executes:

| sweep | task | asks |
|---|---|---|
| [check-fleet-roster.mjs](tasks/fleet-roster/check-fleet-roster.mjs) → [adoption-issues.mjs](tasks/fleet-roster/adoption-issues.mjs) + [drift-issues.mjs](tasks/fleet-roster/drift-issues.mjs) | [fleet-roster](tasks/fleet-roster/task.md) (daily) | is this repo a **member**, and is that membership still **meaning** anything? → adoption issues + drift issues |
| [scan-for-needed-packs.mjs](tasks/fleet-add-missing-packs/scan-for-needed-packs.mjs) + [force-add-packs.mjs](tasks/fleet-add-missing-packs/force-add-packs.mjs) | [fleet-add-missing-packs](tasks/fleet-add-missing-packs/task.md) (weekly, and forceable) | which packs is a member missing — the ones its **shape** suspects, or the ones the owner named? → a work-list issue *in* each member + that member's scheduler fired; the member's own agent adopts |
| [aggregate-fleet-usage.mjs](tasks/fleet-usage/aggregate-fleet-usage.mjs) | [fleet-usage](tasks/fleet-usage/task.md) (daily) | what does the fleet **actually use**? → `usage-fleet.GENERATED.json` |
| [check-fleet-pack-seeds.mjs](tasks/fleet-pack-seeds/check-fleet-pack-seeds.mjs) | [fleet-pack-seeds](tasks/fleet-pack-seeds/task.md) (daily) | does a member declare what this fleet **standardizes on**? → the declaration, written |
| [force-fleet-baseline.mjs](tasks/fleet-baseline/force-fleet-baseline.mjs) | [fleet-baseline](tasks/fleet-baseline/task.md) (`manual` — forced runs only) | make every member baseline **now** → each member's own run, reported in its own repo |

**The roster carries two questions** because they are asked of the same repos from the same walk
([#788](https://github.com/missingbulb/Claudinite/issues/788)). The freshness half exists because
per-project scheduling made every member maintain itself and, in doing so, removed the last thing that
looked at a member from the **outside** — self-maintenance cannot detect its own absence. It used to be
its own weekly task with its own enumeration, and re-derived the coverage it claimed to take as given;
the two then classified the same repo differently (an excluded repo carrying a declaration read
*covered* to one and *out of scope* to the other), and each half's `unknown` failed its own run knowing
nothing of the other's. What is still split is the two **issue families** — they close on unrelated
conditions — not the walk.

**Missing-packs** exists because a pack's `detect` fingerprint is consulted **once**, at
bootstrap's `--init`: baselining backfills the seeded packs and each declared pack's `requires`
closure, but never re-fingerprints, so a member that grows into a pack after adoption is never told
the pack exists and the owner has to already know what to ask for. **Usage** exists for the same
shape of reason one rung up: a member can say whether a skill loads *there*, and only a view across
every member can say whether it earns its place at all. **Pack-seeds** is the only one that **writes** to a
member: some packs need a parameter no member can derive, because the answer is a fact about the
*fleet* — and canon cannot supply it either, since a bootstrap run does not know which fleet it is
bootstrapping into. This repo's `packSeeds` config lists what its members should declare, and the
sweep converges that list. It names no pack itself: the fleet supplies every id.

The fit sweep fingerprints against a scratch clone of `canonRepo`, never against this repo's own
mount — the mount carries only the packs the enforcer declares, and sweeping against it would report
every member as fitted while testing almost nothing. Its report names the corpus it measured against,
so a shrunken denominator is visible rather than silent.

**The fit sweep is the one with an agent stage**, and the split is deliberate: everything decidable in
code stays in the agentless `prework` (enumerate, fingerprint, converge the issues), and the agent is
reached only for what is a judgment plus a repo edit — confirming the suspicion and running the
[adopt-pack](../core/skills/adopt-pack/SKILL.md) skill against the member. It is
ceilinged at `open-pr` and never auto-merges: declaring a pack switches on conformance checks that run
in that member's CI from the moment they land.

A member that declares itself **dormant** (`"dormant": true` in its own declaration) is out of the
roster's freshness half, out of the fit sweep, out of the usage denominator, and never written to by the
pack-seed sweep — its scheduler is stopped, so its mount falls behind by design, its silence says
nothing about any skill, recommending it a pack would be recommending work it has declared it is not
doing, and a commit landed in it from outside is the upkeep it opted out of. It stays a **member**:
membership is unchanged, because dormancy is about upkeep, not membership.

**Every report enumerates the full fleet.** Whatever a repo's state — covered, dormant, uncovered,
excluded, archived, a fork, inactive today, or simply not measured by that sweep — each sweep's
report names it under exactly one state rather than dropping it. A roster that names only the
exceptions has silent holes, and a reader cannot tell "fine" from "fell out of the report": the
roster's coverage section lists covered members (dormant ones flagged) alongside the uncovered, and its
freshness section names its fresh members and its out-of-scope repos with why; the fit sweep names the members that came
back **fitted** as loudly as the ones with findings, and names the fingerprints it could not decide
from outside rather than counting them as non-matches; the usage sweep's `coverage` section
accounts for every repo under the owner and its run report flags folding members with no captured
activity that day; fleet-baseline reports every repo it did *not* dispatch, with the reason.

**The two operator levers ride the scheduler, not a workflow.** `fleet-baseline` is the first
`manual`-frequency task: never due on any cadence, it runs only when the owner presses *Run
workflow* on the vendored scheduler with `overrides: FORCE_TASKS=fleet-baseline` (plus `REPOS=…`,
`DRY_RUN=true`, `INCLUDE_DORMANT=true` as wanted) — firing every covered member's own scheduler
with `FORCE_TASKS=baselining` so the fleet picks canon up now instead of over the next day. A
forced fleet-add-missing-packs run is the second lever, same button, its own overrides. Neither
waits on what it fired: a dispatch queues a member's own run, and each member reports its own
outcome where it always does. (The standalone fleet-baseline workflow, its fleet-wide follow
report, and the `.github/` managed copy it required were retired 2026-08-11 —
[#749](https://github.com/missingbulb/Claudinite/issues/749),
[`2026-08-11-fleet-baseline-task`](migrations/2026-08-11-fleet-baseline-task/migration.mjs).)

Each sweep lives **inside its task's folder**, because nothing outside that task uses it. Only what
they all share sits at the pack root: [fleet-api.mjs](fleet-api.mjs) (the cross-repo REST
primitives, including the one that fires a member's scheduler) and
[fleet-config.mjs](fleet-config.mjs) (the one reader of this pack's entry `config`).

The rest of the machinery — running the daily-run, the task engine (`engine/scheduler/`), scheduling —
is Claudinite **core**. Carries no conformance checks. Policy + config: [RULES.md](RULES.md).

## Checks

| Check | Reported as | Severity | Reason | Enforces |
|---|---|---|---|---|
| `fleet-pack-seed-agrees` | blocking | medium | correctness | the fleet's seeded-pack list agrees with what the enforcer actually standardizes on, so a seed cannot be enforced in one place and absent in the other |
