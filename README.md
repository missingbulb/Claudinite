# Claudinite

Portable Claude instructions/rules shared across projects — the **project-agnostic** maintainer guidelines, maintained **once** here and mounted into each consuming repo so they don't have to be copy-pasted per project. Project-*specific* rules stay in the consuming repo's own docs.

**Just adding Claudinite?** Tell the agent on the consuming repo:

> Read https://github.com/missingbulb/Claudinite/blob/main/README.md and bootstrap it.

---

## For the reading agent: how to traverse this corpus

**The agent-facing index lives in [CLAUDE.md](CLAUDE.md), not here.** It is the map of the corpus — two homes selected by *when* a rule is active: **`packs/<name>/`** (prose + checks, active once per session by the project's `.claudinite-checks.json` declaration — no pack is active undeclared, `basics` included; the active packs' prose is injected by a SessionStart hook) and **`skills/<name>/`** (activity-scoped procedures the harness surfaces on demand). Consumers mount it as `@.claudinite/CLAUDE.md`; an agent working in this repo loads it as the repo's own `CLAUDE.md`. Start there.

---

## How consuming repos join

Two ways to mount Claudinite (at `.claudinite/`) — pick by where your sessions run:

- **Submodule** — pinned and reproducible. Use for local checkouts, CI, or any git client whose credential spans more than one repo.
- **Session-start tarball sync** — auto-updating, no git credential needed. Use for **Claude Code on the web**, where the credential is scoped to the session's own repo and a submodule clone of this repo 403s at the proxy.

Either way, the corpus is imported with `@.claudinite/CLAUDE.md` in the consumer's `CLAUDE.md` — that single `@`-import pulls in the index map, and SessionStart hooks inject the active packs' prose (the baseline plus whatever the project declares) so nothing else has to be force-loaded. **Setup steps for both → [bootstrap.md](bootstrap.md).**

## Repository operations

Beyond the portable corpus above, two folders hold the machinery that keeps it fed and tidy — Claudinite-internal orchestration, **not** part of the mounted corpus.

Before changing the canon itself, read **[consumer-safe-changes.md](consumer-safe-changes.md)** (provisional) — which propagation channel a change travels, how to migrate copied artifacts like stubs through the conformance checks, and the other practices we currently believe keep a canon change from hurting consuming repos. And before *adding* a feature, read **[extending.md](extending.md)** — the core/pack boundary (what's engine vs. pack-contributed content) and where each kind of new feature goes.

The **growth lifecycle** — how a lesson is learned in a consuming project, lifted into the canon when it's portable, and pruned back out once the canon owns it — is **fully pack-based**, three independent stages split across two packs by who declares them (no barriers, no bespoke orchestrator step; the full narrative lives in **[packs/canon-curation/README.md](packs/canon-curation/README.md)**):

- [packs/grow_with_claudinite/](packs/grow_with_claudinite/README.md) — the **member-side** stages, on every repo declaring the pack: **extract** (captures the last 24h of bugs/PRs/commits into the project's **own** docs, committing directly to its `main`), **dedup** (prunes local items the canon covers, keeping items the canon states too generally; opens a PR), and the weekly **pack discovery** pipeline.
- [packs/canon-curation/](packs/canon-curation/README.md) — the **home-only** pack, declared solely by the canon home repo, so its tasks run central-once by declaration cardinality: **promote** (reads the changed members' local docs, **generalizes** the portable lessons, routes each to the right canon home, and opens a PR against Claudinite's `main` — the sole judgment gate before shared canon; it replaced the old cross-repo handoff, Action + PAT + labelled issue, which is gone) with its shared **item-routing** method, and the weekly **`prose-to-checks-sweep`** task.

The mounted corpus itself is **`packs/`** (each `packs/<name>/` bundling a pack's prose `RULES.md` and its check modules, discovered structurally by [packs/registry.mjs](packs/registry.mjs) and activated by declaration) and **`skills/`** (activity-scoped procedures — catalog: [skills/README.md](skills/README.md)). `checks/` holds only the **engine** that runs the packs' checks — the dependency-free runner, its lib, the Stop hook and PreToolUse guard, and their tests. Usage and configuration → [checks/README.md](checks/README.md); design → [checks/DESIGN.md](checks/DESIGN.md); the per-rule audit → [checks/conversion-inventory.md](checks/conversion-inventory.md).

`migrations/` holds the **baseline migrations** mechanism — declared, self-retiring path relocations, one record per in-flight canon rename (a renamed or relocated artifact consumers hold their own copy of) that supplies the read-side resolver, the write-side rename, and the fleet telemetry that auto-retires it once every consumer has moved. Named for when it runs: baselining applies and retires each. See [migrations/README.md](migrations/README.md).

`routines/` holds the scheduled jobs:

- [routines/auto-all-repos-maintenance.md](routines/auto-all-repos-maintenance.md) — **the single scheduled entry point**, run daily from the fleet-**enforcer** repo (one that declares the [`sheepdog`](packs/sheepdog/README.md) pack). It runs the core planner over the repos it can reach (the home repo included, planned last), reads the emitted units, and runs each covered repo's due `run_daily` units at their `smarts` tier — no repo or unit can stop the others. Schedule **this**, nothing else.
- [routines/fleet/plan.mjs](routines/fleet/plan.mjs) — the **planner**: pack-agnostic core code that goes over the repos it can reach and, for each covered member, assembles its declared packs' `run_daily` tasks, runs each gate in code, and emits the day's work plan. It depends on no single pack — an enforcer pack's coverage census is a separate, isolated concern, never the source of the plan.
- [packs/sheepdog/check-fleet-coverage.mjs](packs/sheepdog/check-fleet-coverage.mjs) — the enforcer pack's **census** (the cross-repo reach `sheepdog` adds): with an account-spanning PAT it enumerates the owner's repos, classifies coverage, and converges one adoption issue per uncovered repo. It is **coverage, not planning** — it does not build the work plan, and it carries **no migration logic** (baseline-migration application and retirement are the migrations flow's own standalone passes, `migrations/fleet-apply.mjs` + `migrations/fleet-retire.mjs`). Dispatched via that repo's `workflow_dispatch`-only coverage workflow (materialized from [the pack's stub](packs/sheepdog/stubs/fleet-coverage.yml)); which repos to cover and the exclude list come from its sheepdog pack entry's `config`.
- [routines/fleet/](routines/fleet/DESIGN.md) — the **run_daily engine** (the code that decides each repo's due tasks from its active packs) and the scheduling contract. **Baselining** is now the [`basics`](packs/basics/README.md) pack's daily task; **growth** rides [`grow_with_claudinite`](packs/grow_with_claudinite/README.md) (member-side) and [`canon-curation`](packs/canon-curation/README.md) (home-side); the PR/branch/issue sweep is [`tidy-repo`](packs/tidy-repo/README.md).

**Where things land:** **extract** commits directly to each project's `main` (it writes only local docs), while **promote** (the canon gate) and **dedup** each open a PR for the owner to approve. Every stage reads only what's already merged: a lesson extracted tonight is promoted the next night (the extract commit trips the next night's signals), and promote's PR means promote → dedup waits an approval cycle — the dominant latency either way. The owner's *on-demand, in-session* "learned lessons" command still delivers a PR.

## Submodule caveats (for consumers)

These apply only if you mount via the **submodule** method; the tarball sync sidesteps them (at the cost of pinning):

- Submodules aren't pulled automatically: clone with `git clone --recurse-submodules`, or run `git submodule update --init --recursive` after cloning.
- A consumer pins a specific commit SHA, so updating these rules does **not** auto-update consumers — each bumps its own pointer.
- Editing a rule's *content* is a commit/PR **here**; the consumer PR only records the new pointer SHA. Push/merge the content commit here **first**, then bump the consumer's pointer, or the pointer dangles.
