# Automated daily "optimize procedures" routine

A portable, **project-agnostic** spec for a daily Claude Code routine that is the **only** bridge between a project's local documentation and the shared **canon** of portable rules it consumes (Claudinite — vendored read-only). Everything else — an on-demand "learned lessons" command, the daily lessons digest — writes **only to local docs**; this routine is what reconciles those local docs against the canon in both directions. Any consuming repo that mounts the canon can run it. Like the other daily routines it runs unattended and **most days changes little or nothing** — the steady state is already reconciled, so a forced move is worse than none.

## Conventions used in this doc

- **Default branch.** Below, `main` stands for **your repository's default branch** — substitute whatever your repo uses.
- **GitHub API access.** Opening the PR (direction 1), opening the issue and ensuring its label (direction 2) all go through your environment's GitHub API tooling — the **GitHub MCP tools** or the `gh` CLI. In sandboxed/automation environments the shell often reaches only a **git-over-HTTPS proxy with no GitHub API**; there, use the MCP tools, never `gh` / `curl`. Use whichever your runtime exposes.
- **The shared canon (Claudinite).** The portable rules your project consumes, vendored **read-only** from the Claudinite canon repo — as a pinned git **submodule** or a **session-start sync**. "The pinned canon" below means the exact revision your project currently consumes; compare your local docs against *that*, not a live fetch.
- **The handoff label.** The literal label string your project uses to trigger its up-path Action (see the handoff spec). This routine **ensures it exists** before applying it; the string itself is the project's choice.
- **Local docs.** Your project's own documentation, including any "working-set" docs that deliberately shadow canon practices until the canon absorbs them.

It does two independent things each run; either can be a no-op.

## 1. Pull **down**: prune / rephrase local docs the canon now covers (→ a PR)

The shared canon is vendored read-only and kept current by whatever updates your mount (a submodule-bump PR, or the session-start sync). When the canon has **absorbed** a practice a local doc still carries — most often an item this routine promoted on an earlier run (see direction 2), now merged into the canon and pulled in by an update — the local copy is redundant. The routine:

- **Removes** the now-duplicated local item (typically from a local working-set doc, but any local doc qualifies), since the canon is the single source of truth.
- **Rephrases / reframes** a local procedure when the canon's wording of the same idea has changed, so the local docs stay consistent with the canon they point at.

These edits go out as a single **PR for review** (never an auto-merge). Only remove a local item you can show is genuinely covered by the **currently pinned** canon — quote the canon line. When in doubt, leave it; a wrongful prune loses a real local lesson.

## 2. Push **up**: promote generalizable local items (→ an issue, not a removal)

Scan the local docs for insights that are **portable** — they'd help unseen projects, not just this one (general engineering/agentic practices, portable git/GitHub procedure, a working-discipline or agent-architecture principle) — and that the canon does **not** already cover. Collect all such items and **open one handoff-labelled issue** listing them — each entry a complete, self-contained proposal (the canon repo won't have your project's context) stating the lesson, the shared doc it belongs in, and why it's portable. **One issue, not one per item:** a deterministic hand-off Action copies it to a single issue in the canon repo, where a curation routine dedupes/routes each lesson and opens **one** docs PR for the batch — so many proposals can't collide as separate same-doc PRs that conflict on merge. The curator is the real filter (it confirms and dedupes against the whole corpus), so **propose broadly and let it choose** rather than pre-filtering hard here.

**Do not remove the promoted item from the local docs now.** Promotion is a *proposal*; the canon may reject or reword it. Removal happens **later**, on the day direction 1 sees the item actually land in the canon (after the canon PR merges and an update pulls it in). So a promoted-but-not-yet-accepted item keeps working locally in the meantime, and a rejected one simply stays local.

Before applying the handoff label, **ensure it exists idempotently** (create-if-missing, no-op if present) — so the routine never needs the label pre-created and never errors on a re-run.

## Discipline

- Be conservative in **both** directions: a forced promotion spams the canon repo, a wrongful prune deletes a real lesson. Most days, few or no items qualify.
- Keep the suite green: if a PR edits a doc a test reads, run the project's offline test suite before pushing.
- Compare local docs against the **currently pinned** canon, not a live fetch — the pin is what the project actually consumes.
- **Never edit the read-only canon, and never merge anything** itself.

## Output & tracking

- Direction 1 produces a **PR** on a dated branch with a random suffix (the suffix keeps two same-day runs from colliding); direction 2 produces **one bundled issue**. Never a merge.
- Log each run that produced a PR or an issue as a **dated comment** on this routine's own standing tracking issue (found **by title**, never a hard-coded number; open it if missing, reopen it if it was closed while the routine is still producing output). A quiet day logs nothing.

## The launcher (Claude Code routine)

Keep the routine's config a **thin pointer** to this doc, not an inlined copy — inlined instructions drift against renamed paths and miss conventions the project later adds. Vendor this file somewhere in your repo (e.g. under a `docs/` or `routines/` path of your choosing), then paste a prompt like the following into your daily routine, substituting the path and your default branch:

> Run the daily "optimize procedures" routine for this repository exactly as specified in `<path/to/auto-optimize-procedures.md>`: reconcile the local docs against the **currently pinned** shared canon in both directions — open a PR that prunes/rephrases local docs the canon now covers, and open **one** bundled handoff-labelled issue listing every generalizable local item not yet in the canon, **without** removing them locally. Follow that doc's discipline, keep the offline test suite green, log the run on the routine's standing tracking issue (found **by title**), never edit the read-only canon, and **never merge anything.**

Schedule it daily in your scheduler (the Claude Code Routines UI, a cron, or a CI nightly trigger). The repo can't schedule itself, so this doc is the spec and the routine is the trigger.

## Run on a capable model

Both directions are **judgment calls** — proving a local item is genuinely covered by the pinned canon before pruning it, and deciding which local items are portable enough to promote. A downgraded model prunes a real lesson or floods the canon repo with non-portable proposals. Run this routine on a capable model.

## What this routine must never do

- **Never merge anything**, and **never edit the read-only canon** — direction 1 is a PR, direction 2 is an issue.
- **Never prune a local item without quoting the pinned-canon line that covers it** — when unsure, leave it.
- **Never remove a just-promoted local item** — removal waits until the canon actually absorbs it.
- **Never inline this spec into the launcher** — the launcher stays a thin pointer here.
