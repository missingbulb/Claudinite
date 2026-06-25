# Portable git & GitHub procedures

The project-agnostic half of how we drive GitHub: the issue → branch → PR
lifecycle, the branch/commit-history rules for PR work, the CI-trigger rules, and
how we keep merge-conflict churn cheap across parallel branches. Project-specific
GitHub procedures (the merge-to-main command, when to open a PR early, the
merge-cheaply poll loop tuned to the local environment, and the generated-file
merge rules) live in the consuming repo's own GitHub-procedures doc.

## The task lifecycle

For every new task:

1. Create a GitHub issue describing the task before starting work.
2. Develop on a branch; reference that issue number in commit messages (e.g.
   `Refs #123`, `Fixes #123`, or `Closes #123`).
3. Update the issue's status (comments / close) as work progresses and when it's
   done.

## Branch and commit history

### Commit often, in layers

While working a branch, commit frequently rather than landing one big commit at
the end — small, ordered commits let the owner follow the work as it develops.
Use commits to *layer* the work in the order you'd want it reviewed:

- Write the failing test(s) first, commit them, **then** implement the feature —
  so the history shows the contract before the code that satisfies it (and you've
  seen the test fail before trusting it, per
  [engineeringPractices.md](engineeringPractices.md)).
- Keep any documentation update as its own commit *after* the feature, not folded
  into it.

There's no cost to a branch carrying many commits when the project uses a
**squash** merge to `main` (one commit per PR): the squash collapses them into a
single commit on `main`, so `main`'s one-commit-per-PR history is unaffected no
matter how granularly the branch is committed.

- Don't rewrite published/shared history to satisfy a tooling or authorship
  check (e.g. a hook flagging "unverified" commits): only amend your own
  un-pushed branch commits. Commits already on a shared branch — including ones
  merged in from `main` — belong to that history; reset-authoring or rebasing
  them forks your branch away from it.
- After your commit is **squash-merged** to `main`, a *reused* feature branch
  still carries that original commit (the squash created a *new* commit on
  `main`, so the branch's own is unreachable from it) — and the next PR off the
  branch re-includes it in the diff, because the three-dot merge-base predates
  the squash. Sync the branch to `origin/main` before opening the next PR
  (`git rebase origin/main`, which drops the commit as an already-applied
  cherry-pick, or a hard reset): it's your own un-merged branch, so this is the
  amend-your-own-commits case above, not rewriting shared history.
  - **`git rebase origin/main` only drops the old commit cleanly when the branch
    carried a *single* squash-merged commit.** When it carried *several* commits
    that `main` squashed into *one* (then kept developing), git can't match them
    to the squash as already-applied, so it replays them and conflicts mid-rebase.
    Replant only the genuinely-new commits instead: `git rebase --onto
    origin/main <last-squash-merged-commit>` (then `git push --force-with-lease`).
    If the new work is small, a `git reset --hard origin/main` + redo beats
    fighting the replay.
  - **If the merge auto-deleted the remote branch, start follow-up work on a new branch off `origin/main`** rather than reusing the old name — it has no stale tracking ref and no rebase dance. If you do reuse the old name: `--force-with-lease` actively *fails* — `git push --force-with-lease` rejects with `stale info` then `couldn't find remote ref <branch>` because the lease expects a remote branch that no longer exists. There's nothing to overwrite, so `git fetch --prune` (drop the stale tracking ref) then a plain `git push -u origin <branch>` just recreates it.

## In a squash-merge repo, "commits ahead of main" does not mean "unmerged"

A squash-merge creates a new commit on `main` that the branch's own commits are
unreachable from, so a branch whose work has already landed still shows ahead by
N. **"Ahead by N" never alone means unmerged.** Determine real status by
content, not raw count:

1. **PR state** — a merged PR means the work is in `main`; safe to delete
   however many commits show ahead.
2. **Content diff** — `git diff --stat main..branch`: if everything the branch
   adds is already in `main`, the work landed (catches a squash with no
   surviving PR).
3. **Superseded elsewhere** — the branch's work may have landed in `main` under
   a *different path or form* (a doc distilled into another, a feature
   re-implemented), so a file/line diff still shows its additions as branch-side
   and it reads as unmerged. Before concluding so, check whether its *intent*
   already exists in `main` — grep for the concept, not just the exact path.
4. **No merge-base** — `git merge-base` fails when a force-push rewrote `main`
   and orphaned the branch; can't be proven in or out mechanically; needs human
   review, never an automatic delete.
5. Otherwise — genuine unmerged work.

## A push or PR made with the Actions `GITHUB_TOKEN` does not start another workflow

GitHub suppresses workflow runs triggered by the built-in `GITHUB_TOKEN` to
prevent recursion, so a workflow's own `git push` or `gh pr create` won't fire
another workflow (e.g. a `test` or cache-refresh workflow). The one exception is
`workflow_dispatch` / `repository_dispatch` — which is why an automation pipeline
that needs the downstream checks to run must dispatch them explicitly. A run
dispatched against a branch executes on its head commit, so its checks still
attach to the PR.

## An automated job needs a unique branch per run

An automated or scheduled job that derives its branch name from a non-unique key
(e.g. the date) collides with itself on a repeat run for that key — `git
checkout -b` fails when the branch already exists, and a push to the diverged
remote branch is rejected non-fast-forward (so the run can't even open its PR).
Give every run its own branch: append a per-run-unique suffix (`$RANDOM` / a
short token) to the readable prefix.

## A workflow that adds a brand-new label must create it first

`gh issue edit --add-label "<name>"` fails when the label doesn't exist yet —
unlike applying an already-defined label, GitHub won't create it on demand, so a
workflow that introduces a new label breaks the first time it runs. Create it
idempotently before the edit (`gh label create "<name>" --color … 2>/dev/null ||
true`), then `--add-label`.

## A CI job that reads submodule files must fetch submodules in its checkout

`actions/checkout` does **not** fetch submodules by default — the submodule directory is an empty folder in CI unless you pass `submodules: true` (or `recurse-submodules: true`). Without it, any gate that reads submodule content passes vacuously: the check is a no-op, not a signal. Add the flag to every CI job whose tests read submodule content.

## Mark large committed fixtures `linguist-vendored` to fix language stats

Large committed fixture files (full-page HTML, generated data dumps) can dwarf
actual source by byte count and cause GitHub to mislabel the repo's primary
language. Add a `.gitattributes` entry for each such path (e.g.
`test/fixtures/*.html linguist-vendored`) to tell Linguist to ignore it; apply
the same annotation whenever you add another large generated or fixture file.

## Renaming a directory that houses a submodule

`git mv` on a directory containing a submodule rewrites `.gitmodules` and the
index correctly but leaves `.git/config` stale — its old
`[submodule "<old/path>"]` entry lingers, so any operation that consults
`.git/config` (submodule status, checkout) sees the old path until you fix it.
Run `git submodule sync && git submodule update --init` after the move to
propagate the new path and re-register the submodule.

## GitHub Markdown inside a `<td>` requires surrounding blank lines

In a GitHub-rendered Markdown file, cmark-gfm re-enters Markdown mode inside a
raw `<td>` only when blank lines surround the cell's content — without them the
cell is treated as a raw HTML block and its content is shown verbatim (no
`![img]()`, no `**bold**`, no links). GitHub's sanitizer strips `style` / CSS,
so a flexbox two-column layout won't render; use a plain `<table>` with
`align` / `valign` / `width` instead. GFM pipe-table cells can't hold
multi-line prose — use the raw-`<table>` form when a cell needs it. A leading
inline `<!-- … -->` comment also opens an HTML block, so keep any such marker as
the *last* token on the line, leaving the line to *start* as Markdown.

## Merging gotchas

These conflict/merge traps are independent of any one project's file layout.

### Merging across a file relocation

git's rename detection re-applies your content edits onto the moved files, but it
does *not* fix *references* to the moved paths — an npm script, a `.gitattributes`
glob, or a doc link naming the old location keeps pointing there and breaks with
no conflict (a green local test on the old layout won't catch it either). After
such a merge, grep the files your branch touched for the old paths.

### Merging in content that predates a branch-wide invariant

When your branch establishes a cross-cutting invariant — a renamed term, a
"mentioned only in X" containment rule — a branch you merge in that *predates* it
can silently reintroduce violations: its independent additions (a new file, a new
section) auto-merge clean, no conflict, while still using the old form. Resolving
the marked conflicts isn't enough. Re-run the check that *defines* the invariant
(the grep) over the whole tree after the merge, not just the conflicted files.

### Porting old work forward across a changed invariant

The converse direction: when you re-implement or cherry-pick an *older* change
onto current `main`, check each part against the invariants `main` has added
since — not just whether it still applies. A part that violates a now-enforced
guarantee becomes a **silent no-op** if taken verbatim (e.g. a guard that reverts
any write outside an allowed set leaves the patch landed but doing nothing), so
drop or redesign it rather than copy it.
