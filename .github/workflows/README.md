# `.github/workflows/` — three audiences in one directory

GitHub requires every workflow and composite action to live flat under `.github/`, so this repo's
own CI sits beside the release reusable workflows some consuming repos still reference `@main`.

## Retiring — the chrome-extension release plumbing is being vendored out

The four release reusable workflows + three composite actions below **exist solely for the
`chrome-extension-release` pack** and are on their way OUT of this core tree (#276). The pack now
holds them as templates ([`packs/chrome-extension-release/stubs/`](../../packs/chrome-extension-release/stubs/)),
and the `chrome-release-vendoring` migration vendors the full set into each consumer's own
`.github/` — so a consumer runs the whole pipeline locally, with **no** cross-repo `@main`
dependency. Once the fleet census confirms every consumer has vendored (0 repos on the `@main`
shape), it **auto-deletes** these files here as part of migration retirement (needs the FLEET token
granted Contents-write on this repo — #239). Until then they remain the `@main` API for the
consumers baselining hasn't reached yet, so while any survive, the frozen-API rule still holds:
renaming or removing one by hand breaks an un-migrated consumer's pipeline — let the migration
retire them. Any *other* rename here is the two-phase migration in
[../../consumer-safe-changes.md](../../consumer-safe-changes.md), never a one-shot.

## Repo CI — runs only here

| File | Purpose |
|---|---|
| [`checks-ci.yml`](checks-ci.yml) | This repo's own unit tests + conformance sweep (`pull_request`, `push` to `main`). |

## Fleet orchestration — runs only here

| File | Purpose |
|---|---|

## Transitional `@main` API — un-migrated consumers still depend on these; let the migration retire them

Reusable workflows (`workflow_call` only — they never run in Claudinite itself):

| File | Called by (pre-vendoring) |
|---|---|
| [`chrome-extension-release.yml`](chrome-extension-release.yml) | the consumer's `Release to Chrome Store` orchestrator — create-package (vendored as `chrome-extension-create-package.yml`) |
| [`chrome-extension-publish-store.yml`](chrome-extension-publish-store.yml) | the consumer orchestrator — publish |
| [`chrome-extension-daily-release.yml`](chrome-extension-daily-release.yml) | the consumer orchestrator — daily auto-release |
| [`deploy-privacy-page.yml`](deploy-privacy-page.yml) | the publish workflow above (privacy page); never called by a repo directly |

Composite actions (`../actions/`):

| Dir | Used by |
|---|---|
| [`../actions/read-release-config`](../actions/read-release-config) | all three release workflows |
| [`../actions/bump-extension-patch`](../actions/bump-extension-patch) | the daily-release workflow |
| [`../actions/report-failure`](../actions/report-failure) | every scheduled/reusable workflow here, and consumers directly |

The vendored templates that supersede these live under
[`packs/chrome-extension-release/stubs/`](../../packs/chrome-extension-release/stubs/) (the
orchestrator at [`packs/chrome-extension-release/stubs/workflows/chrome-extension-release.yml`](../../packs/chrome-extension-release/stubs/workflows/chrome-extension-release.yml));
the standard is [`packs/chrome-extension-release/RELEASE.md`](../../packs/chrome-extension-release/RELEASE.md).
