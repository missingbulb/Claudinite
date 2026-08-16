# google-identity pack

Declared for a backend that **validates Google Sign-In (Google Identity) ID tokens** — an API
Gateway JWT authorizer, or any OIDC verifier whose issuer is the Google accounts origin. No
reliable structural fingerprint, so it is declared by hand. **Prose-free:** the pack mounts the
[`google-id-token-validation`](skills/google-id-token-validation/SKILL.md) skill, whose
check-the-work rules run at every Stop and in CI — each failure message is the rule.

Scope: the **validator** side of Google auth. Obtaining the ID token in a browser/extension
client lives in the [`chrome-extension`](../chrome-extension/README.md) pack.

_Provenance: distilled from missingbulb/TLDR — its backend authenticates users with Google ID
tokens validated at an API Gateway JWT authorizer._

## Checks

| Check | Reported as | Severity | Reason | Enforces |
|---|---|---|---|---|
| `google-token-audience-pinned` | blocking | critical | correctness | the validator pins the audience — every Google token shares the issuer, so without it any Google OAuth client's token authenticates |
| `google-token-email-verified` | blocking | critical | correctness | an email-gated action checks `email_verified`, not the bare `email` claim |
| `google-client-id-single-origin` | advisory | medium | correctness | one client id per origin, so a token's audience means what the validator assumes |
