# Website release flows — comparison

Status: analysis input for the alignment design (DESIGN.md, landing alongside this doc). Surveys how the
three static-site repos — **EdFringeNow**, **ClaudiniteWebsite**, **MissingBulbWebsite** —
release today, against the canon `static-website` pack (merged in #611, adopted by nobody yet).

## The short version

All three repos run the **same hand-copied release flow** with local drift: a Pages deploy
workflow triggered on every push to `main` that bumps a `1.<mmdd>.<n>` version via a copied
`scripts/bump-version.mjs`, commits the bump back with `[skip ci]` and a rebase-retry loop,
sed-injects a Cloudflare analytics token from a repo variable, and uploads an artifact to
GitHub Pages. None cuts a tag or GitHub Release. Each repo also carries its own CI workflow
with a different notion of what CI is.

The canon already owns a standard for exactly this — the `static-website` pack — but it has
**zero adopters**. MissingBulbWebsite's adoption attempt (its PR #39, from its issue #38) is
open, unmerged and now conflicting, blocked on canon PR #626 (disapproved).

## The three bespoke flows, side by side

| Dimension | EdFringeNow (`pages.yml`) | ClaudiniteWebsite (`deploy-pages.yml`) | MissingBulbWebsite (`deploy-pages.yml`) |
|---|---|---|---|
| Trigger | every push to `main` + dispatch | every push to `main` + dispatch | every push to `main` + dispatch |
| Path filter | none | none (its `site/README.md` claims `site/**` — doc drift) | none |
| Concurrency | `pages`, **cancel-in-progress: true** | `pages`, cancel-in-progress: false | `pages`, cancel-in-progress: false |
| Version scheme | `1.<mmdd>.<n>` (Asia/Jerusalem date) | same | same |
| Bump mechanism | own `scripts/bump-version.mjs` (copy) | own copy, near-identical | own copy, near-identical |
| Bump persistence | commit to `main`, `[skip ci]`, rebase-retry ×5 | same | same |
| Analytics | sed-inject `vars.CLOUDFLARE_ANALYTICS_TOKEN` into `js/analytics.js` | same, into `site/assets/analytics.js` | same, into `site/analytics.js` |
| Extra steps | build-time stamp into `js/build-info.js` | — | — |
| Published artifact | **repo root, subtractive**: `rm -rf .claude .claudinite`, upload `.` | `site/` directory wholesale | `site/` directory wholesale |
| Pages enablement | `configure-pages` with `enablement: true` | `enablement: true` | **no enablement** — manual Pages setting required |
| Action versions | checkout@v4, upload-pages-artifact@v3 | checkout@v5, upload@v4 | checkout@v4, upload@v3 |
| Tag / GitHub Release | none | none | none |
| CI workflow | `ci.yml`: `scripts/verify.sh` (unit tests + syntax) — no world sweep in CI | `ci.yml`: world sweep + local pack test fixtures | `checks.yml`: world sweep only |
| Repo settings needed | Pages source (self-enabled), `CLOUDFLARE_ANALYTICS_TOKEN` var | same + custom domain (claudinite.com) | same + **Pages source by hand** + custom domain |
| Deploy-triggering writers | agent merges, scheduler maintenance PRs, **hourly data refreshes**, scrape/prices workflows | agent merges, scheduler maintenance PRs | agent merges, scheduler maintenance PRs |

### What is identical (the copied core)

- The version scheme and the bump script — three byte-similar copies of `bump-version.mjs`,
  same header comments, same `1.<mmdd>.<prev patch + 1>` scheme.
- The commit-back mechanics: `[skip ci]`, github-actions[bot] identity, the 5-attempt
  rebase-retry push loop — pasted three times.
- The analytics-token injection step, byte-similar except the target path.
- The artifact-flow Pages deploy tail (`configure-pages` → `upload-pages-artifact` →
  `deploy-pages`).

This is the textbook "second copy should have been raised centrally" situation —
MissingBulbWebsite's own `repo-mechanics` local pack records exactly that lesson (its PR #31
hand-rolled the flow by copying a sibling; its issue #38 ordered the pack adoption).

### What drifted (accidental differences)

- Analytics file path: `js/analytics.js` vs `site/assets/analytics.js` vs `site/analytics.js`.
- `enablement: true` present in two repos, absent in the third — the one manual Pages
  setting difference.
- Action pin drift (upload v3 vs v4, checkout v4 vs v5).
- `cancel-in-progress: true` only in EdFringeNow — a cancelled run there can strand a
  version bump that was pushed with no deploy behind it.
- CI means three different things (project gate only / world sweep + fixtures / world
  sweep only).
- Doc drift: ClaudiniteWebsite's site README describes a `site/**` path filter the workflow
  does not have.

### What is genuinely project-specific

- **EdFringeNow publishes the repo root** and carries non-site trees (scraper, docs, plan,
  product-wiki) into the published artifact after subtracting only `.claude`/`.claudinite`.
  Everything nobody thought to exclude is live on the site today.
- EdFringeNow's data pipelines (hourly ticket refresh, scrape/prices workflows) push to
  `main`, and each such push is a full release: version 1.0809.**79** is mostly data
  churn. For this site that is *intended* — fresh data should redeploy — but it means the
  "is a release due" question differs per repo.
- EdFringeNow stamps a build-info file at deploy time.
- The publish sets themselves (which files make up each site).

### Shared design flaws in the bespoke flow

1. `1.<mmdd>.<n>` is not monotonic across a year boundary (`1.1231.x` sorts above `1.0101.y`).
2. Every push to `main` bumps and redeploys — including scheduler maintenance merges and
   tooling-only commits, so the version counts events that shipped nothing.
3. No tag, no GitHub Release: nothing durable names what was deployed; the only record is
   the bump commit trail.
4. The version bump and the deployed tree can diverge: the checkout deploys `github.sha`'s
   tree while the bump commit lands on a possibly-moved `main`.
5. A failure is a red run in the Actions tab that nobody watches — no escalation path
   (the repos' scheduler workflow escalates its own failures; the deploy doesn't).

## The canon `static-website` pack (merged #611, unadopted)

The standard the fleet already agreed on, vendored into each repo's own `.github/`:

- **Version** `v<major>.<ymmdd>.<n>` — year digit restores cross-year monotonicity; decade
  wrap absorbed by the major; computed by a `bump-site-version` composite action.
- **Explicit publish set** in `.github/site.config` (5 required keys: `publish_root`,
  `publish_paths`, `version_files`, `build_command`, `test_command`); the artifact is
  assembled additively from the list and nothing else, with loud guards (missing path,
  missing `index.html`) that also run on every PR.
- **Release-on-push with a due check**: diff against the latest release tag; pushes that
  touch nothing published are clean no-ops. `force` dispatch for redeploys.
- **Ordered stages** check → verify (repo's `test_command`) → bump → GitHub Release →
  Pages deploy of the exact released commit → failure-issue reporter.
- **Shape**: 4 workflows (orchestrator, publish reusable, deploy reusable, CI) + 3
  composite actions, all vendored copy-verbatim into `.github/` — roughly 660 lines of
  YAML plus ~230 of mjs per adopting repo, kept current by the nightly converge (with the
  agent-stage handoff for `.github/workflows/` paths GITHUB_TOKEN cannot write).

### Where the bespoke flows and the pack disagree

| Question | Bespoke trio | `static-website` pack |
|---|---|---|
| When to release | every push to `main` | pushes that changed the publish set (or force) |
| Version | `1.<mmdd>.<n>`, no year digit | `v<major>.<ymmdd>.<n>` |
| What is published | a directory (or root-minus-tooling) | an explicit file/dir list |
| Release record | bump commit only | GitHub Release + tag at the bump commit |
| Test gate before release | none (CI is separate) | `test_command` runs before bump |
| Analytics/vars into the build | dedicated sed step reading `vars.*` in the repo's own workflow | unsolved — `build_command` runs without repo vars; canon PR #626 (disapproved) tried to export them |
| Failure visibility | red run, no escalation | fresh `workflow-failure` issue, dedup of older ones |
| Vendored surface per repo | 1 deploy workflow + 1 CI workflow + 1 script | 4 workflows + 3 actions + config file |

## Adoption state and the blocking question

- MissingBulbWebsite PR #39 (open, conflicts): full pack adoption, deletes the bespoke
  halves, moves analytics injection into `build_command` — which only works if the
  pipeline exports repo variables into the build environment, i.e. depends on canon
  PR #626, which the owner disapproved.
- EdFringeNow and ClaudiniteWebsite have no adoption attempt; EdFringeNow additionally
  needs an answer for "data pushes should release" (its publish set includes `data/`,
  which the pack's due-check handles naturally) and for its root-published layout (the
  publish-set question forces the right conversation).
