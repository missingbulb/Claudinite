# `.github/workflows/` — this repo's own workflows

Everything here runs in Claudinite itself. GitHub requires every workflow and composite action to
live flat under `.github/`, and a converge cannot push to this directory, so a change to any of
these files lands only through a pull request a human merges.

## Repo CI

| File | Purpose |
|---|---|
| [`ci.yml`](ci.yml) | This repo's own unit tests + conformance sweep (`pull_request`, `push` to `main`). |
| [`pack-versions.yml`](pack-versions.yml) | Cuts each pack's version on `main` after a merge (`push` to `main`, `workflow_dispatch`). |
| [`canary-rehearsal.yml`](canary-rehearsal.yml) | The live canary: a real repo adopts this ref and runs its own scheduler (`push` to `main`, `workflow_dispatch`). |

## The queue

Both are thin stubs — triggers, permissions, concurrency and a `run:` line naming an engine
module. Logic belongs in the module, never here.

| File | Purpose |
|---|---|
| [`claudinite-scheduler.yml`](claudinite-scheduler.yml) | Plans the occurrences due and drains the queue. |
| [`claudinite-executor.yml`](claudinite-executor.yml) | Runs a work item. |

## Composite actions

[`../actions/report-failure`](../actions/report-failure) — opens the issue a failed run reports
itself through. Called by the scheduler here, and by member repos as
`missingbulb/Claudinite/.github/actions/report-failure@main`, so it is a frozen public API:
renaming or removing it breaks every member. Any change to it is the two-phase migration in
[../../consumer-safe-changes.md](../../consumer-safe-changes.md), never a one-shot.
