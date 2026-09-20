## 2026-07-11 · born · as one `RULES.md` rule, promoted from two members' local docs (#222)
- **Source:** gRatio and TLDR: running a content script on arbitrary sites without the install-time host warning, and a grant revoked from `chrome://extensions` out from under the worker.
- **Reason:** a static host permission for arbitrary origins is an install-time warning; `optional_host_permissions` plus `chrome.permissions.request()` inside a real user gesture plus `registerContentScripts()` avoids it.
- **Actor:** the growth-promote run, merged by @missingbulb (owner).
- **Mechanism:** prose.
- **Retire when:** Chrome grants a static `content_scripts` entry at runtime without the install-time warning.
- **Landed:** #222 (Refs #99) · pack version 1.

## 2026-08-12 · split · the reconcile-on-start clause becomes `reconcile-grant-on-start` (#775)
- **Actor:** @missingbulb (owner).
- **Landed:** #775 · pack version 2.

## 2026-09-05 · moved · from `RULES.md` into the `extension-host-permissions` skill, whose file records why (#1667)
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose, now loaded only on a `manifest.json` edit; the trigger and the alternatives it beat are on the skill's file.
- **Landed:** #1667 (Refs #1662) · pack version 60903.6.
