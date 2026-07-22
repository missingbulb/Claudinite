# Scheduling — legacy central model (being retired)

This folder is the **legacy** central-planner mechanism: one fleet routine
([../auto-all-repos-maintenance.md](../auto-all-repos-maintenance.md)) fanned an
agent out over every member repo on a single external schedule, and everything
else that ran on a cadence was a `workflow_dispatch`-only executor it triggered.

**That model is being replaced** by per-project scheduling (issue #394): every
repo schedules **itself** through a vendored hourly scheduler Action + a
label-fired executor — see the
[design](../../docs/per-project-scheduling/DESIGN.md) and the
[rollout](../../docs/per-project-scheduling/MIGRATION.md). During the transition
this central routine stays live as the rollback (it skips any repo that declares
the `schedule` key, so exactly one mechanism owns a repo at a time); the whole
`routines/fleet/` tree is removed at Phase 4.

The one rule that outlives the transition: a repo's recurring work has exactly
**one scheduler**, and every other workflow is `workflow_dispatch`-only —
triggered and awaited, never given a cron of its own. Give an executor a cron and
it silently becomes a second orchestrator with a competing trigger. This is
enforced by `gha/no-scheduled-fleet-executor` and stated for agents in the
unattended-agents skill.
