# `.github/workflows/` — three audiences in one directory

GitHub requires every workflow and composite action to live flat under `.github/`, so this repo's
own CI sits beside **canon reusable workflows that consuming repos reference `@main`**. Those
`@main` references make a consumer's *next run* pull whatever is on `main` here — instantly,
unattended, with no pin. Treat the reusable set as a **frozen public API**: renaming or removing one
breaks every extension repo's release pipeline, and consumers hold their own copy of the calling
stub that never auto-updates. Any rename here is the two-phase migration in
[../../consumer-safe-changes.md](../../consumer-safe-changes.md) (keep the old name as an alias until
every consumer stub has moved) — never a one-shot.

## Repo CI — runs only here

| File | Purpose |
|---|---|
| [`checks-ci.yml`](checks-ci.yml) | This repo's own unit tests + conformance sweep (`pull_request`, `push` to `main`). |

## Fleet orchestration — runs only here

| File | Purpose |
|---|---|

## Frozen `@main` API — consumers depend on these; do NOT rename or remove

Reusable workflows (`workflow_call` only — they never run in Claudinite itself):

| File | Called by |
|---|---|
| [`chrome-extension-release.yml`](chrome-extension-release.yml) | the consumer's `Release to Chrome Store` stub — create-package |
| [`chrome-extension-publish-store.yml`](chrome-extension-publish-store.yml) | the consumer stub — publish |
| [`chrome-extension-daily-release.yml`](chrome-extension-daily-release.yml) | the consumer stub — daily auto-release |
| [`deploy-privacy-page.yml`](deploy-privacy-page.yml) | the publish workflow above (privacy page); never called by a repo directly |

Composite actions (`../actions/`):

| Dir | Used by |
|---|---|
| [`../actions/read-release-config`](../actions/read-release-config) | all three release workflows |
| [`../actions/bump-extension-patch`](../actions/bump-extension-patch) | the daily-release workflow |
| [`../actions/report-failure`](../actions/report-failure) | every scheduled/reusable workflow here, and consumers directly |

The consumer stub that pins these lives at
[`packs/chrome-extension-release/stubs/chrome-extension-release.yml`](../../packs/chrome-extension-release/stubs/chrome-extension-release.yml);
the standard is [`packs/chrome-extension-release/RELEASE.md`](../../packs/chrome-extension-release/RELEASE.md).
