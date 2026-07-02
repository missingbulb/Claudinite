# Claudinite

Portable Claude instructions/rules shared across projects — the **project-agnostic** maintainer guidelines, maintained **once** here and mounted into each consuming repo so they don't have to be copy-pasted per project. Project-*specific* rules stay in the consuming repo's own docs.

**Just adding Claudinite?** Tell the agent on the consuming repo:

> Read https://github.com/missingbulb/Claudinite/blob/main/README.md and bootstrap it.

---

## For the reading agent: how to traverse this corpus

**The agent-facing index lives in [CLAUDE.md](CLAUDE.md), not here.** It is the map of the corpus — the read order (always/ baseline → preferences/ → technologies/ → tasks/), the per-directory contents, and the soft-pointer rule (follow links on demand, never `@`-import them — except the small always-on baseline, which the index force-loads via `@`). Consumers mount it as `@.claudinite/CLAUDE.md`; an agent working in this repo loads it as the repo's own `CLAUDE.md`. Start there.

---

## How consuming repos join

Two ways to mount Claudinite (at `.claudinite/`) — pick by where your sessions run:

- **Submodule** — pinned and reproducible. Use for local checkouts, CI, or any git client whose credential spans more than one repo.
- **Session-start tarball sync** — auto-updating, no git credential needed. Use for **Claude Code on the web**, where the credential is scoped to the session's own repo and a submodule clone of this repo 403s at the proxy.

Either way, the corpus is imported with `@.claudinite/CLAUDE.md` in the consumer's `CLAUDE.md` — that single `@`-import pulls in **the index plus the small always-on baseline it `@`-imports** ([CLAUDE.md](CLAUDE.md) and the baseline files it force-loads), and that index then softly routes to the rest on demand. **Setup steps for both → [bootstrap.md](bootstrap.md).**

## Repository operations

Beyond the portable corpus above, two folders hold the machinery that keeps it fed and tidy — Claudinite-internal orchestration, **not** part of the mounted corpus.

`growth/` holds the **growth lifecycle**: how a lesson is learned in a consuming project, lifted into the canon when it's portable, and pruned back out once the canon owns it — three phases with a barrier between each, sequenced daily by the fleet orchestrator. See **[growth/README.md](growth/README.md)** for the full map; the pieces are:

- [growth/extract.md](growth/extract.md) — **phase 1, per project.** Captures the last 24h of bugs/PRs/commits into the project's **own** docs, at the project's own level (generalizing is phase 2's job), opening a PR against the project's `main`.
- [growth/promote.md](growth/promote.md) — **phase 2, central.** Reads every project's local docs, **generalizes** the portable lessons, routes each to the right canon home, and opens a PR against Claudinite's `main`. This is the sole judgment gate before shared canon; it replaces the old cross-repo handoff (Action + PAT + labelled issue), which is gone.
- [growth/dedup.md](growth/dedup.md) — **phase 3, per project.** Prunes local items the canon covers, **keeping** items the canon states too generally for that project. Opens a PR against the project's `main`.
- [growth/item-routing.md](growth/item-routing.md) — the shared worthiness + routing method the promote phase (and any other caller) defers to.

`routines/` holds the scheduled jobs:

- [routines/auto-all-repos-maintenance.md](routines/auto-all-repos-maintenance.md) — **the single scheduled entry point.** One daily routine, scheduled once from a home repo, that discovers **every** Claudinite-vendored repo the token can access (by the tracked `.claudinite/` marker) and sequences the growth lifecycle across the fleet — phase 1 in every repo (parallel) → barrier → phase 2 once (central) → barrier → phase 3 in every repo (parallel) — plus the nightly branch report, each run as its own isolated subagent so no repo or phase can stop the others. Schedule **this**, nothing else.
- [routines/auto-branch-report.md](routines/auto-branch-report.md) — project-agnostic nightly open-branch status report any consuming repo can vendor and run.

**Where things land:** every growth phase is unattended and opens a PR for the owner to approve — nothing commits to `main` on its own. Because a phase reads only what's already merged, lessons flow extract → promote → dedup across approval cycles, not in one night. The owner's *on-demand, in-session* "learned lessons" command delivers a PR the same way.

## Submodule caveats (for consumers)

These apply only if you mount via the **submodule** method; the tarball sync sidesteps them (at the cost of pinning):

- Submodules aren't pulled automatically: clone with `git clone --recurse-submodules`, or run `git submodule update --init --recursive` after cloning.
- A consumer pins a specific commit SHA, so updating these rules does **not** auto-update consumers — each bumps its own pointer.
- Editing a rule's *content* is a commit/PR **here**; the consumer PR only records the new pointer SHA. Push/merge the content commit here **first**, then bump the consumer's pointer, or the pointer dangles.
