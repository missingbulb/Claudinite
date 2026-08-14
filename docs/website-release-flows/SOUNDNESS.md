# Website release consolidation — soundness analysis

Status: analysis record (produced by an independent review agent over
[COMPARISON.md](COMPARISON.md), the `static-website` pack sources, and one bespoke flow).
Feeds [DESIGN.md](DESIGN.md). Refs #722.

The policy analyzed: consolidate the three site repos' bespoke release mechanisms into the
vendored `static-website` pack — date-anchored `v<major>.<ymmdd>.<n>`, release-on-push gated
on the explicit publish set, check → verify → bump → Release → deploy → failure issue,
repo-specifics confined to `.github/site.config`.

## Verified platform facts

1. **GITHUB_TOKEN pushes fire no workflows** (high confidence). Exceptions:
   `workflow_dispatch`/`repository_dispatch` created with GITHUB_TOKEN *do* fire; pushes
   made with a PAT, deploy key or App token fire normally. The pack relies on this
   correctly (no bump loop) — and overlooks its flip side (finding 1 below).
2. **A workflow-level `permissions:` block can grant write scopes even when the repo
   default is read-only** (high confidence). The repo setting only sets the *default*.
   Every job in the pack declares explicit permissions ⇒ the settings-issue item
   "Workflow permissions = Read and write" in the pack's RELEASE.md is **unnecessary**.
3. **`configure-pages` `enablement: true`** can enable Pages (source: GitHub Actions) with
   GITHUB_TOKEN + `pages: write` on a public repo — two of the three bespoke flows are
   empirical evidence. Residual doc ambiguity exists (fine-grained-token docs mention
   administration:write; private-on-Free has no Pages at all) — worth one empirical run.
   The pack's deploy stub *omits* the flag, making the pack more manual than the bespoke
   flows it replaces.
4. **`vars.*` is readable from any workflow in the repo** without a grant — but **not from
   inside composite actions**, and the pack's copy-verbatim workflows name no repo vars;
   that is the real shape of the analytics-token blocker. The token itself is public by
   construction (it ships in the served JS), so committing it is equivalent on
   confidentiality and dissolves the whole injection + vars-plumbing problem.
5. **`[skip ci]`** suppresses only `push`/`pull_request` triggers; redundant where the push
   is GITHUB_TOKEN-authored. Harmless provenance marker; must not be the load-bearing guard.
6. **`gh release view` as the release-due baseline**: sound for first-release and normal
   paths; traps — a deleted release/tag skews or breaks the baseline (loudly, mostly);
   `gh release create` silently reuses an existing tag ignoring `--target`; and the stub's
   `2>/dev/null || true` swallows *any* gh failure as "no release yet", turning transient
   API errors into spurious full releases (fails toward over-releasing — right direction,
   still churn).

## Findings, ranked

1. **[High] Release-on-push is blind to workflow-authored pushes.** A GITHUB_TOKEN push
   from another workflow (EdFringeNow's hourly data refresh, scrape/prices) neither
   triggers the orchestrator nor re-queues a run after a failed bump race — so the
   "fail loudly, the next push catches up" recovery is conditional on the pusher's
   credential, and EdFringeNow's core intent (fresh data ⇒ redeploy) silently breaks.
2. **[High] EdFringeNow's release semantics are unreconciled.** If data pushes are made to
   trigger releases (PAT or explicit dispatch), the pack's "release = tag + GitHub
   Release" mints thousands of data-churn releases a year and recurring race-failure
   issues. One-size release semantics don't fit the one repo dominated by automated data.
3. **[Medium] Post-bump deploy failure leaves a Release that never went live**, and the
   due-check then reports "nothing to do" — live-site staleness recoverable only by a
   human noticing the failure issue. Documented and coherent, but fragile unattended.
4. **[Medium] The pack's docs carry two platform-fact errors** that mislead maintenance:
   the unnecessary workflow-permissions manual step (fact 2), and the claim that GitHub
   resolves composite actions only from `.github/` — actually only *reusable workflows*
   are location-bound; composite actions can live anywhere in the repo, including the
   vendored mount. The fat 4-workflows + 3-actions vendored surface rests partly on that
   false claim, and it maximizes exactly the file class (`.github/workflows/`) that
   GITHUB_TOKEN cannot converge — forcing the agent-stage handoff for four files per repo
   on every pack change.
5. **[Medium] The vars/analytics gap**: the 5-key config cannot express the fleet's one
   real per-repo runtime input; the first adoption (MissingBulbWebsite PR #39) is blocked
   on a disapproved vars-export fix for a problem dissolvable by committing the public
   token.
6. **[Low] Missing `enablement: true`** — a regression against the first-go goal.
7. **[Low] Dead `pages` concurrency group** in the workflow_call-only deploy stub (a
   called reusable creates no run of its own, so run-level concurrency there is inert).
8. **[Low] Failure-reporter noise**: fresh-issue-supersede (the noisier of the fleet's two
   patterns) is attached to the pipeline likeliest to fail repeatedly; the scheduler's
   create-or-comment pattern converges to one issue.

## What must be YAML vs what needn't be

Genuinely Actions-native: triggers, run-level `concurrency`, `permissions:`, the
`environment: github-pages` declaration, OIDC `id-token`, and the configure/upload/deploy
Pages actions. Everything else — config read, due-check, bump, assembly, `gh release
create`, failure reporting — is plain node/git/gh, the class of logic the fleet already
ships as one engine script behind a ~60-line shim (`claudinite-scheduler.yml`).

## State update (2026-08-09, evening) — findings against the moved fleet

The analysis above ran against canon `main` before #727/#729 and before EdFringeNow's
adoption (#319). What the same-day movement changes, finding by finding:

- **Finding 1 (release blind to workflow-authored pushes) — now live, not hypothetical.**
  EdFringeNow adopted with data files in the publish set and *no* dispatch wiring; its
  hourly refresh pushes ride the scheduler's GITHUB_TOKEN. #319 expects those pushes to
  keep releasing ("roughly 17/day") — the platform fact says they release nothing, and
  the site serves stale data between content pushes. Whichever way it lands empirically,
  one of the two intended behaviors (fresh data deploys / releases stay meaningful) is
  broken as merged.
- **Finding 2 (EdFringeNow release semantics) — still open, explicitly deferred by #319**
  ("a separate decision from this PR"). Note the two failure directions are now
  entangled: if dispatch wiring is added naively (fixing finding 1), the ~17 releases/day
  problem materializes; without it, data never deploys.
- **Finding 5 (the vars/analytics gap) — resolved in canon, by #729's `build_vars`**: a
  declared per-repo list in `site.config` (repo vocabulary stays out of the copy-verbatim
  stubs), fail-on-unset (a deleted variable breaks the deploy loudly instead of shipping
  a silently beaconless site), vars-context-only (a secret structurally cannot reach the
  build). This addresses both objections to #626's wholesale export. It *keeps* the
  variable indirection and its machinery, which the design still argues is unnecessary
  for public-by-construction values — see DESIGN.md D3.
- **Findings 3, 4, 6, 7, 8 — unchanged in canon**: the post-bump staleness window, both
  platform-fact errors in RELEASE.md (the moot workflow-permissions settings item; the
  overbroad composite-action-resolution claim), the missing `enablement: true`, the dead
  `pages` concurrency group, and the fresh-issue-supersede reporter are all still as
  analyzed — now vendored into a live adopter.

## The first-go manual set (a fresh repo)

Irreducible: **custom domain + DNS** (where applicable) — and, until `enablement: true` is
adopted and verified, the Pages-source setting. Everything else self-serves: workflow
permissions (fact 2), the `github-pages` environment (auto-created; default rules pass for
main), the `workflow-failure` label (created idempotently), the first-release path. The
analytics variable stops being a setting if the public token is committed.
