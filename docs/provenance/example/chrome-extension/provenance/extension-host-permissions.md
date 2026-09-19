---
status: live
---

## 2026-07-11 · born · as one `RULES.md` rule, promoted from two members' local docs (#222)
- **Source:** gRatio and TLDR: running a content script on arbitrary sites without the install-time host warning, and a grant revoked from `chrome://extensions` out from under the worker.
- **Reason:** a static host permission for arbitrary origins is an install-time warning; `optional_host_permissions` plus `chrome.permissions.request()` inside a real user gesture plus `registerContentScripts()` avoids it, and the grant must be reconciled on every worker start because it can be revoked.
- **Actor:** automation `growth-promote`, merged by the owner.
- **Model:** unrecovered.
- **Mechanism:** prose.
- **Rejected:** none recorded.
- **Retire when:** Chrome grants a static `content_scripts` entry at runtime without the install-time warning.
- **Evidence:** #222 (Refs #99).

## 2026-08-12 · split · two rules: the runtime request, and the reconcile-on-start (#775)
- **Actor:** owner.
- **Evidence:** #775.

## 2026-09-05 · moved · both rules leave `RULES.md` for this skill, forced for any `manifest.json` edit (#1667)
- **Reason:** the audit's path-forced extractions: a rule leaves `RULES.md` for a skill only where a `force-load-on-file-edits-paths` covers every moment it is needed, and a manifest's permissions change is that moment; description-triggered skills stay prose. The guideline itself is recorded on claudinite-growth's `writing-pack-prose` element.
- **Actor:** owner.
- **Model:** trailer: Claude Fable 5.1.
- **Mechanism:** a skill with `force-load-on-file-edits-paths: **/manifest.json`; the description also names the moment for the model ("when a content script must run on arbitrary sites, or when editing a manifest's permissions").
- **Rejected:** leaving the two rules in `RULES.md`, paid by every session while relevant only when the manifest's permissions move.
- **Evidence:** #1667 (Refs #1662); VERSIONS.md 60903.6.
