# firebase-release pack

The opt-in release standard for Firebase-backed apps: two fully separate projects with the
committed default pinned to dev, prod config injected only by the release pipeline, and — the part
provenance alone can't give — **App Check attestation** so only store-installed builds reach the
prod backend. Declared when a project approaches shipping, like
[chrome-extension-release](../chrome-extension-release/README.md).

> **Status: standard decided ahead of first exercise.** Distilled from missingbulb/TLDR's worked
> AWS split (account/stack/config/CI layers, its provenance-only gap explicitly noted) and decided
> for Firebase in missingbulb/ShoutsAndWhispers `docs/ENVIRONMENTS.md`; no project has run a
> release through it yet. Expect refinement — and conformance checks, mirroring
> chrome-extension-release's — when the first release exercises it.

## Prose (`RULES.md`) — by section

| Section (≤5 words) | How enforced |
|---|---|
| Committed default is dev, always | prose (+ guard tests at release) |
| Prod config is pipeline-injected | prose (+ release-workflow gate) |
| Attestation beats provenance | prose (App Check enforcement) |
| Promotion is deliberate, dev automatic | prose |
