# firebase pack

Active when the repo has `firebase.json`. Durable practices for building on Firebase — Firestore
security-rules discipline (merge semantics, server-owned fields, default-deny), callable Cloud
Function patterns (verified-token identity, validation, transactional rate limits, batched
fan-out), testing without live infrastructure (pure-logic extraction, the rules emulator when rules
themselves are under test), and deploy layout (predeploy build hooks, committed project aliases).
Mostly prose — the two mechanical halves of the deploy layout are checks. Earned in
missingbulb/ShoutsAndWhispers (Firestore + Functions + FCM + Google sign-in). Environment
separation and store gating are deliberately NOT here — that is the opt-in
[firebase-release](../firebase-release/README.md) pack.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| End every ruleset with an explicit catch-all deny | critical | correctness | prose: 24 words |
| Write rules against merge semantics, not just creates. | critical | correctness | prose: 45 words |
| Guard every field dereference for absence. | high | correctness | prose: 33 words |
| Server-owned fields are absent from the client-allowed key list | critical | correctness | prose: 27 words |
| Pin client timestamps to request.time | high | correctness | prose: 32 words |
| Bound every client-writable string/blob | high | correctness | prose: 17 words |
| Admin-SDK code bypasses rules | critical | correctness | prose: 26 words |
| Identity comes from the verified token, never the request body | critical | correctness | prose: 14 words |
| Validate inputs at the boundary like an adversary wrote them | critical | correctness | prose: 39 words |
| Rate limits need a transaction. | high | correctness | prose: 39 words |
| Chunk batched writes well under the 500-op limit | high | correctness | prose: 36 words |
| Push is best-effort by construction | medium | correctness | prose: 37 words |
| Extract decision logic into pure modules | medium | complexity | prose: 26 words |
| When rules themselves are under test, test them empirically | high | correctness | prose: 37 words |
| Cross-language contracts get mirrored test vectors. | high | correctness | prose: 44 words |
| Keep the Firebase project root self-contained | medium | complexity | prose: 71 words |
| Commit .firebaserc with named aliases and make the default the safe target | critical | correctness | prose: 31 words |
| Smoke-load the built entrypoint in the test lane | high | correctness | prose: 36 words + check (`firebase/functions-predeploy-build`) |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `firebase/functions-node-pin` | high | correctness | check: blocking |
| `firebase/functions-predeploy-build` | high | correctness | check: blocking |
