---
name: github-pages-pipeline
description: Wiring, changing or debugging the vendored GitHub Pages release pipeline in a site repo — which files to vendor, the one-time repository settings, and the two dispatches it answers to. Use when setting a Pages repo up, when a gp/ check fires, when a release run fails, or when asked to "bump version" on one.
metadata:
  force-load-on-file-edits-paths:
    - ".github/workflows/github-pages-*.yml"
---

# The GitHub Pages release pipeline

Four workflows, vendored from [`stubs/workflows/`](../../stubs/) into the repo's own `.github/`
because GitHub resolves a reusable workflow only from there. They are **managed copies**: fix the
pack and re-vendor, never the copy. Everything repo-specific is read from `.github/site.config`,
which the static-website pack owns along with the composite actions these workflows call and the
PR gate that checks them.

## Wiring it into a repo

1. The static-website half first — that pack's skill owns `site.config`, the version scheme and
   the composite actions. Nothing here works without it.
2. Declare `github-pages`, re-vendor, and copy all four `stubs/workflows/` files into `.github/`.
   There are no tokens to replace.
3. File the pack's `adoptionHandover` steps as an issue — three repository *settings* nothing in
   the repo can set. Until they are on, the first run fails and opens a `workflow-failure` issue.
4. `gp/pages-workflows` is the checklist for whether the wiring is complete.

## Driving it

| You want | Do |
|---|---|
| ship a change | raise the version in the same PR and merge. It releases and redeploys on its own. |
| **"bump version"** | dispatch **Release to GitHub Pages** with `bump: major` — the generation statement, the one version this pipeline writes. |
| redeploy unchanged | same dispatch with `force: true`. Redeploys the existing tag rather than cutting a second one. |
| a failed run | read the `workflow-failure` issue it opened. Nothing before the tag changes anything, so the next push releases from there with nothing to unwind. |

## Two things that surprise people

- **The pipeline writes no version of its own** (except a `bump: major`). It releases whatever it
  finds on the default branch and no-ops on a version already released, so a published change that
  forgot its bump is never released at all — which is why `sw/version-bumped` fails it on the PR.
- **The `bump: major` push uses `GITHUB_TOKEN`, which fires no workflow.** That is why the
  orchestrator runs the release explicitly after the bump instead of relying on its own push
  trigger, and why the push cannot loop.
