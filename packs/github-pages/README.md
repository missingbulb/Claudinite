# github-pages pack

Serving a site from GitHub Pages: release on push, the GitHub Release it cuts, the Pages deploy of that exact commit, and the subpath the result is served from — the contract and its setup in [the **github-pages-pipeline** skill](skills/github-pages-pipeline/SKILL.md), the **vendored pipeline** in [`stubs/`](stubs/) (materialized into each site repo's own `.github/`), the one in-session rule in [RULES.md](RULES.md), and the conformance check beside them. **Opt-in**: a project declares it when its site is served from Pages. GitHub only resolves a reusable workflow from a repo's own `.github/`, so the pack holds the templates and each repo hosts a managed copy — no cross-repo `@main` dependency.

Fingerprint: the `Release to GitHub Pages` orchestrator (`.github/workflows/github-pages-release.yml` carrying that `name:`). It only *suspects* the pack — declaring is the project's call.

## What this pack does not own

The version scheme, `.github/site.config`, the publish set and the three composite actions these workflows run are [**static-website**](../static-website/README.md)'s, because they are true of a static site whatever serves it. This pack `requires` it, so a Pages repo carries both vendored sets; a site that deploys to a host of its own declares static-website alone and none of the machinery here reaches it.

That boundary is why the check below asserts the composite actions have *arrived* but never judges their content, and why the PR gate — a repo that releases on push has no gate unless its pull requests run one — is static-website's `static-site-ci.yml` rather than a second copy here.

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `gp/pages-workflows` | high | correctness | check: blocking |

What it holds: the orchestrator (named, push-triggered, calling the local publish reusable), all three reusable workflows, and the composite actions those workflows call are vendored — plus, where `.github/site.config` declares `build_vars`, that the vendored deploy workflow is new enough to export them rather than build with them unset.

## Skills

[**github-pages-pipeline**](skills/github-pages-pipeline/SKILL.md) is the standard itself — the release flow's stages, the `bump: major` and `force` dispatches, the vendored workflows, the setup a new Pages repo needs, and the one-time GitHub settings no automation can turn on. It is the contract the check above judges against, reached when a pipeline is being set up or debugged rather than carried by every session in the repo. The rule that the pipeline files are managed copies of the pack's stubs lives there too, forced for the `github-pages-*` workflows it concerns.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| The site is served from a subpath | high | correctness | prose: <50 words |

One rule, because one thing here bites a session that never opens the skill: a root-relative URL works in every local preview and 404s in production. Everything else this pack knows is procedure, and procedure loads with the skill.

## Adoption

The pack declares its `adoptionHandover` — the three repository *settings* nothing in the repo can turn on (Pages source, workflow permissions, the `github-pages` environment's branch rule). The install flow prints them and files them as a tracking issue; until they are on, the first release-on-push run fails and opens a `workflow-failure` issue.
