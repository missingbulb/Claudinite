# Fleet freshness — is each covered member still keeping up?

**This task runs no agent.** It is `agent_model: none` with `prework: node worker.mjs`, so the whole pass is the deterministic [`worker.mjs`](worker.mjs) the scheduler runs as a subprocess, which calls its sibling in this folder, the sweep ([`check-fleet-freshness.mjs`](check-fleet-freshness.mjs)). This file is the human-facing record of what that worker does; there is no dispatch issue and no subagent.

## Why it exists

Per-project scheduling made every member maintain **itself**: its own vendored `claudinite-scheduler.yml` fires hourly, and its `baselining` task re-vendors the mount from canon. That is the right architecture — and it removed the last thing that ever looked at a member from the **outside**.

A member whose scheduler was never vendored, whose workflow was deleted or auto-disabled, or whose baselining has been failing for a fortnight is now invisible. It is still `covered` to the census (it carries a declaration). It files no failure issue, because nothing runs there to fail. **Self-maintenance cannot detect its own absence.** This sweep is the outside look.

## What it does

Weekly, over the `FLEET_GITHUB_TOKEN` PAT: read this (sheepdog) repo's `sheepdog` pack entry `config` (`owner`, `exclude`, `canonRepo`, `staleDays`), enumerate every repo that owner owns, and for each **covered** member make three reads — its `.claudinite-checks.json` (for `claudinite.ref`), whether it carries `.github/workflows/claudinite-scheduler.yml`, and canon's comparison of that ref against canon's default branch. Then classify by **root cause**, in this precedence:

| state | meaning |
|---|---|
| `no-stamp` | declares packs but was never vendored — no engine on disk at all |
| `no-scheduler` | no vendored scheduler workflow, so no cron, so it will never baseline itself; every other symptom is downstream of this |
| `ref-not-on-trunk` | the stamped ref is not a canon commit, or not an ancestor of canon's default branch — vendoring's #328 anti-rewind guard refuses to write, so the repo is **wedged**, not merely late |
| `behind` | on trunk, but stamped at a commit older than `staleDays` while canon has moved on — baselining has stopped landing |
| `fresh` | at canon head, or behind it only within the window |

It publishes the picture to the run summary as a **full roster** — fresh members named with how fresh, out-of-scope repos (archived, forks, excluded, uncovered) named with why, and the two repos it never measures (the enforcer, canon) named as such — and converges **one drift issue per unhealthy member** in this repo, labelled `fleet-drift`: opened while unhealthy, closed `completed` once fresh again, closed `not planned` once the repo leaves the fleet (excluded, deleted, archived, or no longer covered), reopened if it regresses.

It **reports; it does not repair** — `expected_outcome: none`, and the issue body carries the fix for the specific state it found.

## A dormant member is not measured

A member that declares `"dormant": true` ([the scheduler's gate](../../../basics/scheduled-tasks.md)) is skipped before its stamp is read, and any open drift issue for it is closed *not planned*. Its scheduler is stopped, so its mount falls behind **by design** — reporting that would nag a repo for obeying its own declaration. It is counted in its own column of the summary, never as a failure.

The test is `isDormant`, re-exported from the engine rather than re-implemented here: a sweep with a private notion of dormancy would nag exactly the repos that had already opted out.

## Freshness, not coverage

The [census](../fleet-census/task.md) asks the prior question — is a repo covered **at all** — and opens adoption issues. This sweep takes coverage as given and asks whether that coverage still **means** anything. An uncovered repo gets no drift finding here — the adoption issue is the census's, and filing it twice would be double-reporting — but the summary still names it under *out of scope*, because the roster accounts for every repo.

## The one assumption

Baselining reverts a stamp-only bump, so `claudinite.updated` advances only when canon actually changed that member's vendor set. Age of the **stamped ref** is therefore the honest liveness measure, and `behind` reads *"this member has not picked canon up in `staleDays`"* — not *"canon moved"*.

It can still misfire on a member whose vendor set genuinely saw no change in the window. `staleDays` (default **14**) is the knob, and the drift issue says so rather than leaving the reader to guess.

## Not a fleet mechanism

Its *implementation* reads every repo under the owner, but its declaration, scheduling and lifecycle are those of **any pack task**: it is active because this repo declares the `sheepdog` pack, and it runs on this repo's ordinary scheduler. It declares no `fleet` signal and no `fleet` session scope — the cross-repo reach lives in the implementation, never in the wiring.

## Failure is loud

A member whose probe **errors** is classified `unknown`, never behind: no drift issue is opened for it, no open issue is closed on its behalf, and the sweep exits non-zero. The scheduler treats a non-zero preprocessing subprocess as a failed task and converges a `needs-human` issue, so an unusable token or scope escalates rather than silently shrinking the fleet.
