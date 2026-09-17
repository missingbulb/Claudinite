# static-website pack

The shipping standard for a plain static site: the date-anchored version scheme, the explicit publish set, `.github/site.config`, the config-reading composite actions and the PR gate — the contract and its setup in [the **shipping-a-static-site** skill](skills/shipping-a-static-site/SKILL.md), the **vendored files** in [`stubs/`](stubs/) (materialized into each site repo's own `.github/`), the in-session rules in [RULES.md](RULES.md), and the conformance checks beside them. **Opt-in**: a project declares it in `.claudinite-settings.json` when it's ready to ship a site this way. GitHub only resolves a composite action from a repo's own `.github/`, so the pack holds the templates and each repo hosts a managed copy — no cross-repo `@main` dependency, and the repo's own values live in one `.github/site.config`.

Fingerprint: `.github/site.config`, the pack's own central artifact. It only *suspects* the pack — declaring is the project's call.

## What this pack does not own

Whatever **serves** the site. Release-on-push, the GitHub Release it cuts and the Pages deploy are [**github-pages**](../github-pages/README.md)'s; a Cloudflare-served site is [cloudflare-site](../cloudflare-site/README.md)'s. What is here is true of a static site whichever one is bolted on, so a repo declares this pack plus at most one of those — and a repo whose site deploys from a workflow of its own declares this one alone and still gets its versioning, its publish set and its gate.

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `sw/vendored-pipeline` | high | correctness | check: blocking |
| `sw/site-config` | high | correctness | check: blocking |
| `sw/version-scheme` | medium | correctness | check: blocking |
| `sw/version-bumped` | high | correctness | check: blocking |

What each holds:

- `sw/vendored-pipeline` — the three composite actions and a PR gate are vendored, and where the config declares `build_vars`, that the vendored action and gate are new enough to export them.
- `sw/site-config` — `.github/site.config` exists with its five explicit keys, no unknown keys, every publish path tracked, no tooling directory published, and an `index.html` in the set.
- `sw/version-scheme` — every declared version record carries the same `<major>.<ymmdd>.<n>` version.
- `sw/version-bumped` — a change that touches the publish set raises the version in the same change. Work-scope: the tree always carries a version, and only the diff says whether it moved with the published files beside it.

Relevance for all four is `adoptedStandard` — **two independent signals, either sufficient**: the site config, or the vendored CI gate. Gating on the config alone would let a repo that vendored the pipeline and never wrote its config pass silently, which is the one case `sw/site-config` exists to report.

## Skills

[**shipping-a-static-site**](skills/shipping-a-static-site/SKILL.md) is the standard itself — the version scheme, the publish set, `.github/site.config`, the vendored actions and gate, and the setup a new site repo needs. It is the contract the four checks above judge against, reached when a pipeline is being set up or debugged rather than carried by every session in the repo. The rule that the vendored files are managed copies of the pack's stubs lives there too, forced for the `.github/site.config` and `static-site-*` paths it concerns.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| The publish set names every published file | high | correctness | prose: <100 words + check (`sw/site-config`) |
| The version moves with the change | high | correctness | prose: <50 words + checks (`sw/version-bumped`, `sw/version-scheme`) |
| Freshness is a published manifest's job | high | correctness | prose: <100 words |
| Nothing attests to its own freshness | high | correctness | prose: <50 words |
| Split caches join across generations | critical | correctness | prose: <100 words |
| Follow missing data to the pixel | high | correctness | prose: <100 words |

The last four are the client-side half: with no server to vary `Cache-Control` per file, the freshness policy moves into the page, and these are the four ways that goes wrong quietly.

The version scheme and the code that computes it live together in [stubs/actions/bump-site-version/bump.mjs](stubs/actions/bump-site-version/bump.mjs) — the checks import `VERSION_RE` from there rather than restating it, so the rule and the bump can't disagree about what a version is.
