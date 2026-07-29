# sheepdog

The fleet **enforcer** marker — declaring it makes a repo the one that covers and maintains every repo
under an owner. Opt-in (a dedicated sheepdog repo declares it; **not** seeded by `--init`). It
standardizes the fleet coverage that used to be bespoke Claudinite infrastructure into a declaration.

Thin by design: prose + the config schema (the sheepdog pack entry's `config` = `{ owner, kind, exclude,
canonRepo, staleDays }`) + three cross-repo **sweeps**, each with the one agentless scheduled task that
runs it (the sweep is its `agent_preprocessing`; no workflow of its own):

| sweep | task | asks |
|---|---|---|
| [check-fleet-coverage.mjs](tasks/fleet-census/check-fleet-coverage.mjs) | [fleet-census](tasks/fleet-census/task.md) (daily) | is this repo a **member**? → adoption issues |
| [check-fleet-freshness.mjs](tasks/fleet-freshness/check-fleet-freshness.mjs) | [fleet-freshness](tasks/fleet-freshness/task.md) (weekly) | is a member **keeping up**? → drift issues |
| [aggregate-fleet-usage.mjs](tasks/fleet-usage/aggregate-fleet-usage.mjs) | [fleet-usage](tasks/fleet-usage/task.md) (daily) | what does the fleet **actually use**? → `usage-fleet.GENERATED.json` |

The second exists because per-project scheduling made every member maintain itself and, in doing so,
removed the last thing that looked at a member from the **outside** — self-maintenance cannot detect its
own absence. The third exists for the same shape of reason one rung up: a member can say whether a
skill loads *there*, and only a view across every member can say whether it earns its place at all.

A member that declares itself **dormant** (`"dormant": true` in its own declaration) is out of the
freshness sweep and out of the usage denominator — its scheduler is stopped, so its mount falls
behind by design and its silence says nothing about any skill. It stays a **member**: the census
is unchanged, because dormancy is about upkeep, not membership.

Each sweep lives **inside its task's folder**, because nothing outside that task uses it. Only what
both share sits at the pack root: [fleet-api.mjs](fleet-api.mjs) (the cross-repo REST primitives) and
[fleet-config.mjs](fleet-config.mjs) (the one reader of this pack's entry `config`).

The rest of the machinery — running the daily-run, the task engine (`engine/scheduler/`), scheduling —
is Claudinite **core**. Carries no conformance checks. Policy + config: [RULES.md](RULES.md).
