# Growth phase 3 — dedup local docs against the canon (per project)

A portable, **project-agnostic** spec for the daily Claude Code routine that reconciles a project's local docs against the shared **canon** it consumes (Claudinite — vendored read-only), pruning local items the canon now covers. It is phase 3 of the [growth lifecycle](README.md): [extract](extract.md) captured local lessons, [promote](promote.md) lifted the portable ones into the canon, and this phase — running **after** promotion has updated the canon — removes the local copies that the canon now owns. Any consuming repo that mounts the canon can run it. Like the other phases it runs unattended and **most days changes little or nothing** — the steady state is already reconciled, so a forced prune is worse than none.

> This phase only pulls **down** (prune/rephrase local vs. canon). The old up-direction — promoting local items into the canon — is gone from here; [phase 2](promote.md) now does that centrally over every project at once.

## Conventions used in this doc

- **Default branch.** Below, `main` stands for **your repository's default branch** — substitute whatever your repo uses.
- **GitHub API access.** Updating the tracking issue goes through your environment's GitHub API tooling — the **GitHub MCP tools** or the `gh` CLI. In sandboxed/automation environments the shell often reaches only a **git-over-HTTPS proxy with no GitHub API**; there, use the MCP tools, never `gh` / `curl`. Use whichever your runtime exposes.
- **The shared canon (Claudinite).** The portable rules your project consumes, vendored **read-only** — as a pinned git **submodule** or a **session-start sync**. "The mounted canon" below means the exact revision your project currently consumes; compare your local docs against *that*, not a live fetch. (Under session-start sync that's the latest `main`, so a lesson promoted earlier this cycle is already visible; under a pinned submodule it's the pin, so the item lands here only once the pointer is bumped — either way you prune only against what the project actually mounts.)

## What it does: prune / rephrase local docs the canon now covers (→ commit to main)

When the canon has **absorbed** a practice a local doc still carries — most often an item [phase 2](promote.md) promoted up and the canon now owns — the local copy is redundant. The routine:

- **Removes** the now-duplicated local item, since the canon is the single source of truth for portable rules.
- **Rephrases / reframes** a local procedure when the canon's wording of the same idea has changed, so the local docs stay consistent with the canon they point at.

**Keep a local item that the canon states too generally for this project.** The canon is deliberately project-agnostic, so its version of a rule is sometimes broader or vaguer than what this project actually needs. When the project's local item carries a **sharper, project-specific** cut of the same idea — a concrete threshold, a named file, a tighter constraint the general canon rule doesn't pin down — that local item is **not** redundant: keep it. Prune only when the canon genuinely covers the local item with **no loss** of the specificity this project relies on. This is the judgment that keeps a project from dissolving its own hard-won specifics into a too-general canon rule.

## Discipline

- **Only remove a local item you can show is genuinely covered by the mounted canon — quote the canon line.** When in doubt, leave it; a wrongful prune deletes a real local lesson.
- **Commit straight to `main`.** The prune/rephrase edits push directly to the project's default branch — no PR. This is an unattended routine editing the project's *own* docs on a capable model; the owner has opted these daily routines into direct-to-main.
- Keep the suite green: if an edit touches a doc a test reads, run the project's offline test suite before pushing.
- **Never edit the read-only canon** — this phase only prunes *local* docs against it.

## Output & tracking

- Edits push to `main` directly; most days there is nothing to prune.
- Log each run that changed a doc as a **dated comment** on this routine's own standing tracking issue (found **by title**, never a hard-coded number; open it if missing, reopen it if it was closed while the routine is still producing output) — naming what local item was pruned and the canon line that now covers it. A quiet day logs nothing.

## The launcher (Claude Code routine)

Keep the routine's config a **thin pointer** to this doc, not an inlined copy — inlined instructions drift against renamed paths and miss conventions the project later adds. This phase is normally dispatched by the fleet orchestrator ([routines/auto-all-repos-maintenance.md](../routines/auto-all-repos-maintenance.md)) **after** phase 2 has run, with a prompt like the following, substituting the target repo and its default branch:

> Run growth phase 3 (dedup against canon) for this repository exactly as specified in `<path/to/growth/dedup.md>`: prune or rephrase local docs the **mounted** canon now covers, **keeping** any local item that carries a sharper, project-specific cut the general canon rule doesn't pin down. Quote the canon line for every prune; when unsure, leave it. Keep the offline test suite green, **commit and push straight to `main`** (no PR), never edit the read-only canon, and log the run — naming what was pruned and the canon line that covers it — on the routine's standing tracking issue (found **by title**). Most days, change nothing.

## Run on a capable model

Proving a local item is genuinely covered by the mounted canon before pruning it — and telling "the canon now owns this" from "the canon states this too generally, keep the local specific version" — is a **judgment call**. A downgraded model prunes a real lesson, and here it commits that loss straight to `main` with no PR to catch it. Run this routine on a capable model.

## What this routine must never do

- **Never edit the read-only canon** — it only prunes *local* docs against it.
- **Never prune a local item without quoting the mounted-canon line that covers it** — when unsure, leave it.
- **Never prune a local item that holds a sharper, project-specific cut** the general canon rule doesn't cover — keep the project's specificity.
- **Never inline this spec into the launcher** — the launcher stays a thin pointer here.
