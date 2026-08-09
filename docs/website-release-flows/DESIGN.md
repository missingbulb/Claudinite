# Website release flows — alignment design

Status: **proposed** (owner review pending). Refs #722.
Inputs: [COMPARISON.md](COMPARISON.md) (the fleet evidence), [SOUNDNESS.md](SOUNDNESS.md)
(the independent soundness analysis). The subject is the `static-website` pack — merged in
#611, adopted by nobody — and the three site repos' bespoke flows it is meant to replace.

## Goal

One github-pages-serving standard, owned by the pack, with:

- **no bespoke release mechanism left in any site repo** — the bespoke deploy workflows,
  bump scripts and CI variants all go;
- **minimum GitHub Actions surface** — YAML only where the platform forces it (triggers,
  permissions, OIDC, the Pages actions); all logic in scripts the ordinary vendoring
  converges. The rule of thumb the owner stated holds: a step that needs a secret or the
  repo token must run in Actions; nothing else has to;
- **minimum manual repo settings** — a fresh repo that declares the pack releases on the
  first push, with the custom domain as the only genuinely manual item;
- **customization without forks** — everything repo-specific in `.github/site.config`;
  the workflows stay copy-verbatim.

The acceptance probe (owner-specified): purge every release-related aspect *and setting*
from MissingBulbWebsite so it simulates a new repo, adopt the pack, and the first release
must work on the first go.

## Decisions

### D1. Keep one pack; reshape `static-website` in place

The consolidation policy survives the soundness review intact — one vendored standard,
repo-specifics in a small explicit config. With zero adopters, the pack is free to be
reworked in place with no migration debt. The pack keeps its `static-website` id (it owns
versioning and CI, not just serving); renaming to `github-pages-serving` is possible but
buys nothing the id doesn't already say — owner's call, recorded as an open question.

What survives unchanged from #611: the `v<major>.<ymmdd>.<n>` scheme (it fixes the bespoke
`mmdd` year-boundary flaw), the 5-key `site.config` with no defaults, the additive publish
set with its two loud guards, release-due-by-tag, the ordered check → verify → bump →
Release → deploy stages, and the adoption interview (which is what forces EdFringeNow's
root-publish conversation).

### D2. Thin-shim shape: two entry-point workflows, logic in the mount

SOUNDNESS.md finding 4: only *entry-point/reusable workflows* are location-bound to
`.github/workflows/`; composite actions and scripts are not, and the current 4-workflow +
3-action vendored surface (~890 lines per repo) maximizes exactly the file class the
converge machinery is worst at (GITHUB_TOKEN cannot push workflow files — every pack
change forces the agent-stage handoff for four files per repo).

New shape, on the fleet's own scheduler-shim precedent:

| Per-repo `.github/workflows/` | Contents |
|---|---|
| `static-site-release.yml` (~70 lines) | triggers (`push` to main, `workflow_dispatch` with `mode`), `concurrency`, `permissions`; job `release` runs `node .claudinite/shared/packs/static-website/pipeline/release.mjs` (due-check, verify, bump, push, GitHub Release); job `deploy` (needs release, `environment: github-pages`, checkout at the released sha) runs the assemble script then `configure-pages` → `upload-pages-artifact` → `deploy-pages`; job `report-failure` runs the reporter script |
| `static-site-ci.yml` (~40 lines) | the PR gate shim: world sweep + `node …/pipeline/ci.mjs` (test_command, build_command, assembly dry run) |

Everything else — due-check, bump, assembly, release creation, failure reporting, config
read — moves into pack scripts under the vendored mount, updated by ordinary vendoring
like any engine code. No reusable workflows, no composite actions, no inter-job config
plumbing: the scripts read `site.config` themselves, so the YAML carries zero
repo-specific values and stays copy-verbatim. The dead `pages` concurrency group and the
reusable-call nesting go away with the shape.

The two shims change rarely by construction (the scheduler shim is the precedent); when
they do, it is the same agent-stage handoff that already exists — but for two files, on
rare occasions, instead of four files on every pipeline change.

### D3. Commit the analytics token; delete the injection machinery

The Cloudflare Web Analytics beacon token ships in the served JavaScript — it is public by
construction, and the variable + sed-injection + placeholder machinery protects nothing
(SOUNDNESS.md fact 4). Each site commits its token directly in its analytics loader; the
`CLOUDFLARE_ANALYTICS_TOKEN` repo variable and the injection step are deleted in all three
repos. This dissolves the vars-into-build problem entirely — the pack needs no repo-variable
export, which was the sole reason MissingBulbWebsite's PR #39 depended on the disapproved
#626.

Pack prose records the dividing rule: **a value that ships to the client is source and is
committed; a value that must not ship is a secret, and a secret forces the step that uses
it into Actions.** Today's fleet has no secret in any site pipeline — which is exactly why
the pipeline can be this small.

### D4. Self-serve Pages enablement

`configure-pages` gains `enablement: true` (two of the three bespoke flows already had it
and self-enabled Pages successfully; the pack as merged regressed this). With it, a fresh
public repo needs **no** Pages settings visit. The acceptance probe (D10) doubles as the
empirical verification the soundness analysis asked for; if it fails, the settings issue
(D8) is the documented fallback.

### D5. State the trigger contract; automation dispatches, never relies on push

SOUNDNESS.md finding 1: pushes authored with a workflow's GITHUB_TOKEN fire no `push`
trigger — so release-on-push works only for pushes that carry a user credential (human
merges, agent sessions). The pack's release doc states this contract explicitly, plus the
corollary: **any automation that writes the publish set must end by dispatching the
release workflow** (`workflow_dispatch` needs `actions: write`, which the scheduler shim
already holds; "store-release fires the release orchestrator's daily leg" is the existing
precedent). This also closes the race-recovery gap: a workflow-authored push that broke an
in-flight bump now always has its own dispatched run queued behind it.

### D6. Two dispatch modes: `release` and `deploy-only`

The `workflow_dispatch` input becomes `mode`:

- `release` (default; equals today's `force`) — full pipeline, even if nothing published
  changed. For redeploys after a settings fix and for first deploys.
- `deploy-only` — assemble and deploy the current main tip; **no bump, no tag, no GitHub
  Release**. For data-refresh automation: EdFringeNow's hourly ticket refresh dispatches
  `deploy-only` after pushing, so fresh data reaches the site within the hour while tags
  and Releases keep naming *content* releases only — instead of minting thousands of
  data-churn releases a year (SOUNDNESS.md finding 2). Content merges release normally;
  the due-check baseline (last release tag) is unaffected by deploy-only runs.

EdFringeNow's build-info freshness stamp moves into its `build_command`, so a deploy-only
run still shows when the site was built.

### D7. Failure reporting converges to one issue

The reporter switches from fresh-issue-supersede to the scheduler's quieter
create-or-comment pattern: one open `workflow-failure` issue per workflow, new failures
appended as comments. The pipeline likeliest to fail repeatedly (races with data writers)
gets the pattern that produces one signal instead of issue churn. The post-bump
deploy-failure window (a Release that never went live) keeps its documented recovery — a
`deploy-only` or `release` dispatch — now hanging on a converged issue rather than the
newest of many.

Two script-level fixes ride along (SOUNDNESS.md fact 6): the due-check distinguishes "no
release exists" from "the API call failed" (the latter fails the run instead of forcing a
spurious release), and release creation refuses to proceed if the tag already exists
(never silently re-target an existing tag).

### D8. The settings issue shrinks to the irreducible set

The one-time settings issue drops the "Workflow permissions = Read and write" item — the
explicit `permissions:` blocks make it moot (SOUNDNESS.md fact 2) — and drops Pages
enablement to a fallback note (D4). What remains genuinely manual:

1. **Custom domain + DNS**, where the site has one (claudinite.com, missingbulb.com) —
   inherently a human/registrar act.
2. *Fallback only:* Pages → Source = "GitHub Actions", if self-enablement fails on this
   repo (then close the issue and note the failure on the pack).

### D9. Customization has a stated ceiling

Per-repo customization **is** `.github/site.config`: the publish set, the version files,
`build_command` (any repo-specific transform — build stamps, generators — installs its own
dependencies), `test_command` (the repo's whole gate). The two workflow shims are
copy-verbatim and converge-overwritten; a need the five keys cannot express is a pack
change (raise it centrally — MissingBulbWebsite's own `repo-mechanics` rule), not a local
edit. The pack prose says this plainly instead of implying unlimited customizability.

### D10. Migration and the acceptance probe

Order: rework the pack (D2–D9) → probe on MissingBulbWebsite → roll out to the other two.

**MissingBulbWebsite — the purge test (owner-specified).** Close PR #39 as superseded
(its diff predates the reshape and its #626 dependency is dissolved). Then, simulating a
fresh repo:

1. Purge: `deploy-pages.yml`, `checks.yml`, `scripts/bump-version.mjs` and its
   `package.json` script; delete the `CLOUDFLARE_ANALYTICS_TOKEN` variable; disable Pages
   entirely; remove the custom domain.
2. Commit the beacon token into `site/analytics.js` (D3).
3. Adopt the pack: declare it, answer the two interview questions, vendor the two shims,
   write `site.config`, put the version on-scheme (`1.0807.11` → `1.60807.11`).
4. Push to main. **Pass**: the run self-enables Pages, releases `v1.<today>.1`, and the
   site serves — zero settings visits. Then re-add the custom domain (the one manual step,
   D8) and close the settings issue.

**ClaudiniteWebsite**: same shape, no surprises; its local-pack test fixtures fold into
`test_command`.

**EdFringeNow**: the interview forces the publish-set decision (today it publishes the
repo root subtractively — scraper, docs and plan trees are live). `verify.sh` becomes
`test_command`, the build stamp becomes `build_command`, and the data-refresh task gains
the `deploy-only` dispatch (D5/D6). This is the adoption with real per-repo work, done
last.

## The surface, before and after

| | bespoke (per repo) | pack as merged (#611) | this design |
|---|---|---|---|
| `.github/workflows/` | 2 files, logic in YAML | 4 files, ~660 lines of logic in YAML | 2 thin shims, ~110 lines, no logic |
| `.github/actions/` | — | 3 composite actions | — |
| scripts | 1 copied bump script | 2 mjs inside vendored actions | pack scripts in the mount, converged normally |
| repo settings to touch | Pages source (1 repo), analytics var, domain | Pages source, workflow perms (moot), analytics var, domain | domain only |
| release record | none | tag + Release per push incl. data churn | tag + Release per content release; deploy-only for data |

## PR #626, reviewed after the fact

Per the owner's instruction, #626 (the disapproved earlier attempt: export every repo
variable into the build environment of both vendored workflows) was reviewed only after
this design was written. The design makes its mechanism unnecessary — D3 removes the one
consumer the export existed for. Three details of it are worth keeping anyway:

- **Parity between CI and deploy**: #626 exported the variables in the PR gate too, so a
  `build_command` behaves identically on the pull request and on the release, and a
  missing input surfaces on the PR. This design keeps that property by construction — the
  CI shim runs the same `build_command` + assembly scripts the deploy runs.
- **Stub-content tests**: #626 added pack tests asserting invariants of the vendored
  workflow files themselves (the export exists, precedes every command invocation, and
  `secrets` is never exported). The reshaped pack should do the same over its two shims
  and pipeline scripts — e.g. "no shim ever references `secrets`", "the shims invoke the
  pipeline scripts and carry no logic".
- **The fallback, if D3's answer is "keep the variable"**: #626's vars-only wholesale
  export (never `secrets`, run-id-salted heredoc delimiter so a value cannot terminate its
  own block) is the right mechanism for that world — repo-vocabulary-free, injection-safe.
  Recorded here so it isn't reinvented worse.

## Open questions for the owner

1. Rename the pack to `github-pages-serving`, or keep `static-website`? (D1 — cosmetic;
   default: keep.)
2. EdFringeNow data refreshes: `deploy-only` (recommended, D6) or full releases per data
   push (today's de-facto behavior, at ~8k Releases/year under the pack)?
3. Committing the public beacon token (D3): any reason to keep the variable indirection
   (fork hygiene, rotation-without-commit) that outweighs deleting the machinery?
