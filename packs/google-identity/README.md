# google-identity pack

Declared for a backend that **validates Google Sign-In (Google Identity) ID tokens** — an API Gateway
JWT authorizer, or any OIDC verifier whose issuer is `https://accounts.google.com`. No reliable
structural fingerprint (the signal is an OIDC issuer inside an authorizer/verifier config, with no
canonical filename), so it is declared by hand. Prose-only.

Scope: the **validator** side of Google auth. Obtaining the ID token in a browser/extension client
(`chrome.identity.launchWebAuthFlow`, `prompt=none`, `login_hint`, token-at-rest) lives in the
[`chrome-extension`](../chrome-extension/README.md) pack.

## Prose (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| Pin the validator audience | prose |
| Client id == audience, one value | prose |
| Trust email only if email_verified | prose |

_Provenance: distilled from missingbulb/TLDR — its backend (`server/template.yaml` Google JWT
authorizer, `server/src/handler.mjs` claim checks, `extension/config.mjs` + `server/README.md` client-id
wiring) authenticates users with Google ID tokens validated at an API Gateway JWT authorizer._
