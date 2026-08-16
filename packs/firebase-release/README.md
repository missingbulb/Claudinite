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

## Rules (`RULES.md`)

| Rule | Words | Severity | Reason | How enforced |
|---|---|---|---|---|
| Two fully separate Firebase projects | 20 | critical | correctness | prose |
| Everything committed points at dev | 40 | critical | correctness | prose |
| Dev builds coexist with prod installs | 25 | medium | complexity | prose |
| Guard tests pin the contract | 31 | high | correctness | prose |
| The release workflow fails if any injected variable is unset | 43 | high | correctness | prose |
| Dev keeps the App Check debug provider | 59 | medium | correctness | prose |
