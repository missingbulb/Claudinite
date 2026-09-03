# Headless browser

## Getting a browser

- **Resolve the binary out of the environment; never let the driver download one.** A container
  or runner image that already ships a browser is the normal case, and the driver's own registry
  download is slow, often blocked, and pins a build you did not choose. Look for an explicit
  override variable first, then the image's browser root, then fall through to the driver's own
  resolution — and prefer the driver's `-core` package, which bundles no browser at all. The
  image's build number need not match the driver's own pin for the browser to launch. Never
  hardcode the version-stamped path you found by looking: it moves with the next image, and the
  failure lands on whoever rebuilds rather than on whoever wrote it.

- **A fresh install of the driver package is the same danger from upstream.** Reinstalling the
  package to fix an import error just as easily resolves to a newer release than the one paired
  with the environment's pinned browser — it then hunts for a browser build the image was never
  given and fails asking for a network install the sandbox cannot make. A reinstall run from the
  repo root instead of a scratchpad can dodge that failure outright (a version happens to
  resolve that works) and still cost you: it dirties the tracked `package.json`, its lockfile and
  `node_modules`, which then need a manual revert before anything can be committed. Resolve the
  already-installed package by its global path instead of adding a second copy, at any depth in
  the tree.

- **When a page depends on a third-party library loaded from a CDN you have not vendored,
  stub the library's own API surface rather than trying to make the CDN reachable.** A default
  network abort leaves the page's global for that library undefined, so every call into it
  throws and the render comes back empty — indistinguishable from a product bug unless you
  know the cause. Grep the code under test for the handful of calls it actually makes (a mapping
  or charting library often boils down to a handful of constructors and methods) and install a
  minimal no-op implementation of just those as an init script, before the page's own scripts run.

## The page's world is an input — replace all of it

- **Know which knobs are fixed at context creation and which are per page.** Locale, timezone,
  viewport, device scale factor, geolocation and permissions belong to the browser *context* and
  cannot be changed once it exists — so proving that a product reads a fixed zone rather than
  the device's takes **two** contexts, not one page reconfigured twice. The clock, seeded
  randomness and injected scripts are per page.

- **A command-line window-size flag is not a viewport — a narrow one does not test the narrow
  layout.** Ask a browser's *CLI* for a phone-sized window and it renders the page at a clamped
  width and crops the overflow, without applying the media queries the width should have
  triggered. The output looks exactly like a horizontal-overflow bug in every section of a page
  that has none, and the instinct is to go hunting through the CSS for the offender. Only a
  context or page created with an explicit viewport puts the page in that layout. Reserve the
  CLI screenshot for the width the window happens to be, and give it a virtual-time budget that
  outlasts the page's entrance animations, or sections capture mid-transition and read as broken
  when they are fine.

## Capturing

- **Wait on something the page itself produces, never on the network going quiet.** A selector
  that only exists once data rendered, or text that only appears once an async read returned, is
  a real signal; "no requests for a moment" is a guess that is wrong in both directions. Await
  font readiness too — text laid out before the fonts land is a different image.

- **Launch once and reuse the browser across captures.** Process startup dominates the cost of a
  capture, so a fresh browser per shot turns a fast run into a slow one for nothing; take a new
  context or page per capture instead, and close it, so no state leaks between them.
