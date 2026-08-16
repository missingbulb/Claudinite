# chrome-extension pack

Active when a `manifest.json` declares `manifest_version` — the MV3 build/runtime gotchas that apply while you're *coding* an extension. Mostly prose (`RULES.md`); the gotchas with a static signature in the source are checks.

Releasing and Chrome-Web-Store publication are a separate, opt-in concern: the [`chrome-extension-release`](../chrome-extension-release/README.md) pack (its `RELEASE.md` standard + conformance checks), declared when the project is ready to ship.

## What the pack carries

The gotchas themselves live in [`RULES.md`](RULES.md), grouped by the surface each concerns —
service worker, content scripts, permissions and host access, sign-in and tokens, extension UI
surfaces, and introspecting a service worker over CDP. The index below is held against that prose by
`packs-tests/rule-index.test.mjs`, which is what makes a second listing safe here: an earlier
hand-kept one drifted into claiming a prose rule that never existed (#777).

## Rules (`RULES.md`)

| Rule | Words | Severity | Reason | How enforced |
|---|---|---|---|---|
| Handing a path to a Chrome API or fetch from an MV3 service worker | 68 | high | correctness | prose |
| Wanting import/export in extension code | 51 | medium | correctness | prose |
| Assembling a shared global from several injected content-script files | 51 | high | correctness | prose |
| Accumulating state in a file that is re-injected | 22 | high | correctness | prose |
| Loading ES module code into a content script | 118 | high | correctness | prose + check (`content-script-module-syntax`) |
| Adding an import to a content-script module | 30 | high | correctness | prose |
| Keeping that webaccessibleresources list correct | 29 | high | correctness | prose |
| Matching a host with chrome.events.UrlFilter | 63 | high | correctness | prose |
| Running a content script on arbitrary third-party pages without an install-time host warning | 60 | high | legal | prose |
| Starting the service worker when a runtime-granted permission is in play | 43 | medium | correctness | prose |
| A fetch to a host you listed failing in-browser | 42 | medium | correctness | prose |
| Reaching your own backend | 35 | medium | correctness | prose |
| Authenticating an extension to a JWT-validating backend | 83 | critical | correctness | prose |
| Refreshing a token silently | 28 | medium | correctness | prose |
| Refreshing silently with more than one account signed in | 41 | medium | correctness | prose |
| Storing a token | 38 | critical | correctness | prose |
| Wanting a token to survive a browser restart | 30 | medium | correctness | prose |
| Knowing whether your side panel is open | 37 | low | correctness | prose |
| Opening the side panel programmatically | 15 | medium | correctness | prose |
| Putting a menu on the toolbar icon itself | 30 | low | correctness | prose |
| Recreating those menu items on install or startup | 30 | medium | correctness | prose |
| Awaiting a chrome. callback API inside Runtime.evaluate | 34 | low | correctness | prose |
| Reading a worker value from an injected evaluate | 30 | low | correctness | prose |
| Attaching to a dormant worker | 39 | low | correctness | prose |

## Checks

| Check | Reported as | Severity | Reason | Enforces |
|---|---|---|---|---|
| `content-script-module-syntax` | blocking | high | correctness | a content script is a classic script, so its top-level `import` throws — prose in `RULES.md` too |
| `declarative-content-set-icon` | blocking | medium | correctness | a `declarativeContent.SetIcon` action supplies `imageData`, never `path` — carried by the check alone; the rule's whole account is its `why` and `fix` |
