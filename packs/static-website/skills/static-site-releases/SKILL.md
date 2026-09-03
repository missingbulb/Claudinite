---
name: static-site-releases
description: The release standard every static-site repo of ours ships — the date-anchored version scheme, release-on-push, the explicit publish set, .github/site.config, the vendored workflows, the Pages deploy, and the setup a new site repo needs. Use when setting up a site repo, changing or debugging its release pipeline or site.config, when asked to "bump version" on a site repo, or when a static-website check fires.
metadata:
  force-load-on-file-edits-paths:
    - ".github/site.config"
    - ".github/workflows/static-site-*.yml"
---

# Releasing a static site

Every static-site repo of ours ships the **same** pipeline: same workflows, same versioning, same
publish-set rules, same CI gate — so set a new repo up against that contract rather than authoring its
pipeline, and turn on by hand only the GitHub settings the automation cannot.

The workflow **logic** is authored once, in this pack's [`stubs/`](../../stubs/) — the
[orchestrator](../../stubs/workflows/static-site-release.yml), three `workflow_call`-only **reusable
workflows** ([publish](../../stubs/workflows/static-site-publish.yml),
[deploy](../../stubs/workflows/static-site-deploy-pages.yml),
[bump](../../stubs/workflows/static-site-bump-version.yml)), the
[CI gate](../../stubs/workflows/static-site-ci.yml), and three composite actions
([read-site-config](../../stubs/actions/read-site-config/action.yml),
[bump-site-version](../../stubs/actions/bump-site-version/action.yml),
[assemble-site](../../stubs/actions/assemble-site/action.yml)) — and **vendored into each site repo's own
`.github/`**, where the whole pipeline runs with no cross-repo dependency. GitHub resolves a
reusable workflow or a composite action only from a repo's own `.github/`, never from the shared
mount, so "the logic lives in the pack" means the pack holds the templates and each repo hosts a
*managed* copy: edit the pack, not the copy. Everything repo-specific is the keys of
`.github/site.config`, so every vendored file is copy-verbatim across repos.

## The contract

### Versioning — `v<major>.<ymmdd>.<n>`

The site's version is **date-anchored**, and it is computed, never typed. The scheme, and the code
that computes it, live together in [bump.mjs](../../stubs/actions/bump-site-version/bump.mjs):

| Part | What it is |
|---|---|
| `major` | the wrap counter. Raised by hand only as a deliberate "new generation of the site" statement — and automatically on the decade wrap (below). |
| `ymmdd` | the **last digit of the UTC year**, then `MM`, then `DD`. 2026-12-31 → `61231`; 2027-01-01 → `70101`. |
| `n` | the day's release counter: `1` for the day's first release, the previous release's `n + 1` for each further release the **same** day. |

**Why the year digit.** The bare `MMDD` form is not monotonic across a year boundary: December
31st's `1.1231.3` sorts *above* the next day's `1.0101.1`, so "later" stopped meaning "bigger" —
which is the one thing every reader of a version assumes. Prefixing the year digit restores it:
`1.61231.3` → `1.70101.1`.

**The decade wrap.** One year digit means 2029-12-31 (`91231`) is followed by 2030-01-01 (`00101`)
— the one legitimate decrease. The major absorbs it: `1.91231.4` → `2.00101.1`, and the ordering
holds forever. Any *other* decrease (a version dated in the future — a hand edit, a wrong clock) is
an error and fails the bump loudly; burning a major to paper over it would hide a real problem.

**The bump belongs to the change, not to the pipeline.** A change that touches the publish set
raises the version in the same PR — `node .github/actions/bump-site-version/bump.mjs $(the repo's
version_files)` writes every record together — and `sw/version-bumped` is what holds that line. The
release flow writes no version at all: it releases whatever it finds on `main`, and no-ops when that
version already has a release. So the number a reviewer sees on a PR is the number that ships, and a
published change that forgot its bump fails on the PR rather than silently never deploying. A change
that publishes nothing needs no bump and redeploys nothing.

**The major is the one bump the pipeline still performs**, because it belongs to no single change:
dispatch **Release static site** with `bump: major` and it raises the major, pushes it, and releases
the result. That dispatch is what **"bump version"** means on a site repo.

**Moving an existing site onto the scheme** is a one-line edit, once: rewrite the current version
in place with the year digit inserted (`1.1231.3` → `1.61231.3`). The result is strictly greater
than what it replaces (`61231 > 1231`), so no tag or release ordering is disturbed and no major
bump is needed. Every version after that is the next change's bump.

The version lives in the files the repo names in `version_files` — the first is the source of
truth, the rest must agree. `sw/version-scheme` holds them to the scheme and to each other; the
bump validates every record before writing any, so a failure never leaves a half-bumped tree.

### The published artifact — an explicit list

The Pages artifact is assembled from `publish_paths` under `publish_root`, **and nothing else**.
The rejected alternative is subtractive — "serve the repo except `.claude/` and `.claudinite/`" —
and it fails in the direction that hurts: it publishes every file nobody thought to exclude, and it
publishes each *new* one silently, the day it lands. An additive list can only publish what the
repo asked for, and its failure mode (a file that doesn't appear) is visible on the site and caught
on the PR. Two guards make that concrete, in [assemble-site](../../stubs/actions/assemble-site/action.yml):
a publish path that doesn't exist fails the run, and so does an assembled site with no `index.html`
at its root. Both also run on every pull request, so a broken publish set never reaches `main`.

### `.github/site.config` — five required keys, no defaults

A dotenv file, **every required key explicit**. A default that "happens to match" a repo's
layout silently publishes the wrong tree the day the layout or the default changes:

| Key | What it is |
|---|---|
| `publish_root` | the directory the site is rooted at; `.` = the repo root. It becomes the site's `/`. |
| `publish_paths` | the publish set: space-separated files/directories under `publish_root`. |
| `version_files` | space-separated version records; the first is the source of truth. |
| `build_command` | what produces the publish set; `""` = nothing to build, stated. |
| `test_command` | the repo's gate; `""` = no tests, stated. |

A command that needs dependencies installs them itself (`npm ci && npm test`) — that's why there is
no "setup" key and no assumption that a lockfile exists.

#### `build_vars` — the one optional key

`build_command` otherwise runs with no access to any repo configuration at all, which leaves a site
needing a build-time value (an analytics token, a base URL, a feature flag) with nowhere to put it.
`build_vars` is the declaration that closes that gap: space-separated names of **repo variables**,
exported into the build's environment before `build_command` runs.

```dotenv
build_command=node tools/build.mjs
build_vars=SITE_ANALYTICS_TOKEN SITE_BASE_URL
```

Three properties are load-bearing, and each is the opposite of a nearby easier choice:

- **Optional, unlike the five.** The explicitness rule exists to stop a default from publishing the
  *wrong tree*; an absent `build_vars` can't do that — it means the build sees no variables, exactly
  what every site did before the key existed. So an untouched config keeps its exact meaning and no
  existing repo has to be migrated to stay valid.
- **A declared-but-unset variable fails the run.** Exporting an empty string instead would give the
  original failure one level down: the build succeeds, the page ships, and the feature that needed
  the value is silently dead on the live site. Better a failed deploy naming the variable.
- **Variables, never secrets.** The exporter is handed `toJSON(vars)`, a context that structurally
  cannot carry a secret — so a value that must not appear in a published artifact cannot reach the
  step that produces one. That boundary is a property of what the workflow passes, not a convention
  to remember. A build that genuinely needs a secret is doing something a published static site
  should not be doing.

Declaring `build_vars` also holds the repo to a vendored copy new enough to honour it: `sw/release-workflows`
fails if the config names variables while the vendored action or workflows predate the exporter, since
that combination reads the key, ignores it, and builds with the variables unset.

```dotenv
# A hand-authored site with no build step.
publish_root=.
publish_paths=index.html about.html assets data
version_files=package.json
build_command=
test_command=npm ci && npm test
```

`read-site-config` fails the run on a missing file, a missing or empty required key, or an unknown
(typo'd) key; `sw/site-config` fails the same cases in the repo's own checks, plus a publish path
that matches nothing tracked, a tooling directory in the publish set, and a site with no
`index.html`.

### The workflows

**One orchestrator per repo** — [`static-site-release.yml`](../../stubs/workflows/static-site-release.yml),
named exactly `Release static site`. It owns only the triggers (push to `main`, plus a
`workflow_dispatch` with `force`) and calls the local publish reusable, which runs:

| Stage | What it does |
|---|---|
| `check` | is a release due? The version on `main` has no release of its own yet — or `force`. Asking the **release list** for the current version (rather than diffing files against a tag) is what makes the flow idempotent: a failed run retries on the next push with nothing to undo, and a push carrying an already-released version is a clean no-op. |
| `verify` | the repo's `test_command`, on the tree being released — **before** anything is tagged or deployed. |
| `release` | GitHub Release `v<major>.<ymmdd>.<n>` at that tree, auto-generated notes. |
| `deploy` | the Pages deploy of that exact commit, from the explicit publish set. |
| `report-failure` | any failure above opens a fresh `workflow-failure` issue and closes earlier open ones for this workflow as duplicates, so the newest failure is the single open bug to triage. |

The `bump: major` dispatch pushes with `GITHUB_TOKEN`, which fires no workflow — which is why the
orchestrator runs the release explicitly after it rather than relying on the push trigger, and why
the push cannot loop.

A push carrying a version that is already released is a clean no-op: no tag, no redeploy.

**CI** — [`static-site-ci.yml`](../../stubs/workflows/static-site-ci.yml) runs on every pull request with
**no `paths:` filter**: the Claudinite world sweep, the repo's `test_command`, the build, and a dry
run of the artifact assembly. The missing path filter is deliberate — a path-filtered conformance
flow arms auto-merge and then never runs, so the repo's own maintenance PR waits forever.

## Setting up a new site repo

1. **Declare** `static-website` in `.claudinite-settings.json` and answer the pack's two adoption
   questions (where it's served; what's published). Re-vendor so the pack's tree lands under the
   shared mount.
2. **Vendor the pipeline** into the repo's own `.github/`: everything under
   [`stubs/workflows/`](../../stubs/workflows/) and [`stubs/actions/`](../../stubs/actions/). There are no
   tokens to replace. A repo whose site deploys somewhere **other** than Pages takes the CI stub
   and the versioning half only, and skips the orchestrator + the three reusables — every rule in
   this pack is gated on the orchestrator, so nothing here fires on it.
3. **Write `.github/site.config`** with all five required keys, from the adoption answers (plus
   `build_vars` if the build needs repo variables).
4. **Put the version on the scheme** — one hand edit in each `version_files` record (`1.1231.3` →
   `1.61231.3` for an existing site; `1.<today's ymmdd>.1` for a new one).
5. **Open the one-time settings issue** (below) — idempotent: search the tracker first and skip if
   one already exists, open or closed.
6. Run the world sweep; `sw/release-workflows`, `sw/site-config` and `sw/version-scheme` are the
   checklist for whether the wiring is complete. `sw/version-bumped` is work-scope and shows up on
   the first PR that touches the publish set.

## The settings only a human can turn on

Repository settings are not repo content: no workflow, check or agent can set them, and a pipeline
that silently depends on one is a pipeline that fails on its first run for a reason nobody wrote
down. So they are tracked as **state, in one issue in the adopting repo** — done once, then closed
— not as a standing file:

```markdown
### One-time GitHub settings for the static-site release pipeline

The release pipeline is vendored and green in CI, but the following are repository *settings* —
nothing in the repo can set them, so they are turned on by hand (Settings → …). Until they are,
the first release-on-push run fails and opens a `workflow-failure` issue.

- [ ] **Pages → Build and deployment → Source = "GitHub Actions"** (not "Deploy from a branch").
      Without it `actions/deploy-pages` fails and nothing is served.
- [ ] **Actions → General → Workflow permissions = "Read and write permissions"**, so the pipeline
      can create the release and push a `bump: major` dispatch. (Not needed if the repo is already
      on read/write.)
- [ ] **Environments → `github-pages` → deployment branches** must allow `main` — the default
      "protected branches only" rule already does; check it if the repo renamed its default branch.
- [ ] Optional: **Pages → Custom domain**, if this site has one. Note that a custom domain moves
      the site from `/<repo>/` to the domain root — see the relative-URL rule in the pack's
      [RULES.md](../../RULES.md).

Close this issue once the first release-on-push run has deployed successfully.
```

## Routine work

- **Ship a change**: raise the version in the same PR (it touched the publish set, so
  `sw/version-bumped` requires it) and merge to `main`. The site redeploys under that
  `v<major>.<ymmdd>.<n>` on its own — that is the whole release procedure.
- **Redeploy without a content change** (a settings fix, a first deploy): run **Release static
  site** from its dispatch page with `force: true`. It redeploys the existing tag rather than
  cutting a second one.
- **"bump version"** on a site repo means the **major** — the deliberate "new generation" statement.
  Run **Release static site** with `bump: major`; it writes every `version_files` record together,
  pushes, and releases.
- **A failed release** leaves a `workflow-failure` issue with the run link. Nothing before the tag
  changes anything at all, and the version is already on `main` either way — so the next push (or a
  `force` dispatch) releases from there with nothing to unwind.

## What the checks hold a change to

- **The pipeline files under `.github/workflows/static-site-*` and `.github/actions/{read-site-config,bump-site-version,assemble-site}` are managed copies of the pack's `stubs/`.** Fix the pack and re-vendor; an edit to the copy is overwritten and, until it is, makes this repo's pipeline differ from every other site repo's. The repo's own values all live in `.github/site.config`, which is what the copies read.
