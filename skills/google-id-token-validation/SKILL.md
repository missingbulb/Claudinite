---
name: google-id-token-validation
description: Wiring server-side validation of Google Sign-In ID tokens — a JWT authorizer or OIDC verifier — and handling their claims. Use when adding or changing such validation; finish by running the checks, which carry the rules.
---

# Google ID-token validation

Wire the validator however the project dictates (an API Gateway JWT authorizer, a `jose`/`jsonwebtoken` verifier, a Cloud Function). The rules are not prose — they are this skill's checks, run at every Stop and in CI, each failure message being the instruction:

- `google-token-audience-pinned`
- `google-client-id-single-origin`
- `google-token-email-verified`

When the work is done, run the sweep (`node .claudinite/checks/run.mjs`; in Claudinite itself `node checks/run.mjs`) and fix what fires. Client-side token acquisition is the [`chrome-extension`](../../packs/chrome-extension/README.md) pack's turf.
