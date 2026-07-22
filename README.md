# Claudinite

Portable Claude instructions/rules shared across projects — the **project-agnostic** maintainer guidelines, maintained **once** here and mounted into each consuming repo so they don't have to be copy-pasted per project. Project-*specific* rules stay in the consuming repo's own docs.

**Just adding Claudinite?** Tell the agent on the consuming repo:

> Read https://github.com/missingbulb/Claudinite/blob/main/README.md and bootstrap it.

---

## For the reading agent: how to traverse this corpus

The corpus map (maintainer-facing — there is deliberately no agent-facing corpus index, #385: a
session needs no architecture lesson, its rules arrive injected):

- **`packs/<name>/`** — a pack bundles everything it contributes: prose (`RULES.md`, injected at
  session start when the pack is declared), checks (run at every Stop), **and its skills**
  (`<pack>/skills/<skill>/` — activity-scoped procedures the harness surfaces on demand, one
  owning pack per skill). No pack is active undeclared — the baseline included; activation is
  the project's `.claudinite-checks.json` declaration ([packs/README.md](packs/README.md) —
  the one catalog; a pack's skills are listed nowhere but the pack, #385). A consumer's own
  packs sit in its `.claudinite/local_packs/<name>/`, same slots, same engine.
- **`engine/`** — the machinery that runs pack content, and the one always-vendored root:
  `engine/hooks/` (the wired SessionStart/PreToolUse entry points),
  `engine/checks/check_the_world.mjs` / `engine/checks/check_the_work.mjs` (the world- and
  work-scope conformance runners — world runs in the project's test/CI flow, work in the stable
  `engine/hooks/stop-command.mjs` Stop gate), `engine/checks/helpers/`, `engine/pack_loader/`,
  `vendoring/` (vendoring). Design records: [engine/checks/DESIGN.md](engine/checks/DESIGN.md),
  [vendoring/DESIGN.md](vendoring/DESIGN.md); the core/pack boundary:
  [extending.md](extending.md).
- Before adding *any* rule as prose, run the promotion ladder in
  [engine/checks/DESIGN.md](engine/checks/DESIGN.md): a platform setting, a hook, a check, or a skill that can
  carry it beats prose.

---

## How consuming repos join

Consumers hold a **vendored, tracked** snapshot of the corpus at `.claudinite/shared/` — their
declaration-derived subset, committed as ordinary files, refreshed by the nightly maintenance as
one transactional commit (SessionStart hooks inject the active packs' prose; there is no corpus
index and no `@`-import — #385 — everything a session needs arrives injected, all offline). Adoption is
the one network moment. The model, its trade-offs, and the fleet transition from the earlier
fetch-at-session-start mount → [vendoring/DESIGN.md](vendoring/DESIGN.md); **setup steps →
[bootstrap.md](bootstrap.md)** (members on the legacy mount are converted by the gated flip
note, not by hand — bootstrap's transition appendix maintains them meanwhile).

## Repository operations

Beyond the portable corpus above, two folders hold the machinery that keeps it fed and tidy — Claudinite-internal orchestration, **not** part of the mounted corpus.

Before changing the canon itself, read **[consumer-safe-changes.md](consumer-safe-changes.md)** (provisional) — which propagation channel a change travels, how to migrate copied artifacts like stubs through the conformance checks, and the other practices we currently believe keep a canon change from hurting consuming repos. And before *adding* a feature, read **[extending.md](extending.md)** — the core/pack boundary (what's engine vs. pack-contributed content) and where each kind of new feature goes.

The **growth lifecycle** — how a lesson is learned in a consuming project, lifted into the canon when it's portable, and pruned back out once the canon owns it — is **fully pack-based**, three independent stages split across two packs by who declares them (no folder-access graph, no bespoke orchestrator step):

- The growth pack — the **member-side** stages, on every repo declaring the pack: **extract** (captures the last 24h of bugs/PRs/commits into the project's **own** docs via a PR that **auto-merges once its checks pass**), **dedup** (prunes local items the canon covers, keeping items the canon states too generally; opens a PR for review), and the weekly **pack discovery** pipeline.
- The curation pack — the **home-only** pack, declared solely by the canon home repo, so its tasks run central-once by declaration cardinality: **promote** (reads the changed members' local docs, **generalizes** the portable lessons, routes each to the right canon home, and opens a PR against Claudinite's `main` — the sole judgment gate before shared canon; it replaced the old cross-repo handoff, Action + PAT + labelled issue, which is gone) with its shared **item-routing** method, and the weekly **prose-mining sweep** task.

The mounted corpus itself is **`packs/`** — each `packs/<name>/` bundling a pack's prose `RULES.md`, its check modules, and its skills, discovered structurally by [engine/pack_loader/pack-registry.mjs](engine/pack_loader/pack-registry.mjs) and activated by declaration. `engine/` holds only the machinery that runs pack content. Usage and configuration → [engine/checks/README.md](engine/checks/README.md); design → [engine/checks/DESIGN.md](engine/checks/DESIGN.md); the per-rule audit → [docs/conversion-inventory.md](docs/conversion-inventory.md).

`migrations/` holds the **baseline migrations** mechanism — declared, self-retiring path relocations, one record per in-flight canon rename (a renamed or relocated artifact consumers hold their own copy of) that supplies the read-side resolver, the write-side rename, and the fleet telemetry that auto-retires it once every consumer has moved. Named for when it runs: baselining applies and retires each. See [migrations/README.md](migrations/README.md).

`routines/` holds the scheduled jobs:

- [routines/auto-all-repos-maintenance.md](routines/auto-all-repos-maintenance.md) — **the single scheduled entry point**, run daily from the fleet-**enforcer** repo (one that declares the enforcer pack). It runs the core planner over the repos it can reach (the home repo included, planned last), reads the emitted units, and runs each covered repo's due `run_daily` units at their `smarts` tier — no repo or unit can stop the others. Schedule **this**, nothing else.
- [routines/fleet/plan.mjs](routines/fleet/plan.mjs) — the **planner**: pack-agnostic core code that goes over the repos it can reach and, for each covered member, assembles its declared packs' `run_daily` tasks, runs each gate in code, and emits the day's work plan. It depends on no single pack — an enforcer pack's coverage census is a separate, isolated concern, never the source of the plan.
- `check-fleet-coverage.mjs` — the enforcer pack's **census** (the cross-repo reach the pack adds): with an account-spanning PAT it enumerates the owner's repos, classifies coverage, and converges one adoption issue per uncovered repo. It is **coverage, not planning** — it does not build the work plan, and it carries **no migration logic** (baseline-migration application and retirement are the migrations flow's own standalone passes, `migrations/fleet-apply.mjs` + `migrations/fleet-retire.mjs`). Dispatched via that repo's `workflow_dispatch`-only coverage workflow (materialized from the pack's stub); which repos to cover and the exclude list come from its pack entry's `config`.
- [routines/fleet/](routines/fleet/DESIGN.md) — the **run_daily engine** (the code that decides each repo's due tasks from its active packs) and the scheduling contract. **Baselining** is now the baseline pack's daily task; **growth** rides the member-side pack and the home-side pack; the PR/branch/issue sweep is the repo-tidy pack.

**Where things land:** **extract** lands each project's lessons through an **auto-merging PR** — CI-gated but not human-reviewed, so daily capture never queues up (it writes only local docs) — while **promote** (the canon gate) and **dedup** each open a PR for the owner to approve. Every stage reads only what's already merged: a lesson extracted tonight is promoted the next night (the extract PR's merge shows up in the next night's local-pack signal), and promote's PR means promote → dedup waits an approval cycle — the dominant latency either way. An owner-requested, in-session retrospective delivers a PR for a human to review, not one that self-merges.

## The submodule future (for consumers)

The vendored `shared/` root deliberately mirrors this repo's layout so that mounting Claudinite
as a **git submodule at `.claudinite/shared/`** — once sessions run where a cross-repo git
credential exists — is a drop-in upgrade that changes no wiring. Details in
[vendoring/DESIGN.md](vendoring/DESIGN.md).
