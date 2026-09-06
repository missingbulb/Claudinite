# Fleet baseline — force every member to baseline now

**This task runs no agent, and no schedule.** It declares no `preconditions`, with `agent_model: none`: it is not on the schedule, so the scheduler run never asks it, and the whole pass is the deterministic [`worker.mjs`](worker.mjs) → [`force-fleet-baseline.mjs`](force-fleet-baseline.mjs) the executor runs as code-work when — and only when — a human creates an item for it. This file is the human-facing record of what that is; there is no agent phase.

## How to pull the lever

Create the work item, from a checkout of this repo with `GITHUB_TOKEN` set:

```
node .claudinite/shared/packs/claudinite-tasks/queue/create-work-item.mjs claudinite-fleet-sheepdog/fleet-baseline \
  --context "REPOS=Alpha Beta" \
  --context "DRY_RUN=true" \
  --context "INCLUDE_DORMANT=true" \
  --context "FOLLOW_MINUTES=30"
```

Every `--context` line is optional:

```
REPOS=Alpha Beta            ← limit to these repos (bare name or owner/name, SPACE-separated); omit for every covered member
DRY_RUN=true                ← report what would fire, fire nothing
INCLUDE_DORMANT=true        ← dormant members are skipped by default — they stopped their own scheduler on purpose
FOLLOW_MINUTES=30           ← how long to follow members to current before giving up on what is left (default 20)
```

Values are space-separated because the parameter bag splits `KEY=value` pairs on commas. The two safety knobs are read from the item's Context and from nowhere else: an item created without them runs unscoped and live.

## What it does

Enumerate every repo under the configured owner over the `FLEET_GITHUB_TOKEN` PAT and, for each **covered, non-dormant** member, dispatch that member's own `claudinite-scheduler.yml` with `wake: update` — the same button the owner would press in that repo's Actions tab, pressed across the fleet in one run. The wake lever names one task, so each member does exactly one thing: converge its mount.

Nothing is baselined *here*, and nothing is written to any member — no commit, no issue, no comment. Each member converges its own mount, with its own token, under its own scheduler and delivery policy; if its converge needs an agent, that member's own executor runs it. The enforcer **dispatches**; the member **executes**. That is the whole trust model: no agent anywhere needs cross-repo access, and the one fleet credential is the PAT with Actions write.

Then it **follows** each dispatched member until that member's own `.claudinite-settings.json` stamps the engine and every declared pack at the versions canon publishes — reusing the comparison [`fleet-roster`](../fleet-roster/) already makes for its drift issues.

Every repo under the owner lands in the run summary under exactly one state — so a fleet-wide force is never mistaken for fleet-wide coverage. Dispatched members are reported by **outcome**:

```
converged           ← was behind canon, and reached its versions during this run
already-current     ← was at canon's versions before the dispatch, so its own update correctly declined
did-not-converge    ← its scheduler ran and it is still behind — go and read that run
never-started       ← the dispatch was accepted and no run followed it
unknown             ← the member could not be read
```

`already-current` is a **success**. A member at canon's versions has nothing to do, its `update` precondition says so, and demanding work of it would report a fault where there is none.

## What "current" does not mean

Freshness here is the **published version numbers**. Canon content that shipped without a version bump moves no number, so a member can read `already-current` while lacking canon's newest commit ([#1292](https://github.com/missingbulb/Claudinite/issues/1292)). The report says this itself rather than letting the word imply more than was checked.

## Why this is not the retired 45-minute sleep

The old follow was a blind fixed wait: every run paid it in full, whatever the fleet was doing, which is what forced the lever to be a standalone workflow. [`follow-to-current.mjs`](follow-to-current.mjs) polls a **real terminal condition** instead — each member leaves the loop the moment it reads current. An already-current fleet finishes on the first pass, in seconds. Only a member genuinely mid-converge costs any waiting, and the budget (`FOLLOW_MINUTES`) bounds even that.

## Why a task and not a workflow (any more)

The standalone `fleet-baseline.yml` workflow (retired 2026-08-11, #749) lived in the enforcer's `.github/` — the one place the nightly converge can never push (#649), so every change to it crossed the fleet by the slow withhold-and-hand-to-the-agent path. As a task, the lever ships with the ordinary vendor refresh like everything else, and the repo's vendored scheduler stays its **only** workflow. The typed `workflow_dispatch` inputs the old workflow offered are carried by the item's Context above.

## Failure is loud

A member that could not be dispatched — a missing scheduler workflow, a PAT without Actions write, a workflow GitHub disabled — is named in the summary and the sweep exits non-zero. **So is a member that was dispatched and never reached canon's versions**: that is the failure this whole follow exists to surface, and the one the dispatch-count report used to show as a success. The executor parks the item, so either escalates rather than silently leaving part of the fleet behind.

## Why the declaration reads as it does

Carried over from the declaration's comments when it became `task.json`.

claudinite-fleet-sheepdog task: fleet-baseline — the enforcer's MANUAL lever: force every covered
member (or the ones named) to baseline NOW instead of at its next occurrence.

No `preconditions` — the first task off the schedule (#749). It answers no recurring
question, so it states no condition and the scheduler run never asks it; the ONLY way
it runs is a work item created by hand, optionally carrying its parameters as Context
lines:

  create-work-item claudinite-fleet-sheepdog/fleet-baseline
  --context "REPOS=Alpha Beta"        (optional — omit for every covered member; space-separated)
  --context "DRY_RUN=true"            (optional — report what would fire, fire nothing)
  --context "INCLUDE_DORMANT=true"    (optional — dormant members are skipped by default)
  --context "FOLLOW_MINUTES=30"       (optional — how long to follow members to current)

This replaces the pack's standalone fleet-baseline WORKFLOW (retired 2026-08-11,
#749). The workflow existed for two reasons that are both gone: its FOLLOW half
(watch every member to a terminal state — a 45-minute sleep no serialized run
should hold) is given up, and its typed `workflow_dispatch` inputs are carried by
the item's Context instead. What the workflow shape COST is what this shape
recovers: the `.github/` managed copy was the one file the nightly converge could
not push (#649's withhold-and-hand-to-the-agent path), while a task rides the
ordinary vendor refresh like everything else.

`agent_model: 'none'` — pure code. The whole pass is the dispatch sweep
(force-fleet-baseline.mjs, invoked by worker.mjs): enumerate the fleet over the
PAT, wake each covered member's own `update` item, follow each one until it stamps
canon's published versions, and report the full roster by OUTCOME (#1293). Nothing
agentic happens HERE — each member's own converge may hand off to that member's own
agent, which is the fan-out model's point: the enforcer dispatches, the member
executes, and no agent anywhere needs cross-repo access.

Never due on its own — `manual` means the scheduler run never instantiates
this task, so an item exists ONLY because a human created one, and that IS the
request.
The dispatch half is one enumeration plus a declaration read and one POST per
member — under a minute. What sizes this bound is the FOLLOW (#1293): the sweep
stays until every dispatched member stamps canon's versions, and a member's own
update takes 5–10 minutes end to end. The follow gives up at
DEFAULT_FOLLOW_MINUTES (20) and reports what it was still waiting on, so this
must sit above that with room for the dispatch walk and the final probe —
otherwise the platform kills the run at the bound and the report is never
printed, which is the one outcome worse than a slow one.
