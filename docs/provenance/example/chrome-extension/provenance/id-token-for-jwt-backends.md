---
covers:
  - rule: RULES.md — Authenticating an extension to a JWT-validating backend
status: live
---

## 2026-07-03 · born · promoted from a member's local docs (#108)
- **Source:** TLDR: its API Gateway JWT authorizer rejected the opaque OAuth access token `chrome.identity.getAuthToken` returns.
- **Reason:** a JWT authorizer needs a signed ID token with `iss` and `aud`: `launchWebAuthFlow` with `response_type=id_token` against a Web-application OAuth client, the `chromiumapp.org` redirect, scope `openid email profile`, the nonce verified, and the extension id pinned with a manifest `key` so the redirect URI stays fixed.
- **Actor:** automation `growth-promote`, merged by the owner.
- **Model:** unrecovered.
- **Mechanism:** prose.
- **Rejected:** none recorded.
- **Retire when:** `chrome.identity.getAuthToken` returns a verifiable ID token.
- **Evidence:** #108 (Refs #106).

## 2026-08-12 · reworded · the corpus adopts the trigger-first rule shape (#775)
- **Actor:** owner.
- **Evidence:** #775.
