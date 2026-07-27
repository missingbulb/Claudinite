# sheepdog

The fleet **enforcer** marker — declaring it makes a repo the one that covers and maintains every repo
under an owner. Opt-in (a dedicated sheepdog repo declares it; **not** seeded by `--init`). It
standardizes the fleet coverage that used to be bespoke Claudinite infrastructure into a declaration.

Thin by design: prose + the config schema (the sheepdog pack entry's `config` = `{ owner, kind, exclude,
canonRepo, staleDays }`) + two cross-repo **sweeps**, each with the one agentless scheduled task that
runs it (the sweep is its `agent_preprocessing`; no workflow of its own):

| sweep | task | asks |
|---|---|---|
| [check-fleet-coverage.mjs](tasks/fleet-census/check-fleet-coverage.mjs) | [fleet-census](tasks/fleet-census/task.md) (daily) | is this repo a **member**? → adoption issues |
| [check-fleet-freshness.mjs](tasks/fleet-freshness/check-fleet-freshness.mjs) | [fleet-freshness](tasks/fleet-freshness/task.md) (weekly) | is a member **keeping up**? → drift issues |

The second exists because per-project scheduling made every member maintain itself and, in doing so,
removed the last thing that looked at a member from the **outside** — self-maintenance cannot detect its
own absence.

Each sweep lives **inside its task's folder**, because nothing outside that task uses it. Only what
both share sits at the pack root: [fleet-api.mjs](fleet-api.mjs) (the cross-repo REST primitives) and
[fleet-config.mjs](fleet-config.mjs) (the one reader of this pack's entry `config`).

The rest of the machinery — running the daily-run, the task engine (`engine/scheduler/`), scheduling —
is Claudinite **core**. Carries no conformance checks. Policy + config: [RULES.md](RULES.md).
