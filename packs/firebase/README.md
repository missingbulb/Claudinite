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

The five always-on rules — what a session must know whether or not it opens a rules file or a
function:

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Admin-SDK code bypasses rules | critical | correctness | prose: 26 words |
| Identity comes from the verified token | critical | correctness | prose: 15 words |
| Validate inputs at the boundary | critical | correctness | prose: 39 words |
| Extract decision logic into pure modules | medium | complexity | prose: 26 words |
| Cross-language contracts get mirrored test vectors. | high | correctness | prose: 44 words |

The security-rules discipline (default-deny, merge semantics, absent-field guards, server-owned
fields, `request.time` pins, bounded strings, empirical rules tests) is the
[`firestore-security-rules`](skills/firestore-security-rules/SKILL.md) skill, forced for
`**/firestore.rules` and `**/storage.rules`; the function-side limits (transactional rate limits,
batch chunking, best-effort push, the entrypoint smoke-load) are
[`firebase-functions`](skills/firebase-functions/SKILL.md), forced for `functions/**`; and the
deploy layout (a self-contained project root, committed `.firebaserc` aliases) joins
[`create-release-plan`](skills/create-release-plan/SKILL.md), forced for `firebase.json` and
`.firebaserc`.

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `firebase/functions-node-pin` | high | correctness | check: blocking |
| `firebase/functions-predeploy-build` | high | correctness | check: blocking |

## Skills

| Skill | Trigger |
|---|---|
| [`firestore-security-rules`](skills/firestore-security-rules/SKILL.md) | any edit of `firestore.rules` or `storage.rules` — held by the guard until loaded |
| [`firebase-functions`](skills/firebase-functions/SKILL.md) | any edit under `functions/` — held by the guard until loaded |
| [`create-release-plan`](skills/create-release-plan/SKILL.md) | planning a release, splitting dev/prod, wiring prod config or App Check; any edit of `firebase.json` or `.firebaserc` — held by the guard until loaded |
