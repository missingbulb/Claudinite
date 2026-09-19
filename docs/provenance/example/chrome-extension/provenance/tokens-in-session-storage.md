---
covers:
  - rule: RULES.md — Storing a token
status: live
---

## 2026-07-11 · born · promoted from a member's local docs, one bullet with the restart rule (#222)
- **Source:** TLDR: extension storage is unencrypted.
- **Reason:** treat tokens as secrets at rest — the bearer or ID token in in-memory `chrome.storage.session`, cleared on browser exit; only non-secret identifiers such as the account email in `chrome.storage.local`.
- **Actor:** automation `growth-promote`, merged by the owner.
- **Model:** unrecovered.
- **Mechanism:** prose.
- **Rejected:** none recorded.
- **Retire when:** Chrome encrypts `chrome.storage.local` at rest.
- **Evidence:** #222 (Refs #99).

## 2026-08-12 · split · the restart clause becomes its own rule, `wanting-token-survive-browser-restart` (#775)
- **Actor:** owner.
- **Evidence:** #775.
