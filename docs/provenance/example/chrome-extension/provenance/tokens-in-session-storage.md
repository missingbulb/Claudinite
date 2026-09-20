## 2026-07-11 · born · promoted from a member's local docs, one bullet with the restart rule (#222)
- **Source:** TLDR: extension storage is unencrypted.
- **Reason:** treat tokens as secrets at rest — the bearer or ID token in in-memory `chrome.storage.session`, cleared on browser exit; only non-secret identifiers such as the account email in `chrome.storage.local`.
- **Actor:** the growth-promote run, merged by @missingbulb (owner).
- **Mechanism:** prose.
- **Retire when:** Chrome encrypts `chrome.storage.local` at rest.
- **Landed:** #222 (Refs #99) · pack version 1.

## 2026-08-12 · split · the restart clause becomes its own rule, `token-across-restarts` (#775)
- **Actor:** @missingbulb (owner).
- **Landed:** #775 · pack version 2.
