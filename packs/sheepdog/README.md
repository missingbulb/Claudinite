# sheepdog

The fleet **enforcer** marker — declaring it makes a repo the one that covers and maintains every repo
under an owner. Opt-in (a dedicated sheepdog repo declares it; **not** seeded by `--init`). It
standardizes the fleet coverage that used to be bespoke Claudinite infrastructure into a declaration.

Thin by design: prose + the config schema (the sheepdog pack entry's `config` = `{ owner, kind, exclude,
canonRepo, staleDays, preferencesRepo }`) + four cross-repo **sweeps**, each with the one agentless
scheduled task that runs it (the sweep is its `prework`; no workflow of its own) — plus one
**manual lever** that has no cadence and therefore does have a workflow:

| sweep | task | asks |
|---|---|---|
| [check-fleet-coverage.mjs](tasks/fleet-census/check-fleet-coverage.mjs) | [fleet-census](tasks/fleet-census/task.md) (daily) | is this repo a **member**? → adoption issues |
| [check-fleet-freshness.mjs](tasks/fleet-freshness/check-fleet-freshness.mjs) | [fleet-freshness](tasks/fleet-freshness/task.md) (weekly) | is a member **keeping up**? → drift issues |
| [aggregate-fleet-usage.mjs](tasks/fleet-usage/aggregate-fleet-usage.mjs) | [fleet-usage](tasks/fleet-usage/task.md) (daily) | what does the fleet **actually use**? → `usage-fleet.GENERATED.json` |
| [check-fleet-preferences.mjs](tasks/fleet-preferences/check-fleet-preferences.mjs) | [fleet-preferences](tasks/fleet-preferences/task.md) (daily) | does a member know where the fleet's people keep their **preferences**? → the pack declaration, written |
| [force-fleet-baseline.mjs](fleet-baseline/force-fleet-baseline.mjs) + [follow-fleet-baseline.mjs](fleet-baseline/follow-fleet-baseline.mjs) | *(no task — the [fleet-baseline workflow](stubs/workflows/fleet-baseline.yml), `workflow_dispatch` only)* | make every member baseline **now**, watch each one finish → what the fleet did |

The second exists because per-project scheduling made every member maintain itself and, in doing so,
removed the last thing that looked at a member from the **outside** — self-maintenance cannot detect its
own absence. The third exists for the same shape of reason one rung up: a member can say whether a
skill loads *there*, and only a view across every member can say whether it earns its place at all.
The fourth is the only one that **writes** to a member: personal preferences belong to a fleet's *people*,
so each member declares the `UserPreferencesStore` pack and names the repo holding them (that pack's
session-start step reads the current user's file from it) — and only the enforcer can name it, because the
canon does not know which fleet it is being mounted into.

A member that declares itself **dormant** (`"dormant": true` in its own declaration) is out of the
freshness sweep, out of the usage denominator, and never written to by the preferences sweep — its
scheduler is stopped, so its mount falls behind by design, its silence says nothing about any skill,
and a commit landed in it from outside is the upkeep it opted out of. It stays a **member**: membership
is unchanged, because dormancy is about upkeep, not membership.

**Every report enumerates the full fleet.** Whatever a repo's state — covered, dormant, uncovered,
excluded, archived, a fork, inactive today, or simply not measured by that sweep — each sweep's
report names it under exactly one state rather than dropping it. A roster that names only the
exceptions has silent holes, and a reader cannot tell "fine" from "fell out of the report": the
census lists covered members (dormant ones flagged) alongside the uncovered; the freshness sweep
names its fresh members and its out-of-scope repos with why; the usage sweep's `coverage` section
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
repo's own `.github/`, the [`sheepdog-fleet-baseline`](../../migrations/active_migrations/2026-08-05-sheepdog-fleet-baseline.mjs)
migration keeps a byte-identical copy there, gated on the repo declaring this pack. The nightly's own
token cannot write a workflow file, so the converge withholds it and baselining's agent stage lands it
over MCP ([#649](https://github.com/missingbulb/Claudinite/issues/649)) — automatic either way.

Each sweep lives **inside its task's folder**, because nothing outside that task uses it; force-baseline
lives in [fleet-baseline/](fleet-baseline/) beside them, because it belongs to no task. Only what they
all share sits at the pack root: [fleet-api.mjs](fleet-api.mjs) (the cross-repo REST primitives) and
[fleet-config.mjs](fleet-config.mjs) (the one reader of this pack's entry `config`).

The rest of the machinery — running the daily-run, the task engine (`engine/scheduler/`), scheduling —
is Claudinite **core**. Carries no conformance checks. Policy + config: [RULES.md](RULES.md).
