# static-website pack

The release standard for a plain static site: the date-anchored version scheme, release-on-push, the explicit publish set, the GitHub Pages deploy, and the PR gate — the contract and its setup in [RELEASE.md](RELEASE.md), the **vendored pipeline** in [`stubs/`](stubs/) (materialized into each site repo's own `.github/`), the four in-session rules in [RULES.md](RULES.md), and the conformance checks beside them. **Opt-in**: a project declares it in `.claudinite-checks.json` when it's ready to ship a site this way. GitHub only resolves a reusable workflow / composite action from a repo's own `.github/`, so the pack holds the templates and each repo hosts a managed copy — no cross-repo `@main` dependency, and the repo's own values live in one `.github/site.config`.

Fingerprint: the `Release static site` orchestrator (`.github/workflows/static-site-release.yml` carrying that `name:`). It only *suspects* the pack — declaring is the project's call. Every rule here is gated on it too, so a repo that declares the pack for the versioning and CI half while its site deploys somewhere other than GitHub Pages carries none of the deploy machinery and none of these rules fire on it.

## Checks

| Rule | What it holds |
|---|---|
| `sw/release-workflows` | the orchestrator (named, push-triggered, calling the local publish reusable), both reusable workflows, all three composite actions, and a PR gate are vendored |
| `sw/site-config` | `.github/site.config` exists with its five explicit keys, no unknown keys, every publish path tracked, no tooling directory published, and an `index.html` in the set |
| `sw/version-scheme` | every declared version record carries the same `<major>.<ymmdd>.<n>` version |

## Prose (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| Publish set names every published file | prose for the habit; check (`sw/site-config`) for a path that matches nothing |
| Never hand-edit the version | prose; the scheme itself is a check (`sw/version-scheme`) |
| Vendored pipeline files are managed copies | prose; presence is a check (`sw/release-workflows`) |
| Pages serves from a subpath | prose |

The version scheme and the code that computes it live together in [stubs/actions/bump-site-version/bump.mjs](stubs/actions/bump-site-version/bump.mjs) — the checks import `VERSION_RE` from there rather than restating it, so the rule and the bump can't disagree about what a version is.
