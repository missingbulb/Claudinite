---
name: google-id-token-validation
description: Wiring server-side validation of Google Sign-In ID tokens — a JWT authorizer or OIDC verifier — and handling their claims. Use when adding or changing such validation.
---

# Google ID-token validation

Wire the validator however the project dictates (an API Gateway JWT authorizer, a `jose`/`jsonwebtoken` verifier, a Cloud Function). Client-side token acquisition is the [`chrome-extension`](../../packs-tests/chrome-extension/README.md) pack's turf.
