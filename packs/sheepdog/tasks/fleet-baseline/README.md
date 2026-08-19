# Fleet baseline — force every member to baseline now

**This task runs no agent, and no schedule.** It is `frequency: manual` with `agent_model: none`: the tick never instantiates it, and the whole pass is the deterministic [`worker.mjs`](worker.mjs) → [`force-fleet-baseline.mjs`](force-fleet-baseline.mjs) the executor runs as code-work when — and only when — a human creates an item for it. This file is the human-facing record of what that is; there is no agent phase.

## How to pull the lever

Create the work item, from a checkout of this repo with `GITHUB_TOKEN` set:

```
node .claudinite/shared/engine/scheduler/queue/create-work-item.mjs sheepdog/fleet-baseline \
  --context "REPOS=Alpha Beta" \
  --context "DRY_RUN=true" \
  --context "INCLUDE_DORMANT=true"
```

Every `--context` line is optional:

```
REPOS=Alpha Beta            ← limit to these repos (bare name or owner/name, SPACE-separated); omit for every covered member
DRY_RUN=true                ← report what would fire, fire nothing
INCLUDE_DORMANT=true        ← dormant members are skipped by default — they stopped their own scheduler on purpose
```

Values are space-separated because the parameter bag splits `KEY=value` pairs on commas. The two safety knobs are read from the item's Context and from nowhere else: an item created without them runs unscoped and live.

## What it does

Enumerate every repo under the configured owner over the `FLEET_GITHUB_TOKEN` PAT and, for each **covered, non-dormant** member, dispatch that member's own `claudinite-scheduler.yml` with `wake: update` — the same button the owner would press in that repo's Actions tab, pressed across the fleet in one run. The wake lever names one task, so each member does exactly one thing: converge its mount.

Nothing is baselined *here*, and nothing is written to any member — no commit, no issue, no comment. Each member converges its own mount, with its own token, under its own scheduler and delivery policy; if its converge needs an agent, that member's own executor runs it. The enforcer **dispatches**; the member **executes**. That is the whole trust model: no agent anywhere needs cross-repo access, and the one fleet credential is the PAT with Actions write.

Every repo under the owner lands in the run summary under exactly one state — fired, canon, out-of-scope, excluded, filtered-out, uncovered, dormant, or failed — so a fleet-wide force is never mistaken for fleet-wide coverage.

## What it deliberately does not do

**It does not wait.** A dispatch queues a run; what that run went on to do is each member's own story, told where members always tell it — a maintenance PR, a work item, a failure escalation in that repo. The retired workflow's *follow* half (watch every member to a terminal state, render a fleet report) is what forced the lever to be a standalone workflow with a 45-minute sleep; giving it up is what lets the lever ride the ordinary scheduler. If a member's forced run went wrong, that member says so in its own repo.

## Why a task and not a workflow (any more)

The standalone `fleet-baseline.yml` workflow (retired 2026-08-11, #749) lived in the enforcer's `.github/` — the one place the nightly converge can never push (#649), so every change to it crossed the fleet by the slow withhold-and-hand-to-the-agent path. As a task, the lever ships with the ordinary vendor refresh like everything else, and the repo's vendored scheduler stays its **only** workflow. The typed `workflow_dispatch` inputs the old workflow offered are carried by the item's Context above.

## Failure is loud

A member that could not be dispatched — a missing scheduler workflow, a PAT without Actions write, a workflow GitHub disabled — is named in the summary under `failed`, and the sweep exits non-zero. The executor converges the item to `needs-human`, so a broken grant escalates rather than silently leaving part of the fleet unforced.
