# firebase-release pack

The opt-in release standard for Firebase-backed apps: two fully separate projects with the
committed default pinned to dev, prod config injected only by the release pipeline, and — the part
provenance alone can't give — **App Check attestation** so only store-installed builds reach the
prod backend. Declared when a project approaches shipping.

> **Status: standard decided ahead of first exercise.** Distilled from missingbulb/TLDR's worked
> AWS split (account/stack/config/CI layers, its provenance-only gap explicitly noted) and decided
> for Firebase in missingbulb/ShoutsAndWhispers `docs/ENVIRONMENTS.md`; no project has run a
> release through it yet. Expect refinement — and conformance checks — when the first release
> exercises it.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Two fully separate Firebase projects | critical | correctness | prose: 20 words |
| Everything committed points at dev | critical | correctness | prose: 40 words |
| Dev builds coexist with prod installs | medium | complexity | prose: 25 words |
| Guard tests pin the contract | high | correctness | prose: 31 words |
| The release fails on an unset variable | high | correctness | prose: 43 words |
| Dev keeps the App Check debug provider | medium | correctness | prose: 59 words |
