## 2026-07-03 · born · promoted from a member's local docs (#108)
- **Source:** TLDR: its API Gateway JWT authorizer rejected the opaque OAuth access token `chrome.identity.getAuthToken` returns.
- **Reason:** a JWT authorizer needs a signed ID token with `iss` and `aud`: `launchWebAuthFlow` with `response_type=id_token` against a Web-application OAuth client, the `chromiumapp.org` redirect, scope `openid email profile`, the nonce verified, and the extension id pinned with a manifest `key` so the redirect URI stays fixed.
- **Actor:** the growth-promote run, merged by @missingbulb (owner).
- **Mechanism:** prose.
- **Retire when:** `chrome.identity.getAuthToken` returns a verifiable ID token.
- **Landed:** #108 (Refs #106), the pre-pack corpus.

## 2026-08-12 · reworded · the corpus adopts the trigger-first rule shape (#775)
- **Actor:** @missingbulb (owner).
- **Landed:** #775 · pack version 2.
