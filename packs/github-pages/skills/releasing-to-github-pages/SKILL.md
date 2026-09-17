---
name: releasing-to-github-pages
description: The GitHub Pages half of our static-site standard — release on push, the Release it cuts, the Pages deploy of that exact commit, the vendored workflows, the "bump version" dispatch, and the one-time repository settings. Use when setting up a Pages-served repo, changing or debugging its release pipeline, when asked to "bump version" on one, or when a gp/ check fires.
metadata:
  force-load-on-file-edits-paths:
    - ".github/workflows/github-pages-*.yml"
---

# Releasing a site to GitHub Pages

Every Pages-served site repo of ours ships the **same** pipeline: same workflows, same triggers,
same release flow — so set a new repo up against that contract rather than authoring its pipeline,
and turn on by hand only the GitHub settings the automation cannot.

**What this pack does not own.** The version scheme, `.github/site.config`, the publish set and the
three composite actions these workflows run are the **static-website** pack's, because they are true
of a static site whatever serves it — see
[shipping-a-static-site](../../../static-website/skills/shipping-a-static-site/SKILL.md). This pack
requires it, so a Pages repo carries both vendored sets. Everything below assumes that half is
already in place, and every repo-specific value comes from `.github/site.config`.

The workflow **logic** is authored once, in this pack's [`stubs/`](../../stubs/) — the
[orchestrator](../../stubs/workflows/github-pages-release.yml) and three `workflow_call`-only
**reusable workflows** ([publish](../../stubs/workflows/github-pages-publish.yml),
[deploy](../../stubs/workflows/github-pages-deploy.yml),
[bump](../../stubs/workflows/github-pages-bump-version.yml)) — and **vendored into each site repo's
own `.github/`**, where the whole pipeline runs with no cross-repo dependency. GitHub resolves a
reusable workflow or a composite action only from a repo's own `.github/`, never from the shared
mount, so "the logic lives in the pack" means the pack holds the templates and each repo hosts a
*managed* copy: edit the pack, not the copy. Every vendored file is copy-verbatim across repos.

## The workflows

**One orchestrator per repo** — [`github-pages-release.yml`](../../stubs/workflows/github-pages-release.yml),
named exactly `Release to GitHub Pages`. It owns only the triggers (push to `main`, plus a
`workflow_dispatch` with `bump` and `force`) and calls the local publish reusable, which runs:

| Stage | What it does |
|---|---|
| `check` | is a release due? The version on `main` has no release of its own yet — or `force`. Asking the **release list** for the current version (rather than diffing files against a tag) is what makes the flow idempotent: a failed run retries on the next push with nothing to undo, and a push carrying an already-released version is a clean no-op. |
| `verify` | the repo's `test_command`, on the tree being released — **before** anything is tagged or deployed. |
| `release` | GitHub Release `v<major>.<ymmdd>.<n>` at that tree, auto-generated notes. |
| `deploy` | the Pages deploy of that exact commit, from the explicit publish set. |
| `report-failure` | any failure above opens a fresh `workflow-failure` issue and closes earlier open ones for this workflow as duplicates, so the newest failure is the single open bug to triage. |

**This pipeline writes no version of its own.** The version belongs to the change that earned it —
static-website's rule and its `sw/version-bumped` check hold that line — so what reaches `main` is
already the number to release, the number a reviewer saw on the PR is the number that ships, and a
published change that forgot its bump fails on the PR rather than silently never deploying.

**The major is the one bump this pipeline still performs**, because it belongs to no single change:
dispatch **Release to GitHub Pages** with `bump: major` and it raises the major, pushes it, and
releases the result. That dispatch is what **"bump version"** means on a Pages-served site repo. The
push uses `GITHUB_TOKEN`, which fires no workflow — which is why the orchestrator runs the release
explicitly after it rather than relying on the push trigger, and why the push cannot loop.

The **PR gate** is static-website's [`static-site-ci.yml`](../../../static-website/stubs/workflows/static-site-ci.yml),
not this pack's: a repo that releases on push has no gate unless its pull requests run one, and that
gate is the same whatever serves the site.

## Setting up a new site repo

1. **Set the static-website half up first** — declare that pack, write `.github/site.config`, vendor
   its actions and CI stub, and put the version on the scheme. Its skill owns those steps.
2. **Declare `github-pages`** in `.claudinite-settings.json` and re-vendor, so this pack's tree lands
   under the shared mount.
3. **Vendor the pipeline** into the repo's own `.github/`: everything under
   [`stubs/workflows/`](../../stubs/workflows/). There are no tokens to replace.
4. **Open the one-time settings issue** from the pack's `adoptionHandover` steps — idempotent: search
   the tracker first and skip if one already exists, open or closed. They are repository *settings*,
   so nothing in the repo can set them, and until they are on the first release-on-push run fails and
   opens a `workflow-failure` issue.
5. Run the world sweep; `gp/pages-workflows` is the checklist for whether the wiring is complete.

A **custom domain** (Settings → Pages → Custom domain) is optional and moves the site from
`/<repo>/` to the domain root — see the relative-URL rule in this pack's [RULES.md](../../RULES.md).

## Routine work

- **Ship a change**: raise the version in the same PR and merge to `main`. The site redeploys under
  that `v<major>.<ymmdd>.<n>` on its own — that is the whole release procedure.
- **Redeploy without a content change** (a settings fix, a first deploy): run **Release to GitHub
  Pages** from its dispatch page with `force: true`. It redeploys the existing tag rather than
  cutting a second one.
- **"bump version"** means the **major** — the deliberate "new generation" statement. Run **Release
  to GitHub Pages** with `bump: major`; it writes every `version_files` record together, pushes, and
  releases.
- **A failed release** leaves a `workflow-failure` issue with the run link. Nothing before the tag
  changes anything at all, and the version is already on `main` either way — so the next push (or a
  `force` dispatch) releases from there with nothing to unwind.

## What the checks hold a change to

**The pipeline files under `.github/workflows/github-pages-*` are managed copies of this pack's
`stubs/`.** Fix the pack and re-vendor; an edit to the copy is overwritten and, until it is, makes
this repo's pipeline differ from every other Pages repo's. The repo's own values all live in
`.github/site.config`, which is what the copies read.
