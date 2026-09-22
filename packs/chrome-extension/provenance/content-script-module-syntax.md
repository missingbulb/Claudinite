## 2026-07-17 · born · promoted from a member's local pack (#309)
- **Source:** TLDR's local pack: a content script written as an ES module never ran, and the only error was in the host page's console.
- **Reason:** a registered or static content script is injected as a classic script - there is no module mode for `content_scripts` or `registerContentScripts` - so a top-level `import` throws `Cannot use import statement outside a module` where the developer's own devtools never show it. The remedy is a classic loader whose only statement is a dynamic `import(chrome.runtime.getURL(…))`, with the module and its whole import graph under `web_accessible_resources`.
- **Actor:** the growth-promote run, merged by @missingbulb (owner).
- **Mechanism:** prose, at the time.
- **Retire when:** Chrome adds a module mode for static or registered content scripts.
- **Landed:** #309 (Refs #99) · pack version 1.

## 2026-07-30 · converted · the classic-script half becomes the blocking check `content-script-module-syntax` (#578)
- **Reason:** a static `import`/`export` in a file the manifest injects is a signature in the artifact, and the failure it catches is silent to the developer.
- **Actor:** @missingbulb (owner), in an attended prose-to-checks pass.
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a coded world-scope check, blocking because the script never runs at all. Parsed, not grepped: the judged file set comes from the manifest's `content_scripts` `js` arrays and from `registerContentScripts` calls, never every source file, because module syntax is correct everywhere else in an extension; comments are stripped and string contents blanked before judging; dynamic `import(…)` and `import.meta` are excluded by construction. Coded rather than declared because the file set is derived from a parsed manifest. Deletion test applied to the prose: it stays whole, because the paragraph also carried the `web_accessible_resources` half the check does not enforce.
- **Rejected:** grepping every source file for `^import` (flags the whole codebase).
- **Landed:** #578 (Refs #572) · pack version 1; three violating fixtures red when the rule is neutered, four false-positive guards green.

## 2026-08-12 · split · the `web_accessible_resources` half becomes two rules of its own (#775)
- **Reason:** the trigger-first pass gives "Adding an import to a content-script module" and "Keeping that `web_accessible_resources` list correct" their own bullets; this element keeps the loader and the check.
- **Actor:** @missingbulb (owner).
- **Landed:** #775 · pack version 2.

## 2026-08-23 · moved · the rule module moves under `worldRules/`, discovered by directory (#1248)
- **Mechanism:** placement declares scope - a module under `worldRules/` is a world-scope check and needs no manifest entry, so the manifest stops restating its tree and a check cannot be listed under the wrong scope.
- **Actor:** @missingbulb (owner).
- **Landed:** #1248 · pack version 60822.1.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
