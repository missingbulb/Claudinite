# Chrome extensions

> **Releasing, versioning, and Chrome Web Store publication are standardized** — before building
> or changing any release/publish machinery in an extension repo, read the
> [chrome-store-releases standard](skills/chrome-store-releases/SKILL.md) and copy its canonical
> workflows instead of re-deriving them.

## Service worker

- **Handing a path to a Chrome API or `fetch` from an MV3 service worker** (`importScripts`,
  `action.setIcon`) — make it extension-root absolute: a leading slash, or
  `chrome.runtime.getURL(...)`. A worker's relative paths resolve against the worker's **own** file
  location, not the extension root, and a bare relative path fails silently — it can abort the
  worker on import, or make an API call reject while the worker keeps running.

- **Wanting `import`/`export` in extension code** — MV3 loads ES modules natively; don't add a
  bundler just to use them. Declare the service worker `"type": "module"` and load page/side-panel
  scripts with `<script type="module">`; relative imports resolve within the packaged extension.
  Content scripts are the exception — they are classic scripts.

## Content scripts

- **Assembling a shared global from several injected content-script files** — **augment** it,
  never replace it: merge onto it (e.g. `Object.assign`), not `globalThis.X = {...}`. The files are
  re-injected into the page on every activation (e.g. every popup open), so replacing makes each
  newly-injected file wipe what earlier files already attached.

- **Accumulating state in a file that is re-injected** (e.g. a list a source pushes into) — reset
  it at load time.

## Permissions and host access

- **Matching a host with `chrome.events.UrlFilter`** — its host operators are **raw string
  matches, not domain-boundary matches**: `hostSuffix: "example.com"` also matches
  `evilexample.com`, and `declarativeContent`'s `PageStateMatcher.pageUrl` gates an action icon or
  page condition on exactly these filters. To mean *apex-or-any-subdomain*, combine
  `hostEquals: "example.com"` with `hostSuffix: ".example.com"` (the leading dot forces a label
  boundary); never gate a security- or origin-sensitive behavior on a bare `hostSuffix`.

- **A fetch to a host you listed failing in-browser** — `host_permissions` does not bypass CORS.
  Listing a host lets the extension's fetches *reach* it, but the server must still return CORS
  headers for the extension origin (`chrome-extension://<id>`) or the request fails.

- **Reaching your *own* backend** — don't add a `host_permissions` entry merely for that: if it
  already returns permissive CORS the fetch succeeds without one, and the entry only adds a scary
  install-time host-access warning.

## Extension UI surfaces

- **Knowing whether your side panel is open** — have the panel open a `Port` on load and read its
  connect/disconnect as open/closed. MV3 gives the side panel no is-open/close API, and an action
  popup suppresses `action.onClicked`.

- **Opening the side panel programmatically** — `chrome.sidePanel.open()` needs Chrome 116+, so
  raise `minimum_chrome_version` accordingly.

- **Putting a menu on the toolbar icon itself** — create it with
  `chrome.contextMenus.create({ contexts: ['action'], … })`; the `contextMenus` permission carries
  **no** install-time warning (unlike a broad host permission).

- **Recreating those menu items on install or startup** — call `contextMenus.removeAll()` first,
  so they self-heal instead of throwing on duplicate ids when the service worker re-runs its top
  level.
