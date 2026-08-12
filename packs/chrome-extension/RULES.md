# Chrome extensions

Portable, project-agnostic practices for building Chrome (and Chromium) extensions — manifest
versions, background/service workers, content scripts, permissions, packaging and store review —
true for any extension read cold.

> **Releasing, versioning, and Chrome Web Store publication are standardized** — before building
> or changing any release/publish machinery in an extension repo, read the
> [chrome-extension-release standard](../chrome-extension-release/RELEASE.md) (its pack, declared
> when you're ready to ship) and copy its canonical workflows instead of re-deriving them.

- **Handing a path to a Chrome API or `fetch` from an MV3 service worker** (`importScripts`,
  `action.setIcon`) — make it extension-root absolute: a leading slash, or
  `chrome.runtime.getURL(...)`. Relative paths resolve against the worker's own file, not the
  extension root, and a bare one fails silently — aborting the worker on import, or rejecting the
  call while the worker runs on.

- **Matching hosts with `chrome.events.UrlFilter`** — its host operators are raw string matches,
  not domain-boundary matches, so `hostSuffix: "example.com"` also matches `evilexample.com`. For
  apex-or-any-subdomain, combine `hostEquals: "example.com"` with `hostSuffix: ".example.com"`;
  never gate a security- or origin-sensitive behavior on a bare `hostSuffix`. `declarativeContent`'s
  `PageStateMatcher.pageUrl` gates on exactly these filters.

- **Assembling a shared global across injected content-script files** — augment it
  (`Object.assign`), never replace it with `globalThis.X = {...}`; the files are re-injected on
  every activation, so a replacement wipes what earlier files already attached.

- **State a content-script file accumulates across injections** (a list a source pushes into) —
  reset it at load time.

- **Awaiting a `chrome.*` callback API over CDP inside a service worker** — build the awaited
  signal from plain promises (`fetch`, `OffscreenCanvas`) instead; `chrome.*` callbacks don't
  reliably settle under `awaitPromise: true`, and the hang has no internal timeout.

- **Reading a value from an injected CDP evaluate** — expose it as an explicit
  `globalThis.x = …`; a bare top-level `function` or `const` isn't reachable from the evaluate.

- **Attaching to a dormant MV3 service worker** — poll for the global rather than read it once. A
  dormant worker has no globals until it re-runs its top level, and attaching is what starts that.

- **Authenticating an extension to a JWT-validating backend** (an API Gateway JWT authorizer, any
  OIDC-validating server) — obtain a Google **ID token** with `chrome.identity.launchWebAuthFlow`
  (`response_type=id_token`) against an OAuth client of type **Web application**, redirect to
  `https://<extension-id>.chromiumapp.org/` (from `chrome.identity.getRedirectURL()`), scope
  `openid email profile`, and verify the returned `nonce`. Don't use `chrome.identity.getAuthToken`
  — it returns an opaque OAuth *access* token, which a JWT authorizer rejects.

- **Pinning that redirect URI** — set a manifest `key` so the extension id stays fixed.

- **Reaching for a bundler to use `import`/`export`** — MV3 loads ES modules natively, so don't.
  Declare the service worker `"type": "module"` and load page or side-panel scripts with
  `<script type="module">`; relative imports resolve within the packaged extension.

- **Requesting a silent token refresh** (`launchWebAuthFlow({interactive:false})`) — pass
  `prompt=none`. `prompt=consent` always needs interaction and so always fails silently; reserve it,
  or omitting `prompt`, for the interactive fallback.

- **Refreshing silently with more than one account signed in** — pass the remembered account's
  email as `login_hint`, or the provider can't tell which session to reuse and forces an interactive
  account-picker. Persist that non-secret email from the first successful sign-in.

- **Storing a token in an extension** — extension storage is unencrypted, so treat tokens as
  secrets at rest: keep the bearer or ID token in `chrome.storage.session`, cleared on browser exit,
  and persist only non-secret identifiers to `chrome.storage.local`.

- **Wanting a token to survive a browser restart** — re-run the silent flow rather than switch to
  a refresh-token flow, which puts a longer-lived credential on disk.

- **Running a content script on arbitrary third-party pages without an install-time host warning**
  — declare the origins under `optional_host_permissions` plus the silent `scripting` permission,
  call `chrome.permissions.request()` synchronously inside a real foreground user gesture (Chrome
  rejects it from a service-worker message handler), then register the script with
  `chrome.scripting.registerContentScripts()` — never a static `content_scripts` entry.

- **Starting the service worker after using a runtime host grant** — reconcile your stored
  enabled-flag against the permission actually granted, and re-register or clean up to match; the
  grant can be revoked from `chrome://extensions` out from under you.

- **Needing to know whether your side panel is open** — have the panel open a `Port` on load and
  read its connect/disconnect as open/closed. MV3 gives the panel no is-open/close API, and an
  action popup suppresses `action.onClicked`.

- **Opening the side panel programmatically** — `chrome.sidePanel.open()` needs Chrome 116+, so
  raise `minimum_chrome_version` to match.

- **Fetching a host listed in `host_permissions`** — the entry does not bypass CORS. It lets the
  fetch *reach* the host, but the server must still return CORS headers for the extension origin
  (`chrome-extension://<id>`) or the request fails in-browser.

- **Adding a `host_permissions` entry to reach your own backend** — don't, if it already returns
  permissive CORS: the fetch succeeds without it, and the entry only adds a scary install-time
  host-access warning.

- **Putting module code in a content script** — a registered or static content script runs as a
  *classic* script, so a top-level `import` throws `Cannot use import statement outside a module`,
  and it surfaces **in the host page's console, not the extension's**. Register a tiny classic
  loader whose only statement is a *dynamic* `import(chrome.runtime.getURL('…'))`; the module it
  pulls in runs in the same isolated world with the content-script `chrome.*` surface intact.

- **Listing that module under `web_accessible_resources`** — include its whole transitive import
  graph, gated to the target origins, or the fetch is blocked.

- **Keeping that resource list correct** — have a test walk the import graph from the entry
  module, so a newly-added import can't silently fall out of the list.

- **Putting a menu on the toolbar icon itself** — create it with
  `chrome.contextMenus.create({ contexts: ['action'], … })`; the `contextMenus` permission carries
  no install-time warning, unlike a broad host permission.

- **Recreating those menu items on install or startup** — call `contextMenus.removeAll()` first,
  so they self-heal instead of throwing on duplicate ids when the service worker re-runs its top
  level.
