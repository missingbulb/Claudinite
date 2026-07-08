# Automated repo tidy-up

Nightly, project-agnostic routine. Review open **PRs**, **branches**, and **issues**; keep what's live, clear what's done. **Act on issues** (close / label / comment). **Assess PRs and branches only** — never act on them; they may be work in progress. Any repo can vendor it; it assumes nothing project-specific.

`main` = your default branch. Use your environment's GitHub tooling (MCP tools or `gh`; in a git-proxy-only sandbox use MCP, never `curl`). Run on a **capable model** — relevance is a judgment call. Begin every run with `git fetch origin --prune`.

## Landed-status test — for PRs and branches

Squash-merge makes "commits ahead" meaningless; judge by content:

1. Merged PR ⇒ in `main`.
2. `git diff --stat origin/main..origin/<ref>` empty ⇒ already in `main` (stale).
3. Intent present in `main` under another path/form ⇒ superseded (grep the concept, not the filename).
4. `git merge-base origin/main origin/<ref>` fails ⇒ orphaned; needs a human — never auto-anything.
5. Else ⇒ genuine unmerged work.

Read status and description from commits + diff, **never the ref's name** (auto-generated or repurposed).

## PRs — assess only, never act

List **only PRs that should stay open**, one line each: `#N — why it's live`. Collapse the rest into one line: `Closeable: #a, #b — merged/superseded/stale`. Recommend closes; never close a PR.

## Branches — assess only, never act

Run the landed-status test. List **only branches with genuine unmerged work**, one line each: `` `branch` — what it carries``. Collapse the rest into one line: `Safe to delete: N — a, b, c`. No per-branch detail. Never delete, push, or merge.

## Issues — act

Per open issue, take the **first** that applies:

- Already implemented in `main` → **close** (`completed`) + one-line comment citing where it landed.
- Conflicts with a current guideline → label `needs-decision` + comment naming the conflict.
- Blocked by another issue → label `blocked` + comment `blocked by #N`.
- Small and quick to do → label `quick-win` + comment scoping it.
- Else → leave it.

Create a label if it's missing. **"Implemented in `main`" = the issue's actual ask is true of `main`'s content now** — confirm by finding it there and cite it, never infer it from a linked PR merging or the issue merely looking done. Can't point to it ⇒ comment, don't close.

## Report

One standing tracker issue, found **by title** `Repo Tidy Tracker` (open one if absent; reopen it if it was closed while anything still needs tracking). Never a fresh issue per run, never a bare number that can dangle. Each run touches it two ways:

- **Rewrite the issue body** to **today's current state**, dated at the top, so the newest snapshot is always what you see first when you open the issue — PR keepers, branch keepers + safe-to-delete count, and the issue actions in force. The body is the live picture; it replaces yesterday's, it doesn't accumulate.
- **Add a dated comment** with today's status, so the body's snapshots leave a per-run trail in the thread you can scroll back through.

Keep it short in both places. Keep the tracker **open** while any PR/branch is closeable or any issue awaits a decision; else close it (the body still shows the final clean state).

## Launcher

Vendor this file; point the nightly routine at it:

> Run the repo tidy-up exactly per `<path/to/auto-repo-tidy.md>`: assess open PRs and branches read-only (report only what should stay open, plus a safe-to-delete/closeable summary); act on open issues (close/label/comment per the doc); then update the standing tracker (by title) — rewrite its body to today's current state, dated at the top, and add a dated status comment. Never push, delete, merge, or close a PR or branch.

Schedule it nightly.

## Never

- Act on a **PR or branch** — assess only.
- Close an issue whose done-ness isn't verifiable in `main`.
- Call a branch safe to delete on commit count alone — prove the content is in `main`.
- Auto-touch an orphaned (pre-rewrite) branch — human eye.
- Open a second tracker, or a fresh tracker per run — one standing issue, found by title, body kept current.
