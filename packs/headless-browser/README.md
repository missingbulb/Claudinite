# headless-browser pack

Active when the repo references a browser-automation driver in JS/TS source — a `playwright` /
`playwright-core` / `puppeteer` / `puppeteer-core` module specifier, or a `.launch(` call site.
Scanning source rather than a dependency manifest is deliberate: a repo can drive a browser its
environment image already installs, with no dependency entry anywhere to find.

Prose only. Every rule is a runtime browser behaviour or a judgment about a harness's shape,
neither of which has a repo-state signature a check could read without asserting that a
particular call still exists — the shape the corpus rejects outright.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Resolve binary, never download | high | correctness | prose: <200 words |
| Reinstalling the driver repeats the download danger | high | correctness | prose: <200 words |
| Stub an unvendored CDN library's API | medium | correctness | prose: <200 words |
| Vendor a CDN asset via curl | medium | correctness | prose: <200 words |
| Pin the build for pixels | high | correctness | prose: <100 words |
| Zero-diff costs whole recipe | medium | correctness | prose: <100 words |
| Fake origin, abort by default | high | correctness | prose: <100 words |
| `https` origin for geolocation | medium | correctness | prose: <50 words |
| Route vendored assets host-agnostically | medium | correctness | prose: <100 words |
| Context knobs vs page knobs | medium | correctness | prose: <100 words |
| Window-size flag isn't a viewport | high | correctness | prose: <200 words |
| Fakes as init scripts | high | correctness | prose: <50 words |
| CSS freeze misses `element.animate` | high | correctness | prose: <50 words |
| Two clock modes | medium | correctness | prose: <100 words |
| Font jail, not just webfonts | high | correctness | prose: <200 words |
| Reproducible rasterisation flags | high | correctness | prose: <100 words |
| Wait on the page's signal | high | correctness | prose: <100 words |
| Clip, don't screenshot the element | medium | correctness | prose: <100 words |
| Bounding boxes go stale | medium | correctness | prose: <100 words |
| Whole-pixel clips | medium | correctness | prose: <100 words |
| Strip scripts needing the runtime | medium | correctness | prose: <100 words |
| One browser, many contexts | medium | performance | prose: <100 words |

## Boundary

This pack is the browser itself. Which engine a UI golden should use, the tolerance it may carry,
self-skipping where no browser is present, the re-baselining approval gate, and wiring the run into
a workflow are all deliberately not here — the "zero-diff costs the whole recipe" rule is written to
complement that testing guidance rather than restate or contradict it.

Provenance: distilled from three fleet members that drive a browser from code, independently and
for different reasons. `missingbulb/EdFringeNow` — a pinned-Chromium visual-requirements harness:
fake-origin routing, the font jail, rasterisation flags, clip and bounding-box mechanics.
`missingbulb/CrosswordChat` — browser rasterisation for both goldens and generated build
artifacts: environment binary resolution, stripping runtime-dependent scripts.
`missingbulb/ClaudiniteWebsite` — an interactive responsive check: the window-size-is-not-a-
viewport footgun and the virtual-time budget. The first two solved the cross-machine rendering
problem two different ways, which is what the pinning rules carry.
`missingbulb/EdFringeAllocator` holds a vestigial fourth instance in a retired prototype.
