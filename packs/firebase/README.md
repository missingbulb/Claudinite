# firebase pack

Active when the repo has `firebase.json`. Durable practices for building on Firebase — Firestore
security-rules discipline (merge semantics, server-owned fields, default-deny), callable Cloud
Function patterns (verified-token identity, validation, transactional rate limits, batched
fan-out), testing without live infrastructure (pure-logic extraction, the rules emulator when rules
themselves are under test), and deploy layout (predeploy build hooks, committed project aliases).
Mostly prose — the two mechanical halves of the deploy layout are checks. Earned in
missingbulb/ShoutsAndWhispers (Firestore + Functions + FCM + Google sign-in).

Environment separation and store gating are the release standard, and load only when a project is
planning one: [create-release-plan](skills/create-release-plan/SKILL.md) — two fully separate
dev/prod projects with everything committed pointing at dev, prod config injected by the release
pipeline alone, and App Check attestation so only store-installed builds reach the prod backend.

> **Status: the release standard was decided ahead of first exercise.** Distilled from
> missingbulb/TLDR's worked AWS split and decided for Firebase in missingbulb/ShoutsAndWhispers;
> no project has run a release through it yet. Expect refinement — and conformance checks — when
> the first release exercises it.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| End every ruleset with catch-all deny | critical | correctness | prose: 24 words |
| Write rules against merge semantics | critical | correctness | prose: 45 words |
| Guard every field dereference for absence. | high | correctness | prose: 33 words |
| Server-owned fields stay off the client list | critical | correctness | prose: 27 words |
| Pin client timestamps to request.time | high | correctness | prose: 32 words |
| Bound every client-writable string/blob | high | correctness | prose: 17 words |
| Admin-SDK code bypasses rules | critical | correctness | prose: 26 words |
| Identity comes from the verified token | critical | correctness | prose: 14 words |
| Validate inputs at the boundary | critical | correctness | prose: 39 words |
| Rate limits need a transaction. | high | correctness | prose: 39 words |
| Chunk batched writes under the limit | high | correctness | prose: 36 words |
| Push is best-effort by construction | medium | correctness | prose: 37 words |
| Extract decision logic into pure modules | medium | complexity | prose: 26 words |
| Test the rules themselves empirically | high | correctness | prose: 37 words |
| Cross-language contracts get mirrored test vectors. | high | correctness | prose: 44 words |
| Keep the Firebase project root self-contained | medium | complexity | prose: 71 words |
| Commit .firebaserc with a safe default | critical | correctness | prose: 33 words |
| Smoke-load the built entrypoint | high | correctness | prose: 36 words + check (`firebase/functions-predeploy-build`) |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `firebase/functions-node-pin` | high | correctness | check: blocking |
| `firebase/functions-predeploy-build` | high | correctness | check: blocking |
