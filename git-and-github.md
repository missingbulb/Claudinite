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
  - **If the merge auto-deleted the remote branch, the resync push needs no
    force — `--force-with-lease` actively *fails*.** Reusing the same local
    branch name after its PR merged, `git push --force-with-lease` rejects with
    `stale info` then `couldn't find remote ref <branch>`: the lease expects a
    remote branch that no longer exists. There's nothing to overwrite, so `git
    fetch --prune` (drop the stale tracking ref) then a plain `git push -u origin
    <branch>` just recreates it.

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

## Issue-form URL prefilling works only for text fields

A GitHub issue form's `input` and `textarea` fields can be pre-seeded via URL query params (`?field-id=value`), but `dropdown` and `checkboxes` fields silently ignore the param with no error. When a deep link must seed a value into an issue form (e.g., a "report this" link), make that field a plain text input, even if a dropdown or checkboxes control would otherwise be preferable.

## A workflow that adds a brand-new label must create it first

`gh issue edit --add-label "<name>"` fails when the label doesn't exist yet —
unlike applying an already-defined label, GitHub won't create it on demand, so a
workflow that introduces a new label breaks the first time it runs. Create it
idempotently before the edit (`gh label create "<name>" --color … 2>/dev/null ||
true`), then `--add-label`.

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
