# sheepdog

The fleet **enforcer** marker — declaring it makes a repo the one that covers and maintains every repo
under an owner. Opt-in (a dedicated sheepdog repo declares it; **not** seeded by `--init`). It
standardizes the fleet coverage that used to be bespoke Claudinite infrastructure into a declaration.

Thin by design: prose + the config schema (the sheepdog pack entry's `config` = `{ owner, kind, exclude }`) + the
**census** ([check-fleet-coverage.mjs](check-fleet-coverage.mjs)) and the one agentless scheduled task
that runs it ([tasks/fleet-census/](tasks/fleet-census/task.md) — the census is its
`agent_preprocessing`; no workflow of its own). The rest of the machinery — running the
daily-run, the run_daily engine, scheduling — is Claudinite **core** (`routines/`). Carries no
conformance checks. Policy + config: [RULES.md](RULES.md).
