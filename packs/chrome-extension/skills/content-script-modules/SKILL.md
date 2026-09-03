---
name: content-script-modules
description: Loading ES module code into a Chrome content script — the classic loader with a dynamic import, and the web_accessible_resources list that must carry the module's whole import graph. Use when adding an import to a content script, or editing a manifest's content_scripts or web_accessible_resources.
metadata:
  force-load-on-file-edits-paths:
    - "**/manifest.json"
---

# ES modules in content scripts

- **Loading ES module code into a content script** — register a tiny **classic loader** whose only
  statement is a *dynamic* `import(chrome.runtime.getURL('…'))`. A **registered or static content
  script runs as a *classic* script — it can't be an ES module**:
  `chrome.scripting.registerContentScripts` and static `content_scripts` inject their files as
  classic scripts (there is no `type: 'module'` mode, unlike a page's `<script type="module">` or
  the module service worker), so a top-level `import` in one throws
  `Uncaught SyntaxError: Cannot use import statement outside a module` — **in the host page's
  console, not the extension's**. Dynamic `import()` is legal in a classic script, and the module it
  pulls in runs in the same content-script isolated world with the content-script `chrome.*` surface
  intact.

- **Adding an import to a content-script module** — list that module **and its whole transitive
  import graph** under `web_accessible_resources` (gated to the target origins), or the fetch is
  blocked.

- **Keeping that `web_accessible_resources` list correct** — have a test walk the import graph
  from the entry module, so a newly-added import can't silently fall out of the list.
