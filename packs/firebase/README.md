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

| Rule | Words | Severity | Reason | How enforced |
|---|---|---|---|---|
| End every ruleset with an explicit catch-all deny | 24 | critical | correctness | prose |
| Write rules against merge semantics, not just creates. | 45 | critical | correctness | prose |
| Guard every field dereference for absence. | 33 | high | correctness | prose |
| Server-owned fields are absent from the client-allowed key list | 27 | critical | correctness | prose |
| Pin client timestamps to request.time | 32 | high | correctness | prose |
| Bound every client-writable string/blob | 17 | high | correctness | prose |
| Admin-SDK code bypasses rules | 26 | critical | correctness | prose |
| Identity comes from the verified token, never the request body | 14 | critical | correctness | prose |
| Validate inputs at the boundary like an adversary wrote them | 39 | critical | correctness | prose |
| Rate limits need a transaction. | 39 | high | correctness | prose |
| Chunk batched writes well under the 500-op limit | 36 | high | correctness | prose |
| Push is best-effort by construction | 37 | medium | correctness | prose |
| Extract decision logic into pure modules | 26 | medium | complexity | prose |
| When rules themselves are under test, test them empirically | 37 | high | correctness | prose |
| Cross-language contracts get mirrored test vectors. | 44 | high | correctness | prose |
| Keep the Firebase project root self-contained | 71 | medium | complexity | prose |
| Commit .firebaserc with named aliases and make the default the safe target | 31 | critical | correctness | prose |
| Smoke-load the built entrypoint in the test lane | 36 | high | correctness | prose + check (`firebase/functions-predeploy-build`) |

## Checks

| Check | Reported as | Severity | Reason | Enforces |
|---|---|---|---|---|
| `firebase/functions-node-pin` | blocking | high | correctness | the functions runtime is pinned, so a Google-side default bump cannot change what the deployed code runs on |
| `firebase/functions-predeploy-build` | blocking | high | correctness | a build runs before deploy, so the deployed bundle is the committed source |
