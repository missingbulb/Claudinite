# Growth phase 3 — dedup local docs against the canon (per project)

Phase 3 of the [growth lifecycle](README.md): reconcile a project's local docs against the shared **canon** it consumes (Claudinite, vendored read-only), pruning local items the canon now covers. It runs after promotion has updated the canon, and commits to the project's default branch. Often there's nothing to prune, and that's fine.

> This phase only prunes local docs against the canon; lifting local items up into the canon is [promote](promote.md)'s job.

## Conventions used in this doc

- **Default branch.** `main` stands for **your repository's default branch** — substitute whatever your repo uses.
- **GitHub API access.** Updating the tracking issue goes through your environment's GitHub API tooling — the **GitHub MCP tools** or the `gh` CLI. In sandboxed/automation environments the shell often reaches only a **git-over-HTTPS proxy with no GitHub API**; there, use the MCP tools, never `gh` / `curl`. Use whichever your runtime exposes.
- **The mounted canon.** The exact canon revision your project currently consumes — compare against *that*, not a live fetch. Under session-start sync it's the latest `main` (so a lesson promoted earlier this cycle is already visible); under a pinned submodule it's the pin (so the item lands here only once the pointer is bumped). Either way you prune only against what the project actually mounts.
- **The project's local docs.** The set identified in [growth/README.md](README.md). That's the corpus this phase prunes within; the mounted canon is never a prune target, only the yardstick you prune *against*.

## What it does: prune / rephrase local docs the canon now covers

When the canon has **absorbed** a practice a local doc still carries — most often an item [promote](promote.md) lifted up and the canon now owns — the local copy is redundant. This phase:

- **Removes** the now-duplicated local item, since the canon is the single source of truth for portable rules.
- **Rephrases** a local procedure when the canon's wording of the same idea has changed, so the local docs stay consistent with the canon they point at.

**Keep a local item the canon states too generally for this project.** The canon is deliberately project-agnostic, so its version of a rule is sometimes broader than what this project needs. When the local item carries a **sharper, project-specific** cut — a concrete threshold, a named file, a tighter constraint the general rule doesn't pin down — it isn't redundant: keep it. Prune only when the canon covers the local item with **no loss** of the specificity this project relies on. This is what keeps a project from dissolving its own hard-won specifics into a too-general canon rule.

## Discipline

- **Only remove a local item you can show the mounted canon genuinely covers — quote the canon line.** When unsure, leave it; a wrongful prune deletes a real local lesson.
- **Commit to `main` directly** — no PR. This is an unattended routine, on a capable model, editing the project's *own* docs; the owner has opted these daily routines into direct-to-main.
- If an edit touches something a test reads, run the project's offline test suite and keep it green before pushing.

## Tracking

Log each run that changed a doc as a **dated comment** on this routine's standing tracking issue (found **by title**, never a hard-coded number; open it if missing, reopen it if it was closed while runs still need logging) — naming what was pruned and the canon line that now covers it. A run that prunes nothing logs nothing.

## Run on a capable model

Proving the mounted canon genuinely covers a local item before pruning it — and telling "the canon now owns this" from "the canon states this too generally, keep the local cut" — is a **judgment call**. A downgraded model prunes a real lesson, and here it commits that loss straight to `main` with no PR to catch it. Run this routine on a capable model.

## What this routine must never do

- **Never edit the read-only canon** — it only prunes *local* docs against it.
- **Never prune a local item without quoting the mounted-canon line that covers it** — when unsure, leave it.
- **Never prune a local item that holds a sharper, project-specific cut** the general canon rule doesn't cover — keep the project's specificity.
