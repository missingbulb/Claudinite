# static-website pack

The release standard for a plain static site: the date-anchored version scheme, release-on-push, the explicit publish set, the GitHub Pages deploy, and the PR gate — the contract and its setup in [RELEASE.md](RELEASE.md), the **vendored pipeline** in [`stubs/`](stubs/) (materialized into each site repo's own `.github/`), the eight in-session rules in [RULES.md](RULES.md), and the conformance checks beside them. **Opt-in**: a project declares it in `.claudinite-checks.json` when it's ready to ship a site this way. GitHub only resolves a reusable workflow / composite action from a repo's own `.github/`, so the pack holds the templates and each repo hosts a managed copy — no cross-repo `@main` dependency, and the repo's own values live in one `.github/site.config`.

Fingerprint: the `Release static site` orchestrator (`.github/workflows/static-site-release.yml` carrying that `name:`). It only *suspects* the pack — declaring is the project's call. Every rule here is gated on it too, so a repo that declares the pack for the versioning and CI half while its site deploys somewhere other than GitHub Pages carries none of the deploy machinery and none of these rules fire on it.

## Checks

| Check | Reported as | Severity | Reason | What it holds |
|---|---|---|---|---|
| `sw/release-workflows` | blocking | high | correctness | the orchestrator (named, push-triggered, calling the local publish reusable), both reusable workflows, all three composite actions, and a PR gate are vendored |
| `sw/site-config` | blocking | high | correctness | `.github/site.config` exists with its five explicit keys, no unknown keys, every publish path tracked, no tooling directory published, and an `index.html` in the set |
| `sw/version-scheme` | blocking | medium | correctness | every declared version record carries the same `<major>.<ymmdd>.<n>` version |

## Rules (`RULES.md`)

| Rule | Words | Severity | Reason | How enforced |
|---|---|---|---|---|
| A published file is a file the publish set names — adding a page is two edits. | 120 | high | correctness | prose + check (`sw/site-config`) |
| Never hand-edit the version. | 81 | high | correctness | prose + check (`sw/version-scheme`) |
| The pipeline files under .github/workflows/static-site- and .github/actions/{read-site-config,bump-site-version,assemble-site} are managed copies of the pack's stubs/. | 55 | high | correctness | prose + check (`sw/release-workflows`) |
| The site is served from a subpath, not a domain root. | 64 | high | correctness | prose |
| Freshness is a published manifest's job, not a per-file TTL's. | 174 | high | correctness | prose |
| Nothing can attest to its own freshness, and size attests to nothing at all. | 183 | high | correctness | prose |
| Two files cached on separate clocks and later joined will be joined across generations — make them a verified set or don't split them. | 182 | critical | correctness | prose |
| Don't call missing data survivable until you have followed it to the pixel. | 123 | high | correctness | prose |

The version scheme and the code that computes it live together in [stubs/actions/bump-site-version/bump.mjs](stubs/actions/bump-site-version/bump.mjs) — the checks import `VERSION_RE` from there rather than restating it, so the rule and the bump can't disagree about what a version is.
