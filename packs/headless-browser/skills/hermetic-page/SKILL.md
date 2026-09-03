---
name: hermetic-page
description: Making a page render hermetically under a browser driver — the fake https origin fulfilled from disk, host-agnostic routing of vendored assets, fakes as init scripts, the two clock modes, stripping runtime-dependent scripts. Use when setting up or debugging a page's world for a headless run.
---

# Hermetic page

## The page's world is an input — replace all of it

- **Serve the page from a fake origin you fulfil from disk, and abort anything you did not
  name.** Intercepting at the browser needs no server process, no port and no free-port race,
  and it reaches *every* request the page makes rather than the ones an application-level mock
  happens to know about. Make the default arm an abort: a new external dependency then breaks
  the run loudly instead of quietly adding real network to a run meant to be hermetic.

- **Use an `https` fake origin.** Geolocation and several other capabilities exist only on a
  secure origin, and a page served over `http` silently takes the denied path instead. Routes
  are fulfilled before any connection is attempted, so no certificate is involved and nothing
  has to be trusted.

- **Route a vendored third-party asset host-agnostically.** A stylesheet you serve in place of a
  CDN copy still resolves *its own* relative URLs against the host it was served from, so the
  font or image files it references arrive addressed to that CDN. Match those follow-up requests
  on the path alone, on any host, or the sheet loads and every asset it names 404s — which
  renders as a silent fallback rather than an error.

- **Install every fake as an init script, so it runs before the page's first script.** A stub
  installed after load has already lost every call made during boot. Seeded randomness, storage
  seeds, and any API you are replacing all belong there.

- **Give the clock two modes and pick deliberately.** A fixed instant is right for a resting
  state. A requirement about what the *passage* of time changes needs the clock installed and
  paused instead, so the page's timers exist and can be wound forward on purpose — a fixed clock
  has no timers to advance.

## Pages that expect their runtime

- **Rendering a shipped page outside its runtime means removing the scripts that need that
  runtime.** They throw on the first missing global and populate nothing, so the capture is of
  an empty surface that looks like a product bug. Strip them after load and set the state you
  meant to show yourself.
