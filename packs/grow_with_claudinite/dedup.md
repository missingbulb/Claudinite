# Growth — dedup local docs against the canon (per member)

The [growth lifecycle](../canon-curation/README.md)'s pruning stage, this pack's daily task: reconcile a project's local docs against the shared **canon** it consumes (Claudinite, vendored read-only), pruning local items the canon now covers. It opens a PR against the project's default branch for the owner to approve. Often there's nothing to prune, and that's fine.

> This routine only prunes local docs against the canon; lifting local items up into the canon is [promote](../canon-curation/promote.md)'s job.

## Conventions used in this doc

- **Default branch.** `main` stands for **your repository's default branch** — substitute whatever your repo uses.
- **GitHub access is MCP-native.** Updating the tracking issue goes through the session's **GitHub MCP tools** (`mcp__github__*`). The fleet run has no shell GitHub access — the shell reaches only a git-over-HTTPS proxy scoped to one repo, with no REST credential — so never reach for `gh`/`curl` or a cross-repo clone.
- **The mounted canon.** The exact canon revision your project currently consumes — compare against *that*, not a live fetch. Under session-start sync it's the latest `main` (so a promotion is visible only once its PR is merged, not the moment promote opens it); under a pinned submodule it's the pin (so the item lands here only once the pointer is bumped). Either way you prune only against what the project actually mounts.
- **The project's local docs.** The set identified in [this pack's README](README.md#identifying-a-projects-local-docs). That's the corpus this routine prunes within; the mounted canon is never a prune target, only the yardstick you prune *against*.

## What it does: prune / rephrase local docs the canon now covers

When the canon has **absorbed** a practice a local doc still carries — most often an item [promote](../canon-curation/promote.md) lifted up and the canon now owns — the local copy is redundant. This routine:

- **Removes** the now-duplicated local item, since the canon is the single source of truth for portable rules.
- **Rephrases** a local procedure when the canon's wording of the same idea has changed, so the local docs stay consistent with the canon they point at.

**Keep a local item only if it says *more* than the canon — not merely says it more specifically.** Every local item is more specific than the canon, so specificity alone is never the test. Distinguish two cases:

- **The general rule in local dress** — it makes the canon's point but leans on this project's classes, files, or names to make it. Once the canon covers the point, those names were only illustration: prune it.
- **A stronger point about a narrower case** — it asserts something the canon's general rule leaves out: a tighter constraint, a sharper claim that holds for this project's narrower situation. Keep it.

So ask not "is it specific" (it always is) but "does it only lean on specific names to make the general point, or does it make a point the canon doesn't?" Prune the first; keep the second.

## A canon check covers an item too — and more strongly than prose

The canon carries rules as **conformance checks**, not only prose. A local item is covered when a canon check *enforces* it — stronger coverage than a stated line, since the rule runs on every session and CI pass. Consult the machine-readable rule catalog (`node .claudinite/checks/run.mjs --list`: id, severity, description, doc pointer) alongside the prose corpus, and when a check covers the item, **quote the rule id** where you'd otherwise quote a canon line. The keep-test below is unchanged: a local item that says *more* than the check detects (a stronger point about a narrower case) stays.

## Discipline

- **Only remove a local item you can show the mounted canon genuinely covers — quote the canon line (or the covering check's rule id).** When unsure, leave it; a wrongful prune deletes a real local lesson.
- **Open a single PR against `main`** from a per-run-unique branch (see [the git-github-advanced skill](../../skills/git-github-advanced/SKILL.md)) — one PR for the whole run's prunes, not one per item — never a direct push. This is an unattended routine, on a capable model, and a **wrongful prune deletes a real local lesson**, so — unlike [extract](extract.md), which commits its additive edits straight to `main` — this routine keeps a human approval gate.
- If an edit touches something a test reads, run the project's offline test suite and keep it green before pushing.

## Tracking

Log each run that changed a doc as a **dated comment** on this routine's standing tracking issue (found **by title**, never a hard-coded number; open it if missing, reopen it if it was closed while runs still need logging) — naming what was pruned and the canon line that now covers it. A run that prunes nothing logs nothing.

## Run on a capable model

Proving the mounted canon genuinely covers a local item before pruning it — and telling "the canon now owns this" from "the canon states this too generally, keep the local cut" — is a **judgment call**. A downgraded model prunes a real lesson; the review PR is a backstop, but a wrongful prune is easy to wave through in review, so don't lean on it. Run this routine on a capable model.

## What this routine must never do

- **Never edit the read-only canon** — it only prunes *local* docs against it.
- **Never prune a local item without quoting the mounted-canon line that covers it** — when unsure, leave it.
- **Never prune a local item that makes a stronger point about a narrower case** than the canon — that isn't redundancy. (A local item that only restates the canon in project-specific names *is* prunable once the canon covers the point.)
