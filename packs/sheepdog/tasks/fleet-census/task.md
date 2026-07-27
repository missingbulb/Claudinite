# Fleet census — classify coverage and converge adoption issues

**This task runs no agent.** It is `agent_model: none` with `agent_preprocessing: node worker.mjs`, so the whole pass is the deterministic [`worker.mjs`](worker.mjs) the scheduler runs as a subprocess, which calls its sibling in this folder, the census ([`check-fleet-coverage.mjs`](check-fleet-coverage.mjs)). This file is the human-facing record of what that worker does; there is no dispatch issue and no subagent.

## What it does

Daily, over the `FLEET_GITHUB_TOKEN` PAT: read this (sheepdog) repo's `sheepdog` pack entry `config` (`owner` to cover, `exclude` list), enumerate every repo that owner owns, classify each — **covered** (carries a tracked `.claudinite-checks.json`), **uncovered**, **opted out**, or **skipped** (fork/archived) — publish the picture to the run summary, and converge **one adoption issue per actionable uncovered repo** in this repo: opened while uncovered, closed `completed` once covered, closed `not planned` once excluded, reopened if it regresses.

It is **coverage, not planning** — it does not build the work plan (that is the core planner's job) — and it carries **no migration logic**.

## Not a fleet mechanism

Its *implementation* scans every repo under the owner, but its declaration, scheduling and lifecycle are those of **any pack task**: it is active because this repo declares the `sheepdog` pack, and it runs on this repo's ordinary scheduler. It declares no `fleet` signal and no `fleet` session scope — the cross-repo reach lives in the implementation, never in the wiring.

## Failure is loud

A repo whose marker check **errors** is classified `unknown`, never uncovered: no adoption issue is opened for it and the census exits non-zero. The scheduler treats a non-zero preprocessing subprocess as a failed task and converges a `needs-human` issue, so an unusable token or scope escalates rather than silently shrinking the fleet.
