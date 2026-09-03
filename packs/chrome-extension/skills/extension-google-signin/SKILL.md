---
name: extension-google-signin
description: Signing a Chrome extension in with Google and handling the token it gets back — the ID-token flow a JWT-validating backend accepts, silent refresh, several signed-in accounts, storing a token, surviving a browser restart. Use when adding or debugging sign-in, token refresh or token storage in an extension.
---

# Google sign-in from a Chrome extension

- **Authenticating an extension to a JWT-validating backend** (an API Gateway JWT authorizer, any
  OIDC-validating server) — obtain a Google **ID token** with `chrome.identity.launchWebAuthFlow`
  (`response_type=id_token`) against a Google Cloud OAuth client of type **Web application**,
  redirect to `https://<extension-id>.chromiumapp.org/` (from `chrome.identity.getRedirectURL()`),
  scope `openid email profile`, and **verify the returned `nonce`**. Pin the extension id with a
  manifest `key` so the redirect URI stays fixed. Do **not** use `chrome.identity.getAuthToken` —
  it returns an opaque OAuth *access* token (no verifiable signature/`iss`/`aud`) that a JWT
  authorizer rejects.

- **Refreshing a token silently** (`launchWebAuthFlow({interactive:false})`) — request
  `prompt=none`. `prompt=consent` always needs interaction and therefore always fails silently —
  reserve it (or omit `prompt`) for the interactive fallback.

- **Refreshing silently with more than one account signed in** — pass the remembered account's
  email as `login_hint`; otherwise the provider can't tell which session to reuse and forces an
  interactive account-picker. Persist the non-secret email from the first successful sign-in.

- **Storing a token** — extension storage is unencrypted, so treat tokens as secrets at rest: keep
  the bearer/ID token in in-memory `chrome.storage.session` (cleared on browser exit) and persist
  only non-secret identifiers (e.g. the account email) to `chrome.storage.local`.

- **Wanting a token to survive a browser restart** — re-run the silent flow; don't switch to a
  refresh-token flow just for that, which puts a longer-lived credential on disk.
