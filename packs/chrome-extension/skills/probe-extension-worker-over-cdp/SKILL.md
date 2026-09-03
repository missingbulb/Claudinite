---
name: probe-extension-worker-over-cdp
description: Introspecting an MV3 service worker over the Chrome DevTools Protocol — what Runtime.evaluate can await, exposing a value the probe reads, attaching to a dormant worker. Use when driving or probing an extension's service worker through CDP, from a headless-browser test or a debugging script.
---

# Introspecting a service worker over CDP

- **Awaiting a `chrome.*` callback API inside `Runtime.evaluate`** — don't: they don't reliably
  settle when awaited with `awaitPromise: true` (a hang with no internal timeout). Build the awaited
  signal from plain promises (`fetch`/`OffscreenCanvas`) instead.

- **Reading a worker value from an injected evaluate** — a bare top-level `function`/`const` isn't
  reachable from one, so expose what the probe reads as an explicit `globalThis.x = …`.

- **Attaching to a dormant worker** — poll for the global rather than reading it once immediately
  after attaching. A dormant worker has no globals until it re-runs its top level, and attaching to
  it is what starts that.
