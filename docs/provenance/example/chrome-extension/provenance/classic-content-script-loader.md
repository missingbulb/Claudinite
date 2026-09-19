---
covers:
  - rule: RULES.md — Loading ES module code into a content script
  - check: content-script-module-syntax
status: live
---

## 2026-07-17 · born · promoted from a member's local pack (#309)
- **Source:** TLDR's local pack: a content script written as an ES module never ran, and the only error was in the host page's console.
- **Reason:** a registered or static content script is injected as a classic script — there is no module mode for `content_scripts` or `registerContentScripts` — so a top-level `import` throws `Cannot use import statement outside a module` where the developer's own devtools never show it. The remedy is a classic loader whose only statement is a dynamic `import(chrome.runtime.getURL(…))`, with the module and its whole import graph under `web_accessible_resources`.
- **Actor:** automation `growth-promote`, merged by the owner.
- **Model:** unrecovered.
- **Mechanism:** prose, at the time.
- **Rejected:** none recorded.
- **Retire when:** Chrome adds a module mode for static or registered content scripts.
- **Evidence:** #309 (Refs #99).

## 2026-07-30 · converted · the classic-script half becomes the blocking check `content-script-module-syntax` (#578)
- **Reason:** a static `import`/`export` in a file the manifest injects is a signature in the artifact. Parsed, not grepped: the judged file set comes from the manifest's `content_scripts` `js` arrays and from `registerContentScripts` calls, never every source file, because module syntax is correct everywhere else in an extension; comments are stripped and string contents blanked before judging; dynamic `import(…)` and `import.meta` are excluded by construction.
- **Actor:** owner, in an attended prose-to-checks pass.
- **Model:** trailer: Claude.
- **Mechanism:** a coded world-scope check, since the file set is derived from a parsed manifest. Deletion test applied to the prose: it stays whole, because the paragraph also carried the `web_accessible_resources` half the check does not enforce.
- **Rejected:** grepping every source file for `^import` (flags the whole codebase).
- **Evidence:** #578 (Refs #572); three violating fixtures red when the rule is neutered, four false-positive guards green.

## 2026-08-12 · split · the `web_accessible_resources` half becomes two rules of its own (#775)
- **Reason:** the trigger-first pass gives "Adding an import to a content-script module" and "Keeping that `web_accessible_resources` list correct" their own bullets; this element keeps the loader and the check.
- **Actor:** owner.
- **Evidence:** #775.

## 2026-08-23 · moved · the rule module moves under `worldRules/`, discovered by directory (#1248)
- **Actor:** owner.
- **Evidence:** #1248.
