# Claudinite GitHub procedures (this repo's own upkeep)

How we drive GitHub for **Claudinite's own repo**. Not part of the mounted corpus — consumers follow *their* GitHub-procedures doc, not this one. The portable git/GitHub practices live in [tasks/git-and-github.md](../tasks/git-and-github.md); this file holds only what's specific to this repo, so on an owner command like `LGTM` you read this one short doc and skip rediscovery.

## `LGTM` — merge the change in front of the owner to `main`

Two facts are fixed here — don't go re-deriving them:

- **Squash-merge** via a PR (one commit per PR on `main`).
- **This repo has no CI** (`.github/workflows/` is empty), so there is **no green gate and the twice-green gate never applies** — don't list workflows or wait for checks.

Recipe (~4 calls):

1. Load both GitHub tools in **one** `ToolSearch`: `create_pull_request`, `merge_pull_request`.
2. If no PR is open for the branch, `create_pull_request` (base `main`); end the body with `Closes #<issue>`. Read the PR number off the returned URL.
3. `merge_pull_request`, `merge_method: squash`, title `<subject> (#<pr>)`. Merge directly — **don't** pre-read status; the call fails loudly if it isn't mergeable.
4. Sync local `main`: `git checkout main && git pull origin main`.

Don't:
- **Don't** re-read the issue to confirm it closed — `Closes #<issue>` closes it on merge; trust it.
- **Don't** delete the remote branch (current environment bug — see [always/temporary-workarounds.md](../always/temporary-workarounds.md)). Deleting the *local* branch is fine.
