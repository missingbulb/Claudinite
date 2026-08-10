# sheepdog

The fleet **enforcer** marker — declaring it makes a repo the one that covers and maintains every repo
under an owner. Opt-in (a dedicated sheepdog repo declares it; **not** seeded by `--init`). It
standardizes the fleet coverage that used to be bespoke Claudinite infrastructure into a declaration.

Thin by design: prose + the config schema (the sheepdog pack entry's `config` = `{ owner, kind, exclude,
canonRepo, staleDays, packSeeds }`) + five cross-repo **sweeps**, each with the one
scheduled task that runs it (the sweep is its `prework`, agentless — fit alone adds an agent stage
after its sweep; no workflow of its own) — plus one
**manual lever** that has no cadence and therefore does have a workflow:

| sweep | task | asks |
|---|---|---|
| [check-fleet-coverage.mjs](tasks/fleet-census/check-fleet-coverage.mjs) | [fleet-census](tasks/fleet-census/task.md) (daily) | is this repo a **member**? → adoption issues |
| [check-fleet-freshness.mjs](tasks/fleet-freshness/check-fleet-freshness.mjs) | [fleet-freshness](tasks/fleet-freshness/task.md) (weekly) | is a member **keeping up**? → drift issues |
| [scan-for-needed-packs.mjs](tasks/fleet-add-missing-packs/scan-for-needed-packs.mjs) + [force-add-packs.mjs](tasks/fleet-add-missing-packs/force-add-packs.mjs) | [fleet-add-missing-packs](tasks/fleet-add-missing-packs/task.md) (weekly, and forceable) | which packs is a member missing — the ones its **shape** suspects, or the ones the owner named? → work-list issues, then adoption PRs |
| [aggregate-fleet-usage.mjs](tasks/fleet-usage/aggregate-fleet-usage.mjs) | [fleet-usage](tasks/fleet-usage/task.md) (daily) | what does the fleet **actually use**? → `usage-fleet.GENERATED.json` |
| [check-fleet-pack-seeds.mjs](tasks/fleet-pack-seeds/check-fleet-pack-seeds.mjs) | [fleet-pack-seeds](tasks/fleet-pack-seeds/task.md) (daily) | does a member declare what this fleet **standardizes on**? → the declaration, written |
| [force-fleet-baseline.mjs](fleet-baseline/force-fleet-baseline.mjs) + [follow-fleet-baseline.mjs](fleet-baseline/follow-fleet-baseline.mjs) | *(no task — the [fleet-baseline workflow](stubs/workflows/fleet-baseline.yml), `workflow_dispatch` only)* | make every member baseline **now**, watch each one finish → what the fleet did |

The second exists because per-project scheduling made every member maintain itself and, in doing so,
removed the last thing that looked at a member from the **outside** — self-maintenance cannot detect its
own absence. The third exists because a pack's `detect` fingerprint is consulted **once**, at
bootstrap's `--init`: baselining backfills the seeded packs and each declared pack's `requires`
closure, but never re-fingerprints, so a member that grows into a pack after adoption is never told
the pack exists and the owner has to already know what to ask for. The fourth exists for the same
shape of reason one rung up: a member can say whether a skill loads *there*, and only a view across
every member can say whether it earns its place at all. The fifth is the only one that **writes** to a
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
[adopt-pack](../grow_with_claudinite/skills/adopt-pack/SKILL.md) skill against the member. It is
ceilinged at `open-pr` and never auto-merges: declaring a pack switches on conformance checks that run
in that member's CI from the moment they land.

A member that declares itself **dormant** (`"dormant": true` in its own declaration) is out of the
freshness sweep, out of the fit sweep, out of the usage denominator, and never written to by the
pack-seed sweep — its scheduler is stopped, so its mount falls behind by design, its silence says
nothing about any skill, recommending it a pack would be recommending work it has declared it is not
doing, and a commit landed in it from outside is the upkeep it opted out of. It stays a **member**:
membership is unchanged, because dormancy is about upkeep, not membership.

**Every report enumerates the full fleet.** Whatever a repo's state — covered, dormant, uncovered,
excluded, archived, a fork, inactive today, or simply not measured by that sweep — each sweep's
report names it under exactly one state rather than dropping it. A roster that names only the
exceptions has silent holes, and a reader cannot tell "fine" from "fell out of the report": the
census lists covered members (dormant ones flagged) alongside the uncovered; the freshness sweep
names its fresh members and its out-of-scope repos with why; the fit sweep names the members that came
back **fitted** as loudly as the ones with findings, and names the fingerprints it could not decide
from outside rather than counting them as non-matches; the usage sweep's `coverage` section
accounts for every repo under the owner and its run report flags folding members with no captured
activity that day; force-baseline reports every repo it did *not* dispatch, with the reason.

The **manual lever** is not a sweep and not a task: **force-baseline** answers no recurring question, so it has
no cadence to schedule. It is the owner pressing *Run workflow* — fire every member's own scheduler
with `FORCE_TASKS=baselining` so the fleet picks canon up now instead of over the next day. It takes a
repo filter, a dry run, and an opt-in for dormant members; it writes nothing to any member (one queued
Actions run each). It then **follows** what it fired — a `204` is *queued*, not baselined — until every
member has finished baselining, agentic handoffs included, and reports what the fleet did: which members
moved and from which canon ref to which, lines changed, per-member timing, errors and warnings, whether
an agent ran. A dry run prints the same report with true zeros, so its shape can be inspected without
changing anything. Its `workflow_dispatch`-only workflow adds no cron, so the
vendored scheduler stays the enforcer's only one — and because GitHub reads workflows solely from a
repo's own `.github/`, the [`sheepdog-fleet-baseline`](../../migrations/2026-08-05-sheepdog-fleet-baseline/migration.mjs)
migration keeps a byte-identical copy there, gated on the repo declaring this pack. The nightly's own
token cannot write a workflow file, so the converge withholds it and baselining's agent stage lands it
over MCP ([#649](https://github.com/missingbulb/Claudinite/issues/649)) — automatic either way.

Each sweep lives **inside its task's folder**, because nothing outside that task uses it; force-baseline
lives in [fleet-baseline/](fleet-baseline/) beside them, because it belongs to no task. Only what they
all share sits at the pack root: [fleet-api.mjs](fleet-api.mjs) (the cross-repo REST primitives) and
[fleet-config.mjs](fleet-config.mjs) (the one reader of this pack's entry `config`).

The rest of the machinery — running the daily-run, the task engine (`engine/scheduler/`), scheduling —
is Claudinite **core**. Carries no conformance checks. Policy + config: [RULES.md](RULES.md).
