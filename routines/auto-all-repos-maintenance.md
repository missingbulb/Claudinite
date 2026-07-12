# Fleet daily maintenance routine (the single scheduled entry point)

A portable, **project-agnostic** spec for the **one** daily routine that maintains **every repo the owner has opted into Claudinite** — scheduled once, from a single home repo, and reaching all the others. It carries no maintenance logic of its own. It is a thin **orchestrator** that does two things: **(1)** dispatch the code **planner** — the fleet-coverage census walk, which decides *what work each repo needs* in code and emits a `plan.json` — then **(2)** dispatch each planned unit as an isolated worker **at the tier its `smarts` names**, honoring the growth barriers. The point is twofold: the owner registers **a single schedule** for **all** their repos, and every unit is **guaranteed to run** because each is its own isolated subagent (or code action) — one failing, stalling, or exiting early cannot stop the others. The "should I run" decision is **code** (the planner), never this routine's judgment.

This routine **replaces** scheduling anything individually **and** any per-repo maintenance schedule: schedule *this* one, in one home repo, and nothing else. Do **not** also schedule the planner, the phases, or a per-repo routine. The planner and each step's spec stay exactly as written — this routine only dispatches the plan the planner emits, in the order it prescribes, in isolation.

## Conventions used in this doc

- **Home repo.** This routine is scheduled from, and keeps its tracking issue in, a single fixed **home repo** — the repo where you vendor and schedule this doc (for the reference deployment, that's Claudinite itself). "Home repo" below means that repo; every *other* repo it maintains is a **member repo**.
- **Default branch.** Each member repo's own default branch is whatever *that* repo uses; the plan and workers substitute it per repo, so this routine never assumes `main` for a member repo.
- **GitHub API access, fleet-wide.** This routine and its workers reach **many** repos, so they work entirely through the **GitHub API tooling** your environment exposes (the **GitHub MCP tools**, or `gh` where available) — dispatching the planner workflow, downloading the plan artifact, and letting each worker read/commit per its own doc. In sandboxed/automation environments the shell often reaches only a git-over-HTTPS proxy scoped to the session's own repo and **no cross-repo checkout is possible** — so every worker, like this routine, operates over the API, never by cloning a member repo. Use the MCP tools there, never `gh`/`curl`.

## What the planner decides, what this routine dispatches

The **planner** ([fleet/DESIGN.md](fleet/DESIGN.md)) runs in code inside the census ([check-fleet-coverage.mjs](../packs/sheepdog/check-fleet-coverage.mjs), dispatched via the sheepdog repo's [coverage workflow](../packs/sheepdog/stubs/fleet-coverage.yml)): **one fleet walk** emits the coverage census, baseline-migration retirement, **and** the **work plan** — a flat list of `(repo, task, worker, targets, reason, order, smarts)` **units**, one per `(repo, task)` a gate marked live. A repo with nothing to do yields no units, at an API-read's cost. This routine reads `plan.json` and dispatches those units; it decides *nothing* itself.

The units span every kind of maintenance, each deferring wholly to its own doc:

- **Growth** ([../growth/README.md](../growth/README.md)) — `growth-extract-new-instructions` (`order: growth:1`), `growth-dedup-local-instructions` (`growth:3`); `growth-promote-to-claudinite` runs once, central, **post-barrier** — not a planned unit, since its input is *this night's* extractions.
- **The `tidy-repo` pack** — `branch-cleanup` / `pr-assess` / `issue-triage` on every repo declaring the pack, and against the home repo.
- **`baselining`** (the `basics` task — the member re-run of the idempotent bootstrap + check-alignment) plus the **adoption** of census-queued repos (a first baseline — same [worker](../packs/basics/run_daily/baselining.worker.md)).
- **Any pack task** — e.g. `chrome-store-release`. New maintenance is a new pack `(gate, worker)` pair; the plan picks it up automatically — **no edit here**.

## Step 1 — dispatch the planner, read the plan

Trigger the `Fleet Coverage` workflow via `workflow_dispatch` and **await** it (poll on a rolling backoff), exactly as the sweep's Step 1 does. It carries the fleet PAT, enumerates every repo, gates each in code, and writes `plan.json` (uploaded as the `fleet-plan` artifact). **Download the artifact.** The enumeration, marker detection, and gating all live in the planner now — this routine no longer walks the fleet in-session.

If the planner run **fails**, or the plan's `errors` show probes that couldn't cover the fleet, you **cannot guarantee coverage** — log it (see Tracking) and dispatch whatever plan you have; a missing plan means a no-op day, logged.

## Step 2 — dispatch the units, at their tier, honoring the barriers

Run each unit's **worker** at the tier its `smarts` names: a subagent on the matching capability tier for `high` / `medium` / `low`, or, for **`none`**, a **direct code / tool execution** with no subagent. Dispatch subagents with the **Agent/Task tool, never the multi-agent-orchestration Workflow tool** — its mandatory interactive opt-in stalls an unattended run on step one, waiting for an "Allow" no one is there to click. Each worker runs **exactly per its own doc**, handed the unit's `targets`; this routine adds **no** behavior.

Ordering — the only thing this routine must honor:

- **Independent units** (`order: null` — the tidy dimensions, baselining, pack tasks) run **concurrently**, capped to a sane batch.
- **`tidy-report`** (`order: tidy:report`) runs **after** its own repo's other `tidy-repo` units settle — a **per-repo mini-barrier**, so it reconciles their verdicts into the standing tracker; narrower than the fleet-wide growth barrier, and independent across repos.
- **Growth units** run **phased, with a barrier between each** ([../growth/README.md](../growth/README.md) owns the order): all `growth:1` → barrier → `growth-promote-to-claudinite` **once** (iff ≥1 extract produced new local-doc content) → barrier → all `growth:3`.
- **Await async downstream** — a unit that triggers a dispatch-only Action (a pack task's) is done only when that Action **completes**, not at the trigger; poll it (report at completion, not the trigger).

The subagent boundary delivers the guarantees the owner cares about: **failure isolation** (a unit that errors, stalls, or exits early fails *its own* subagent only), **context isolation**, and **behavior unchanged**. Also run the `tidy-repo` tasks against the **home repo** (the canon declares no packs but its own PRs/branches/issues still need tending), and work the sweep's **adoption** queue for census-queued repos. Cap concurrency if the fleet is large, but **every** unit must be launched **and** waited on — a launched-but-unwaited unit is not a guaranteed unit. Wait for **everything** to settle before finishing.

## What the orchestrator itself must not do

The orchestrator is a sequencer, not a maintainer, and not a planner. It **never** re-derives the worklist in-session (the planner decides in code — read `plan.json`), and it **never** runs a worker's logic, merges, commits docs, edits the canon, or writes to a step's tracking issue — every such action belongs to the worker that owns it. The orchestrator's *only* write is the failure log on its **own** tracking issue in the home repo (next section). Keep it that thin.

## Tracking: log only failures, on the home repo's own issue

This routine keeps its **own** standing tracking issue **in the home repo**, separate from every step's — found **by title**, never a hard-coded number. Open it if it doesn't exist; reopen it if it was closed while a run still needs logging.

It logs **failures only** — the job is to guarantee every planned unit *ran* where it should, so the one thing worth surfacing is a run that **didn't** complete:

- **The planner run failed / the plan couldn't cover the fleet**, or **any worker failed, stalled, or exited without completing** (name the repo and task), or **a barrier could not be reached** (a `growth:1` unit never settled, so promote ran on incomplete input) → post a **dated comment** naming what was affected and the symptom.
- **Every planned unit completed where it should** (whether it changed anything or correctly did nothing) → **log nothing.** Workers already log their own *changes* to their own issues; a fleet-wide "all green" roll-up here would just be noise.

So on a normal day this routine writes nothing at all, and the only entries that accumulate are the failures you actually need to see.

## The launcher (Claude Code routine)

Keep the routine's config a **thin pointer** to this doc, not an inlined copy. Vendor this file (and the [fleet/](fleet/DESIGN.md), [growth/](../growth/README.md), and sweep specs) in your home repo, then schedule **this one routine** daily, pasting a prompt like the following and substituting the path where you vendored these docs:

> Run the fleet daily maintenance routine exactly as specified in `<path/to/routines/auto-all-repos-maintenance.md>`. **Dispatch the planner**: trigger the `Fleet Coverage` workflow via `workflow_dispatch`, await it (poll on a rolling backoff), and download its `fleet-plan` artifact (`plan.json`) — the planner enumerates the fleet and decides every unit in code; do not re-derive the worklist yourself. **Then dispatch each unit** as an isolated **plain subagent (never the Workflow orchestration tool, whose interactive opt-in an unattended routine can't answer)** at the tier its `smarts` names — or, for `smarts: none`, as a direct code/tool action, no subagent — running its `worker` doc against its repo with the unit's `targets`. Honor the ordering: independent units (tidy, baselining, pack tasks) concurrently; the growth units phased with a barrier between each — all `growth:1`, then `growth-promote-to-claudinite` once (only if an extract produced output), then all `growth:3`. Run the `tidy-repo` tasks against this home repo too, and work the sweep's adoption queue. Await any dispatched Action to completion, not to its trigger. Wait for everything to settle. You are a sequencer only: never re-plan in-session, never run a worker's logic, commit docs, edit the canon, or write to any step's tracking issue. Log **only failures** — the planner run failing, a plan that couldn't cover the fleet, a unit that didn't complete, or a barrier never reached — to this routine's own standing tracking issue in this home repo (found **by title**), naming the repo and task affected; on a clean day, log nothing.

Schedule it daily in your scheduler (the Claude Code Routines UI, a cron, or a CI nightly trigger), from the home repo. The planner Action and every pack-task Action stay `workflow_dispatch`-only — this routine is the one schedule ([fleet/scheduling.md](fleet/scheduling.md)).

## Run on a capable model

The workers make **judgment calls** — each unit's `smarts` names the tier its worker needs. This routine's own step (dispatch the planner, read the plan, fan out at each unit's tier) is mechanical, but it drives those judgment-heavy workers, so run this routine — and therefore its subagents — on a capable model.

## What this routine must never do

- **Never re-derive the worklist in-session** — dispatch the planner and read `plan.json`; the "should I run" gate is code, decided once, in the census walk.
- **Never run a worker's logic itself** — it dispatches units into subagents (or runs the `none`-tier code action); it does not merge, commit, edit docs, or open any worker's output except its own failure log.
- **Never fan out through the Workflow tool** — dispatch runs as plain subagents (Agent/Task). Its mandatory interactive opt-in has no one to answer it in an unattended routine, so it stalls the whole run on step one.
- **Never let one unit's failure block another** — each is its own isolated subagent (or code action), and every unit is launched and waited on regardless of how the others fare.
- **Never break the growth ordering** — run the growth units in the lifecycle's order, waiting at each barrier; only tidy, baselining, and pack tasks are unordered.
- **Never also schedule the planner, the phases, or a per-repo maintenance routine** — this routine is their single schedule across the whole fleet.
- **Never log on a clean day** — it logs only failures to its own home-repo tracking issue.
- **Never inline this spec, a worker's spec, or the plan into the launcher** — the launcher stays a thin pointer here.
