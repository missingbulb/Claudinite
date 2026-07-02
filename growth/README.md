# growth/ — how instructions are learned and flow between projects and the canon

This folder holds the **growth lifecycle**: how a lesson is learned in a consuming project, lifted into the shared Claudinite canon when it's portable, and pruned back out of the project once the canon owns it. It is the single home for that whole handover — replacing the older split across a per-repo lessons digest, a per-repo optimize routine, and a cross-repo handoff pipeline (Action + PAT + labelled issue), all now gone.

The lifecycle is **three phases with a barrier between each**, sequenced daily by the fleet orchestrator ([../routines/auto-all-repos-maintenance.md](../routines/auto-all-repos-maintenance.md)):

```
Phase 1  EXTRACT   per project, in parallel   → PR against each project's main
   ⟨barrier: every project has opened its extract PR⟩
Phase 2  PROMOTE   central, once              → PR against Claudinite main
   ⟨barrier: promotion's PR is opened⟩
Phase 3  DEDUP     per project, in parallel   → PR against each project's main
```

Every phase opens a **PR for the owner to approve** — none commits to `main` unattended. Because of that, a phase reads only what's **already merged** on `main`, not the still-open PR the previous phase just opened this cycle: a lesson flows extract → promote → dedup across **approval cycles**, not within one night. The daily order and barriers are kept so each phase still runs on the freshest *merged* state, but the propagation now spans however long the owner's approvals take.

- **[extract.md](extract.md)** — phase 1, per project. Captures the last 24h of bugs/PRs/commits into the project's **own** docs, at the project's own level (generalizing is phase 2's job). Opens a PR against the project's `main`; logs to a per-project tracking issue.
- **[promote.md](promote.md)** — phase 2, central. Reads every project's local docs, **generalizes** the portable lessons, routes each to the right canon home, and opens a PR against Claudinite's `main`. This is the sole judgment gate before shared canon.
- **[dedup.md](dedup.md)** — phase 3, per project. Prunes local items the canon covers, **keeping** items the canon states too generally for that project. Opens a PR against the project's `main`.
- **[item-routing.md](item-routing.md)** — the shared worthiness + routing method phase 2 (and any other caller) defers to, so every decision about admitting and placing an item is made the same way.
- **[extracting-lessons.md](extracting-lessons.md)** — the method for mining a single working session for lessons: the owner's on-demand "learned lessons" command, and the pass the merge flow runs after every merge. Delivered as a PR for review — the same approval gate the daily phases now use. **Force-loaded every session** (`@`-imported from the root [CLAUDE.md](../CLAUDE.md)) because the always-loaded merge flow references it and an unconditional step can't rely on a soft-pointer read.

## Identifying a project's local docs (the same way in all three phases)

Every phase operates on a project's **local instruction docs**, and all three identify them the **same way**: by following the import/pointer graph out from the repo's **root `CLAUDE.md`** — the very graph the agent itself loads — and treating everything under the mounted canon at `.claudinite/` as **read-only canon, not local docs**. So "a project's local docs" means precisely *the project's own docs reachable from its `CLAUDE.md`, minus the canon it mounts*. Don't scan the whole tree for stray Markdown; the `CLAUDE.md` graph is the authoritative set, and a doc no `CLAUDE.md` path reaches isn't part of the project's instructions.

The three phases only differ in *how they read that set*, never in *which set it is*: phases 1 and 3 run inside the repo and read it from the working tree; phase 2 runs centrally and walks the same graph over the GitHub API (get-file-contents from `CLAUDE.md` outward). Extract writes into it, promote reads from it, dedup prunes within it — all against the identical, `CLAUDE.md`-anchored corpus.

## Two design choices baked in here

- **Unattended → PR for approval.** Every phase above opens a PR for the owner to approve rather than committing to `main` — these are unattended daily routines run on a capable model, and the owner wants a human approval gate on every growth change. (The owner's *on-demand, in-session* "learned lessons" command delivers a PR the same way — see [extracting-lessons.md](extracting-lessons.md) and the owner preferences.)
- **Central promotion, no plumbing.** Phase 2 runs from the Claudinite home repo with a fleet-wide token, so it reads every project and opens its canon PR directly in this repo. That's why the old handoff machinery (a consumer-side Action, a Claudinite-scoped PAT, a labelled-issue up-path) no longer exists: there's no repo boundary left to tunnel across.

These specs are Claudinite-internal orchestration inputs, with one exception: [extracting-lessons.md](extracting-lessons.md) is `@`-imported by the root index and force-loads every session. Of the rest, consuming repos vendor the per-project phases ([extract.md](extract.md), [dedup.md](dedup.md)) the same way they vendor the other routines; [promote.md](promote.md) and [item-routing.md](item-routing.md) run only centrally and are not `@import`ed by consumers.
