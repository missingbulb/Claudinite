# How scheduled work runs in the fleet — one scheduler

The **fleet daily maintenance routine** ([../auto-all-repos-maintenance.md](../auto-all-repos-maintenance.md))
is the **only** schedule. Everything else that runs on a cadence is a **`workflow_dispatch`-only
executor** the routine triggers and awaits — never a thing with a cron of its own.

This is an agent-practices rule, stated once here as the fleet's home for it:

> Give an executor a cron and it silently becomes a **second orchestrator with a competing trigger**.
> One schedule, owned by the orchestrating routine; executors run only when dispatched.
> — the agent-practices skill

So a **future daily / pack-based routine does not self-schedule.** In particular:

- The **fleet bootstrap sweep** — sequenced by the routine, never scheduled.
- **Every pack task's supporting GitHub Action** — e.g. `chrome-store-release`'s `Release to Chrome
  Store` workflow. A pack task that needs an Action declares it `workflow_dispatch`-only; the task's
  worker triggers it and awaits its completion (report at completion, not at the trigger — the
  async-completion rule).

The fleet routine itself is scheduled **externally** (the Claude Code Routines UI or a cron on a home
repo), so no workflow *in* a repo — canon or consumer — carries a `schedule:` trigger for Claudinite
executor work. A pack-task or fleet-executor workflow that grows a `schedule:` trigger is a
conformance violation (enforced by a workflow-lint pack check), not just a review note.
