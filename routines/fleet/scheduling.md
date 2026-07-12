# How scheduled work runs in the fleet — one scheduler

The **fleet daily maintenance routine** ([../auto-all-repos-maintenance.md](../auto-all-repos-maintenance.md))
is the **only** schedule. Everything else that runs on a cadence is a **`workflow_dispatch`-only
executor** the routine triggers and awaits — never a thing with a cron of its own.

This is the `unattended-agents` rule, stated once here as the fleet's home for it:

> Give an executor a cron and it silently becomes a **second orchestrator with a competing trigger**.
> One schedule, owned by the orchestrating routine; executors run only when dispatched.
> — [skills/unattended-agents/SKILL.md](../../skills/unattended-agents/SKILL.md)

So a **future daily / pack-based routine does not self-schedule.** In particular:

- The **coverage census** ([fleet-coverage.yml](../../packs/sheepdog/stubs/fleet-coverage.yml)) —
  `workflow_dispatch` only. It's the sheepdog repo's census arm (dispatched by
  [the orchestrator](../auto-all-repos-maintenance.md)), and it also emits the work plan.
- The **fleet bootstrap sweep** — sequenced by the routine, never scheduled.
- **Every pack task's supporting GitHub Action** — e.g. `chrome-store-release`'s `Release to Chrome
  Store` workflow. A pack task that needs an Action declares it `workflow_dispatch`-only; the task's
  worker triggers it and awaits its completion (report at completion, not at the trigger — the
  async-completion rule).

The fleet routine itself is scheduled **externally** (the Claude Code Routines UI or a cron on a home
repo), so no workflow *in* a repo — canon or consumer — carries a `schedule:` trigger for Claudinite
executor work. A pack-task or fleet-executor workflow that grows a `schedule:` trigger is a
conformance violation (enforced by a `github-actions`-pack check), not just a review note.
