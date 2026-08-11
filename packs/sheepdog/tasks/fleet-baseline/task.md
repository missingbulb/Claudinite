# Fleet baseline — force every member to baseline now

**This task runs no agent, and no schedule.** It is `frequency: manual` with `agent_model: none`: it never fires on any cadence, and the whole pass is the deterministic [`worker.mjs`](worker.mjs) → [`force-fleet-baseline.mjs`](force-fleet-baseline.mjs) the scheduler runs as a subprocess when — and only when — a human forces it. This file is the human-facing record of what that is; there is no dispatch issue and no subagent.

## How to pull the lever

Run this repo's **Claudinite scheduler** workflow by hand (Actions → Claudinite scheduler → Run workflow) with `overrides`:

```
FORCE_TASKS=fleet-baseline
REPOS=Alpha Beta            ← optional: limit to these repos (bare name or owner/name, SPACE-separated); omit for every covered member
DRY_RUN=true                ← optional: report what would fire, fire nothing
INCLUDE_DORMANT=true        ← optional: dormant members are skipped by default — they stopped their own scheduler on purpose
```

Values are space-separated because the override bag splits `KEY=value` pairs on commas.

## What it does

Enumerate every repo under the configured owner over the `FLEET_GITHUB_TOKEN` PAT and, for each **covered, non-dormant** member, fire that member's own `claudinite-scheduler.yml` with `FORCE_TASKS=baselining` — the same button the owner would press in that repo's Actions tab, pressed across the fleet in one run. A forced run evaluates **only** the forced task (engine contract, #749), so each member does exactly one thing: baseline.

Nothing is baselined *here*, and nothing is written to any member — no commit, no issue, no comment. Each member converges its own mount, with its own token, under its own scheduler and delivery policy; if its converge needs an agent, that member's own executor runs it. The enforcer **dispatches**; the member **executes**. That is the whole trust model: no agent anywhere needs cross-repo access, and the one fleet credential is the PAT with Actions write.

Every repo under the owner lands in the run summary under exactly one state — fired, canon, out-of-scope, excluded, filtered-out, uncovered, dormant, or failed — so a fleet-wide force is never mistaken for fleet-wide coverage.

## What it deliberately does not do

**It does not wait.** A dispatch queues a run; what that run went on to do is each member's own story, told where members always tell it — a maintenance PR, a dispatch issue, a failure escalation in that repo. The retired workflow's *follow* half (watch every member to a terminal state, render a fleet report) is what forced the lever to be a standalone workflow with a 45-minute sleep; giving it up is what lets the lever ride the ordinary scheduler. If a member's forced run went wrong, that member says so in its own repo.

## Why a task and not a workflow (any more)

The standalone `fleet-baseline.yml` workflow (retired 2026-08-11, #749) lived in the enforcer's `.github/` — the one place the nightly converge can never push (#649), so every change to it crossed the fleet by the slow withhold-and-hand-to-the-agent path. As a task, the lever ships with the ordinary vendor refresh like everything else, and the repo's vendored scheduler stays its **only** workflow. The typed `workflow_dispatch` inputs the old workflow offered are carried by the override bag above.

## Failure is loud

A member that could not be dispatched — a missing scheduler, a PAT without Actions write, a workflow GitHub disabled — is named in the summary under `failed`, and the sweep exits non-zero. The scheduler converges a `needs-human` issue for the task family, so a broken grant escalates rather than silently leaving part of the fleet unforced.
