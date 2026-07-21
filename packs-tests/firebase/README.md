# firebase pack

Active when the repo has `firebase.json`. Durable practices for building on Firebase — Firestore
security-rules discipline (merge semantics, server-owned fields, default-deny), callable Cloud
Function patterns (verified-token identity, validation, transactional rate limits, batched
fan-out), testing without live infrastructure (pure-logic extraction, the rules emulator when rules
themselves are under test), and deploy layout (predeploy build hooks, committed project aliases).
Prose-only. Earned in missingbulb/ShoutsAndWhispers (Firestore + Functions + FCM + Google
sign-in). Environment separation and store gating are deliberately NOT here — that is the opt-in
[firebase-release](../firebase-release/README.md) pack.

## Prose (`RULES.md`) — by section

| Section (≤5 words) | How enforced |
|---|---|
| Rules are merge-aware, default-deny | prose (+ the project's rules tests) |
| Functions own identity and limits | prose |
| Test logic pure, rules empirically | prose (+ the project's suites) |
| Deploy layout and aliases | prose |
