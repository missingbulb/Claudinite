# Fleet daily maintenance routine (the single scheduled entry point)

A portable, **project-agnostic** spec for the **one** daily routine that maintains **every repo the owner has opted into Claudinite** — scheduled once, from a single home repo, and reaching all the others. It carries no maintenance logic of its own. It is a thin **orchestrator** that does two things: **(1)** run the code **planner** — a pack-agnostic walk over the repos it can reach that decides *what work each repo needs* in code and emits the plan — then **(2)** dispatch each planned unit as an isolated worker **at the tier its `smarts` names**, honoring each unit's declared ordering. The point is twofold: the owner registers **a single schedule** for **all** their repos, and every unit is **guaranteed to run** because each is its own isolated subagent (or code action) — one failing, stalling, or exiting early cannot stop the others. The "should I run" decision is **code** (the planner), never this routine's judgment.

Two deterministic **migration passes** bracket that pack work: **before** any pack runs, the migration **apply pass** brings every covered member to the current canonical shape; **after** every unit settles, the migration **retire pass** finalizes (retires) any migration the fleet has fully applied and left quiet for a cycle. Both are pure code (`smarts: none`) the routine runs where the fleet token is available — the migrations flow owns them ([../migrations/fleet-apply.mjs](../migrations/fleet-apply.mjs), [../migrations/fleet-retire.mjs](../migrations/fleet-retire.mjs)); the routine only sequences them around the plan, adding no reasoning of its own.

This routine **replaces** scheduling anything individually **and** any per-repo maintenance schedule: schedule *this* one, in one home repo, and nothing else. Do **not** also schedule the planner, a pack's task, or a per-repo routine. The planner and each step's spec stay exactly as written — this routine only dispatches the plan the planner emits, in the order it prescribes, in isolation.

## Conventions used in this doc

- **Home repo.** This routine is scheduled from, and keeps its tracking issue in, a single fixed **home repo** — the repo where you vendor and schedule this doc (for the reference deployment, that's Claudinite itself). "Home repo" below means that repo; every *other* repo it maintains is a **member repo**.
- **Default branch.** Each member repo's own default branch is whatever *that* repo uses; the plan and workers substitute it per repo, so this routine never assumes `main` for a member repo.
- **GitHub API access, fleet-wide.** This routine and its workers reach **many** repos, so they work entirely through the **GitHub API tooling** your environment exposes (the **GitHub MCP tools**, or `gh` where available) — enumerating the accessible repos, running the planner's gates over them, and letting each worker read/commit per its own doc. In sandboxed/automation environments the shell often reaches only a git-over-HTTPS proxy scoped to the session's own repo and **no cross-repo checkout is possible** — so every worker, like this routine, operates over the API, never by cloning a member repo. Use the MCP tools there, never `gh`/`curl`.

## What the planner decides, what this routine dispatches

The **planner** ([fleet/DESIGN.md](fleet/DESIGN.md), [fleet/plan.mjs](fleet/plan.mjs)) is **pack-agnostic core code**: it goes over the repos it can reach — every covered member, plus the **home repo itself, planned last** with the fleet aggregate its home-only packs' gates need — and for each assembles the maintenance actions its declared packs contribute (their `run_daily` tasks), runs each action's **"should I run" gate** (pure code), and emits the day's **work plan** — a flat list of `(repo, task, worker, targets, reason, order, smarts)` **units**, one per `(repo, task)` a gate marked live. A repo with nothing to do yields no units, at an API-read's cost. **The planner never dispatches or depends on any one pack's workflow** — an enforcer pack's fleet-coverage census (the separate audit of whether every *owned* repo is covered, which needs an account-spanning token) is its own isolated concern, dispatched separately, so an un-set-up or failing enforcer pack can't stop the plan from being built over the repos already reachable. This routine runs the planner, reads its units, and dispatches them; it decides *nothing* itself.

The units span every kind of maintenance, each deferring wholly to its own doc:

- **Growth** ([../packs/canon-curation/README.md](../packs/canon-curation/README.md) owns the lifecycle narrative) — the member-side tasks (`growth-extract-new-instructions`, `growth-dedup-local-instructions`, `growth-discover-packs`) on every repo declaring `grow_with_claudinite`, and the central `growth-promote-to-claudinite` on the home repo via its home-only `canon-curation` pack. **All ordinary, independent planned units** — no phases, no barriers, no bespoke central step: each stage reads only what's already merged, so extract→promote→dedup propagates across successive nightly runs (and promote's PR approval was always the dominant latency).
- **The `tidy-repo` pack** — `branch-cleanup` / `pr-assess` / `issue-triage` on every repo declaring the pack, and against the home repo.
- **`baselining`** (the `basics` task — the member re-run of the idempotent bootstrap + check-alignment) plus the **adoption** of census-queued repos (a first baseline — same [worker](../packs/basics/run_daily/baselining.worker.md)).
- **Any pack task** — e.g. `chrome-store-release`. New maintenance is a new pack `(gate, worker)` pair; the plan picks it up automatically — **no edit here**.

## Step 0 — apply migrations across the fleet (before any pack work)

Before the planner runs, bring every covered member to the current canonical shape: run the migration **apply pass** ([../migrations/fleet-apply.mjs](../migrations/fleet-apply.mjs)) where a fleet-spanning token is available (the same place you run the planner). It walks the covered fleet and lands each member's pending migration writes — the declared file renames, template materializations, and ref rewrites — as **one commit**, honoring the member's `push`/`pr` delivery. It is **pure code (`smarts: none`** — no subagent) and idempotent: a member already on the canonical shape gets no commit. Running migrations *first* means the pack tasks (baselining's check-alignment included) evaluate the already-migrated shape. The pass writes `migrations-applied.json` — the ids it applied this cycle — which **Step 3** reads for its quiescence guard, so preserve that file through the run.

## Step 1 — run the planner over the accessible fleet

Run the **core planner** ([fleet/plan.mjs](fleet/plan.mjs)) over the repos you can reach: enumerate your accessible repos, and for each covered member assemble its declared packs' `run_daily` tasks ([fleet/registry.mjs](fleet/registry.mjs)) and run each task's **gate** ([fleet/gates.mjs](fleet/gates.mjs) — pure "should I run" code) over the member's signals ([fleet/signals.mjs](fleet/signals.mjs)). The result is the unit list — `buildWorkPlan` *is* exactly this loop. Where a fleet-spanning token is available, run `plan.mjs` directly and read its `plan.json`; otherwise drive the same core gate code over the repos your tools can reach. **Either way the worklist is decided by code, not by this routine's reasoning**, and the planner is **pack-agnostic — it never dispatches an enforcer pack's coverage workflow**, so nothing about one pack's setup can stop the plan from being built.

If the planner itself **fails** (the core gate code errors across the board), or its `errors` show probes that couldn't cover repos you *can* reach, you **cannot guarantee coverage** — log it (see Tracking) and dispatch whatever plan you have. But a **broken or un-set-up enforcer pack is not that failure**: it surfaces as an isolated adoption/baselining unit for that one repo (which its own worker fixes), never as a missing plan. Only a genuine planner-code failure is a no-op day, logged.

## Step 2 — dispatch the units, at their tier, honoring their ordering

Run each unit's **worker** at the tier its `smarts` names: a subagent on the matching capability tier for `high` / `medium` / `low`, or, for **`none`**, a **direct code / tool execution** with no subagent. Dispatch subagents with the **Agent/Task tool, never the multi-agent-orchestration Workflow tool** — its mandatory interactive opt-in stalls an unattended run on step one, waiting for an "Allow" no one is there to click. Each worker runs **exactly per its own doc**, handed the unit's `targets`; this routine adds **no** behavior.

Ordering — the only thing this routine must honor:

- **Independent units** (`order: null` — the tidy dimensions, baselining, the growth tasks, pack tasks) run **concurrently**, capped to a sane batch.
- **`tidy-report`** (`order: tidy:report`) runs **after** its own repo's other `tidy-repo` units settle — a **per-repo mini-barrier**, so it reconciles their verdicts into the standing tracker; independent across repos. This is the only ordering left: there is no fleet-wide barrier of any kind.
- **Await async downstream** — a unit that triggers a dispatch-only Action (a pack task's) is done only when that Action **completes**, not at the trigger; poll it (report at completion, not the trigger).

The subagent boundary delivers the guarantees the owner cares about: **failure isolation** (a unit that errors, stalls, or exits early fails *its own* subagent only), **context isolation**, and **behavior unchanged**. Also run the `tidy-repo` tasks against the **home repo** (it doesn't declare `tidy-repo` — its declaration carries only its home-only packs and the checks it runs on itself — but its PRs/branches/issues still need tending), and work the sweep's **adoption** queue for census-queued repos. Cap concurrency if the fleet is large, but **every** unit must be launched **and** waited on — a launched-but-unwaited unit is not a guaranteed unit. Wait for **everything** to settle before finishing.

## Step 3 — finalize migrations (retire)

Only after **every** unit has settled, run the migration **retire pass** ([../migrations/fleet-retire.mjs](../migrations/fleet-retire.mjs)) where the fleet token is available. It walks the covered fleet, probes each migration's fleet-wide completion, and **retires** — deletes the record and any canon files it relocated into the consumers — only a migration the whole fleet has applied **and** that Step 0 touched on **no** repo this cycle (the **quiescence guard**: it reads Step 0's `migrations-applied.json`, and retires **nothing** if that evidence is absent). Retirement is irreversible, so it runs **last**, on a fleet proven both converged and quiet. It is **pure code (`smarts: none`)**.

## What the orchestrator itself must not do

The orchestrator is a sequencer, not a maintainer. It **never** decides the worklist by its own reasoning — the "should I run" gate is code (the planner); the orchestrator *runs* that code and reads its units, it doesn't reason its way to a plan. And it **never** runs a *worker's* logic, merges, commits docs by its own judgment, edits the canon, or writes to a step's tracking issue — every such action belongs to the worker (or the deterministic pass) that owns it. Running the plan's **code steps** — the planner and the migration apply/retire passes (all `smarts: none`, owning their own writes to members/home) — is not the orchestrator reasoning; its *only* judgment-driven write is the failure log on its **own** tracking issue in the home repo (next section). Keep it that thin.

## Tracking: log only failures, on the home repo's own issue

This routine keeps its **own** standing tracking issue **in the home repo**, separate from every step's — found **by title**, never a hard-coded number. Open it if it doesn't exist; reopen it if it was closed while a run still needs logging.

It logs **failures only** — the job is to guarantee every planned unit *ran* where it should, so the one thing worth surfacing is a run that **didn't** complete:

- **The planner run failed / the plan couldn't cover the fleet**, or **any worker failed, stalled, or exited without completing** (name the repo and task), or **a unit's ordering could not be honored** (a repo's tidy units never settled, so its `tidy-report` reconciled incomplete verdicts) → post a **dated comment** naming what was affected and the symptom.
- **Every planned unit completed where it should** (whether it changed anything or correctly did nothing) → **log nothing.** Workers already log their own *changes* to their own issues; a fleet-wide "all green" roll-up here would just be noise.

So on a normal day this routine writes nothing at all, and the only entries that accumulate are the failures you actually need to see.

## The launcher (Claude Code routine)

Keep the routine's config a **thin pointer** to this doc, not an inlined copy. Vendor this file (and the [fleet/](fleet/DESIGN.md) and sweep specs) in your home repo, then schedule **this one routine** daily, pasting a prompt like the following and substituting the path where you vendored these docs:

> Run the fleet daily maintenance routine exactly as specified in `<path/to/routines/auto-all-repos-maintenance.md>`. **First, apply migrations across the fleet**: run `migrations/fleet-apply.mjs` (or drive the same writes over the API) to bring every covered member to the canonical shape before any pack work — it lands each member's pending migration writes as one commit honoring `push`/`pr` delivery and writes `migrations-applied.json` for the retire step. **Run the planner**: run the core planner (`routines/fleet/plan.mjs`) over the repos you can reach — it enumerates the accessible repos and decides every unit in code, **pack-agnostically (it never dispatches an enforcer pack's coverage workflow, and a broken enforcer pack is one isolated unit, not a missing plan)**; do not decide the worklist by your own reasoning. **Then dispatch each unit** as an isolated **plain subagent (never the Workflow orchestration tool, whose interactive opt-in an unattended routine can't answer)** at the tier its `smarts` names — or, for `smarts: none`, as a direct code/tool action, no subagent — running its `worker` doc against its repo with the unit's `targets`. Honor the ordering: units run concurrently (capped to a sane batch); the only ordered unit is a repo's `tidy-report`, which waits for that repo's other tidy units to settle — there is no fleet-wide barrier. Run the tidy tasks against this home repo too, and work the sweep's adoption queue. Await any dispatched Action to completion, not to its trigger. Once every unit has settled, **finalize migrations**: run `migrations/fleet-retire.mjs` to retire any migration the fleet has fully applied AND left untouched this cycle (it retires nothing if `migrations-applied.json` is absent). Wait for everything to settle. You are a sequencer only: never decide the worklist by your own reasoning, never run a worker's logic, commit docs, edit the canon, or write to any step's tracking issue. Log **only failures** — the planner code failing, a plan that couldn't cover the reachable fleet, a unit that didn't complete, or a unit's ordering that couldn't be honored — to this routine's own standing tracking issue in this home repo (found **by title**), naming the repo and task affected; on a clean day, log nothing.

Schedule it daily in your scheduler (the Claude Code Routines UI, a cron, or a CI nightly trigger), from the home repo. Every pack-task Action — an enforcer pack's coverage workflow included — stays `workflow_dispatch`-only; this routine is the one schedule ([fleet/scheduling.md](fleet/scheduling.md)).

## Run on a capable model

The workers make **judgment calls** — each unit's `smarts` names the tier its worker needs. This routine's own step (run the planner, read its units, fan out at each unit's tier) is mechanical, but it drives those judgment-heavy workers, so run this routine — and therefore its subagents — on a capable model.

## What this routine must never do

- **Never decide the worklist by the orchestrator's own reasoning** — run the core planner (the gate code) over the accessible fleet and read its units; the "should I run" gate is code, not a judgment call.
- **Never run a worker's logic itself** — it dispatches units into subagents (or runs the `none`-tier code action); it does not merge, commit, edit docs, or open any worker's output except its own failure log.
- **Never fan out through the Workflow tool** — dispatch runs as plain subagents (Agent/Task). Its mandatory interactive opt-in has no one to answer it in an unattended routine, so it stalls the whole run on step one.
- **Never let one unit's failure block another** — each is its own isolated subagent (or code action), and every unit is launched and waited on regardless of how the others fare.
- **Never break a unit's declared ordering** — a repo's `tidy-report` waits for that repo's other tidy units to settle; everything else is unordered and must not be artificially sequenced.
- **Never also schedule the planner, a pack's task, or a per-repo maintenance routine** — this routine is their single schedule across the whole fleet.
- **Never log on a clean day** — it logs only failures to its own home-repo tracking issue.
- **Never inline this spec, a worker's spec, or the plan into the launcher** — the launcher stays a thin pointer here.
