# Automated nightly open-branch status report

A portable, **project-agnostic** spec for a nightly Claude Code routine that reports every open branch's status against the repository's default branch and which branches are safe to delete — the scheduled version of a manual branch audit. Any consuming repo can run it: it makes **no assumptions about a particular project's files, docs, or services**.

The routine is **read-only on the repo**: it never pushes, deletes, or merges anything. Its only writes are a comment on its standing tracking issue when the branch picture has changed, and **opening or closing** that issue to mirror whether the latest report lists any branch that's safe to delete (open when there's cleanup pending, closed when there isn't). It stays **silent when nothing moved** — an unchanged night posts no comment.

## Conventions used in this doc

- **Default branch.** Below, `main` stands for **your repository's default branch** — substitute `master`, `trunk`, `develop`, or whatever your repo uses, in both the prose and the git commands.
- **GitHub API access.** PR lookups must go through your environment's GitHub API tooling — the **GitHub MCP tools** (`list_pull_requests` / `search_pull_requests`) or the `gh` CLI. In sandboxed/automation environments the shell often reaches only a **git-over-HTTPS proxy with no GitHub API**; in that case use the MCP tools, never `gh`/`curl`, which will fail or hang. Pick whichever your runtime actually exposes and use it consistently.

## What it reports

For every remote branch except the default branch:

- **commits ahead** of `main` (`git rev-list --count origin/main..origin/<b>`);
- **real status**, squash-aware (the crux — see below);
- **open PR**, if any — via the GitHub API tooling described above;
- **safe to delete?** — yes only when the branch's content is already in `main`.

And for every branch with commits ahead that is **not** already merged, a 1–3 sentence **description of the changes** it carries (from its commit subjects/bodies and diffstat) — so the table is actionable without checking out each branch.

## The crux: raw "commits ahead" is misleading — be squash-aware

Many repos **squash-merge** PRs (one commit on `main` per PR). When they do, a branch whose work has already landed *still* shows its original commits as "ahead" of `main`: the squash created a new commit the branch's own commits are unreachable from. So **"ahead by N" never, by itself, means "unmerged."** This holds whenever history diverges — squash-merge, rebase-merge, or an amended landing — so decide the real status by what the branch's *content* does against `main`, not by the commit count:

1. **PR state — authoritative for merged.** Via the GitHub API tooling, find the branch's PR. A **merged** PR ⇒ the work is in `main` ⇒ *safe to delete*, however many commits show ahead.
2. **Content vs. `main` — catches a squash with no PR, and stale branches.** Two-dot `git diff --stat origin/main..origin/<b>`: if everything the branch adds is already present in `main` (its new files/lines don't show up as branch-side additions), it's merged-or-stale ⇒ *safe to delete*. Spot-check the branch's signature files with `git cat-file -e origin/main:<path>`.
3. **Superseded-elsewhere — content absorbed into `main` in a different form.** A branch can be obsolete even when step 1 finds no merged PR and step 2 still shows its files as branch-side additions: its *work* may have landed in `main` under a **different path or form** — a doc distilled into another doc, a feature re-implemented elsewhere, a fix folded into a canonical file — so a pure file/line diff never matches and the branch reads as "unmerged." Before concluding a branch is unmerged work (step 5), ask whether its **intent** already exists in `main`: take the branch's signature change (the file it adds, the capability it documents) and look for that same intent in `main` — `git cat-file -e origin/main:<path>` for the exact file, then `git grep` / `git show origin/main:<file>` for the *concept* if the path differs. If `main` already carries the work in any form (and any code/config it depends on has shipped), the branch is **superseded** ⇒ *safe to delete* — note in Details where the content now lives. This is a content/judgment read, not a mechanical diff; all of it is **nondestructive** — reads against `origin/main` only, never a pull/merge into the working tree. (Illustrative pattern: a branch adding a standalone document whose guidance was later distilled into a different canonical document on `main`, with any hook/code it referenced already shipped — invisible to step 2, caught here.)
4. **No common ancestor ⇒ orphaned.** If `git merge-base origin/main origin/<b>` fails, `main`'s history was rewritten out from under the branch (a force-push). Flag it **orphaned (pre-rewrite)**: its commits can't be mechanically proven in or out of `main`, so report it as *needs a human eye* — never an automatic safe-to-delete.
5. Otherwise the branch has genuine commits/content not in `main` ⇒ **unmerged work** — *do not delete*; describe what it carries.

Start each run with `git fetch origin --prune` so the view is current (note any branch the prune removed).

## Report format

A Markdown table, most-recent-activity first:

| Branch | Last commit (date) | Ahead | PR | Status | Safe to delete? |

`Status` ∈ `merged/stale` · `superseded` · `unmerged work` · `orphaned (pre-rewrite)`. Below the table, a **Details** subsection: one short paragraph per branch with commits ahead that isn't merged, describing its changes — and for a `superseded` branch, where in `main` its content now lives. End with a one-line recommendation of which branches are safe to delete.

## Where it posts

The report lands on a standing tracking issue. **Find it by title, never by a hard-coded number** (a bare number can dangle, and the number differs per repo). A suggested title is **`Open Branches Cleanup Tracker`** — pick one and keep it stable so the routine can find it run to run; **if no such issue exists, open one.** The issue is a **cleanup tracker, and its open/closed state mirrors whether there is cleanup pending** — i.e. whether the latest report lists **any** branch that's safe to delete.

So each run makes two independent decisions: whether to **post a comment** (by what changed), and what the issue's **open/closed state** should be (by whether anything is safe to delete on the report it just produced).

First the comment, so the issue stays a signal rather than a daily wall of identical tables — read the most recent comment on the issue to compare against:

- **No branches other than `main`** → **don't comment**. There's nothing to track (but still apply the close rule below).
- **This run's report is substantially identical to the last one posted** (same set of branches, and same status + safe-to-delete for each) → **don't comment**.
- **The report changed** (a branch appeared or was pruned, or any branch's status or safe-to-delete flipped) → **post it** as a new dated comment, so the issue accumulates a scrollable history.

Then set the issue state from **the latest report** (the comment just posted, or the most recent existing one when this run didn't comment):

- **The latest report lists ≥1 branch that's safe to delete** → the issue should be **open**: reopen it if it was closed. There's cleanup pending, so the tracker stays open until it's done.
- **The latest report lists no safe-to-delete branch** (including the "no branches other than `main`" case) → **close** the issue. Nothing is awaiting cleanup, so the tracker rests closed; the next run that finds a safe-to-delete branch reopens it. (A branch flagged **orphaned (pre-rewrite)** *needs a human eye* and is not "safe to delete", so it alone does not keep the issue open.)

## The launcher (Claude Code routine)

Keep the routine's config a **thin pointer** to this doc, not an inlined copy — inlined instructions drift against renamed paths and miss conventions the repo later adds. Vendor this file somewhere in your repo (e.g. under a `docs/` or `routines/` path of your choosing), then paste a prompt like the following into your nightly routine, substituting the path where you placed it and your default branch name:

> Run the nightly open-branch status report for this repository exactly as specified in `<path/to/auto-branch-report.md>`: analyze every open branch's status against the default branch (squash-aware, per that doc), then post to the routine's standing tracking issue (found **by title**, per that doc) only per that doc's rules — comment when the branch picture changed and stay silent when it didn't, and set the issue's open/closed state to mirror the latest report: open it when the report lists any branch that's safe to delete, close it when none is (including when no branches but the default exist). You are read-only on the repo — never push, delete, or merge.

Schedule it nightly in your scheduler (the Claude Code Routines UI, a cron, or a CI nightly trigger). The repo can't schedule itself, so this doc is the spec and the routine is the trigger.

## Run on a capable model

Steps 2–3 (squash detection and superseded-elsewhere) are **judgment calls**, not mechanical diffs — a downgraded model will mislabel a superseded branch as unmerged work, or worse, call genuine unmerged work safe to delete. Run this routine on a capable model.

## What this routine must never do

- **Never push, delete, or merge** anything — it is read-only on the repo. Its only writes are comments on, and the open/closed state of, its own tracking issue.
- **Never call a branch safe to delete on commit count alone** — "ahead by N" is not "unmerged"; prove the content is in `main` first.
- **Never auto-flag an `orphaned (pre-rewrite)` branch safe to delete** — it needs a human eye.
- **Never post when nothing changed** — silent nights post no comment.
- **Never inline this spec into the launcher** — the launcher stays a thin pointer here.
