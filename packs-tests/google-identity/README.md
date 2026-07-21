# google-identity pack

Declared for a backend that **validates Google Sign-In (Google Identity) ID tokens** — an API
Gateway JWT authorizer, or any OIDC verifier whose issuer is the Google accounts origin. No
reliable structural fingerprint, so it is declared by hand. **Prose-free:** the pack mounts the
[`google-id-token-validation`](../../skills/google-id-token-validation/SKILL.md) skill, whose
check-the-work rules run at every Stop and in CI — each failure message is the rule.

| Rule (≤5 words) | How enforced |
|---|---|
| Pin the validator audience | skill check `google-token-audience-pinned` |
| Client id: one origin | skill check `google-client-id-single-origin` (advisory) |
| Gate email on email_verified | skill check `google-token-email-verified` |

Scope: the **validator** side of Google auth. Obtaining the ID token in a browser/extension
client lives in the [`chrome-extension`](../chrome-extension/README.md) pack.

_Provenance: distilled from missingbulb/TLDR — its backend authenticates users with Google ID
tokens validated at an API Gateway JWT authorizer._
