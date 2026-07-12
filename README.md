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

Before changing the canon itself, read **[consumer-safe-changes.md](consumer-safe-changes.md)** (provisional) — which propagation channel a change travels, how to migrate copied artifacts like stubs through the conformance checks, and the other practices we currently believe keep a canon change from hurting consuming repos.

`growth/` holds the **growth lifecycle**: how a lesson is learned in a consuming project, lifted into the canon when it's portable, and pruned back out once the canon owns it — three phases with a barrier between each, sequenced daily by the fleet orchestrator. See **[growth/README.md](growth/README.md)** for the full map; the pieces are:

- [growth/extract.md](growth/extract.md) — **phase 1, per project.** Captures the last 24h of bugs/PRs/commits into the project's **own** docs, at the project's own level (generalizing is phase 2's job), committing directly to the project's `main` (no per-run PR — it writes only local docs).
- [growth/promote.md](growth/promote.md) — **phase 2, central.** Reads every project's local docs, **generalizes** the portable lessons, routes each to the right canon home, and opens a PR against Claudinite's `main`. This is the sole judgment gate before shared canon; it replaces the old cross-repo handoff (Action + PAT + labelled issue), which is gone.
- [growth/dedup.md](growth/dedup.md) — **phase 3, per project.** Prunes local items the canon covers, **keeping** items the canon states too generally for that project. Opens a PR against the project's `main`.
- [growth/item-routing.md](growth/item-routing.md) — the shared worthiness + routing method the promote phase (and any other caller) defers to.

The mounted corpus itself is **`packs/`** (each `packs/<name>/` bundling a pack's prose `RULES.md` and its check modules, discovered structurally by [packs/registry.mjs](packs/registry.mjs) and activated by declaration) and **`skills/`** (activity-scoped procedures — catalog: [skills/README.md](skills/README.md)). `checks/` holds only the **engine** that runs the packs' checks — the dependency-free runner, its lib, the Stop hook and PreToolUse guard, and their tests. Usage and configuration → [checks/README.md](checks/README.md); design → [checks/DESIGN.md](checks/DESIGN.md); the per-rule audit → [checks/conversion-inventory.md](checks/conversion-inventory.md).

`migrations/` holds **declared, self-retiring path migrations** — one record per in-flight canon rename (a renamed or relocated artifact consumers hold their own copy of) that supplies the read-side resolver, the write-side rename, and the fleet telemetry that auto-retires it once every consumer has moved. See [migrations/README.md](migrations/README.md).

`routines/` holds the scheduled jobs:

- [routines/auto-all-repos-maintenance.md](routines/auto-all-repos-maintenance.md) — **the single scheduled entry point.** One daily routine, scheduled once from a home repo, that discovers **every** Claudinite-vendored repo the token can access (by the tracked `.claudinite/` marker) and sequences the growth lifecycle across the fleet — phase 1 in every repo (parallel) → barrier → phase 2 once (central) → barrier → phase 3 in every repo (parallel) — plus the nightly repo tidy-up and the fleet bootstrap sweep, each run as its own isolated subagent so no repo or phase can stop the others. Schedule **this**, nothing else.
- [routines/auto-repo-tidy.md](routines/auto-repo-tidy.md) — project-agnostic nightly repo tidy-up (open PRs, branches, and issues) any consuming repo can vendor and run.
- [routines/auto-fleet-bootstrap.md](routines/auto-fleet-bootstrap.md) — the **fleet bootstrap sweep**, owning all bootstrap work across the fleet: every member gets its mount wiring **baselined** and the repo **aligned** with its declared packs' current checks (delivered per the member's explicit `maintenance.delivery` flag, materialized as `push` into every member's `.claudinite-checks.json` so the knob is visible where you'd change it — flip to `pr` for a never-merged PR), and every repo under the owner's account that mounts nothing gets **adopted** via the same idempotent bootstrap — unless named on the owner-maintained [opt-out list](routines/fleet-bootstrap-opt-out.md) — so the account converges to covered-or-opted-out. A deterministic **coverage census** ([fleet-coverage.yml](.github/workflows/fleet-coverage.yml) running [check-fleet-coverage.mjs](routines/check-fleet-coverage.mjs) with an account-spanning PAT) is the sweep's dispatch-only executor — no schedule of its own — keeping that knowledge honest and converging one adoption issue per unwired, not-opted-out repo. Sequenced by the daily routine above — never scheduled itself.

**Where things land:** **extract** (phase 1) commits directly to each project's `main` (it writes only local docs), while **promote** (phase 2, the canon gate) and **dedup** (phase 3) each open a PR for the owner to approve. Every phase reads only what's already merged: extract lands on `main` immediately, so promote picks it up the same night, but promote still opens a PR, so promote → dedup waits an approval cycle. The owner's *on-demand, in-session* "learned lessons" command still delivers a PR.

## Submodule caveats (for consumers)

These apply only if you mount via the **submodule** method; the tarball sync sidesteps them (at the cost of pinning):

- Submodules aren't pulled automatically: clone with `git clone --recurse-submodules`, or run `git submodule update --init --recursive` after cloning.
- A consumer pins a specific commit SHA, so updating these rules does **not** auto-update consumers — each bumps its own pointer.
- Editing a rule's *content* is a commit/PR **here**; the consumer PR only records the new pointer SHA. Push/merge the content commit here **first**, then bump the consumer's pointer, or the pointer dangles.
