# How scheduled work runs — one scheduler per repo

**Every repo schedules itself.** A vendored hourly **scheduler Action**
(`.github/workflows/claudinite-scheduler.yml`) is the repo's **only cron**; it
evaluates each task's precondition in code and dispatches agent work as
`ready-for-agent` `[claudinite-task]` issues, which a per-repo **executor
routine** (fired by that label event) runs. Everything else that runs on a
cadence is a **`workflow_dispatch`-only executor** that a scheduler task triggers
and awaits — never a thing with a cron of its own.

The design and phased rollout live in
[../../docs/per-project-scheduling/DESIGN.md](../../docs/per-project-scheduling/DESIGN.md)
and [MIGRATION.md](../../docs/per-project-scheduling/MIGRATION.md). Work that is
genuinely fleet-scoped (promote, discover-packs, migrations-retire, census)
becomes ordinary tasks *of the canon/sheepdog repos* on the same machinery — no
separate central mechanism survives once the rollout completes.

This is an agent-practices rule, stated once here as the home for it:

> Give an executor a cron and it silently becomes a **second orchestrator with a
> competing trigger**. One scheduler per repo — the vendored hourly Action;
> agent work is dispatched only through `ready-for-agent` issues; every other
> recurring workflow is `workflow_dispatch`-only, triggered and awaited by a
> scheduler task. — the agent-practices skill

So a pack task that needs an Action declares it `workflow_dispatch`-only; the
task's worker (or the scheduler's inline `model: none` worker) triggers it and
awaits its completion (report at completion, not at the trigger — the
async-completion rule). E.g. `store-release`'s `Release to Chrome Store`
workflow.

No workflow *in* a repo — canon or consumer — carries a `schedule:` trigger for
Claudinite work **except** the one vendored `claudinite-scheduler.yml`. A
second scheduled executor is a conformance violation
(`gha/no-scheduled-fleet-executor`), and the scheduler workflow's own shape is
enforced by `scheduler-workflow-shape`, not just a review note.

**During the rollout** (until Phase 4) the legacy central routine
([../auto-all-repos-maintenance.md](../auto-all-repos-maintenance.md)) still
runs for repos that have not cut over — it skips any repo whose
`.claudinite-checks.json` declares the `schedule` key, so exactly one mechanism
owns a repo at any time.
