# headless-browser pack

Active when the repo references a browser-automation driver in JS/TS source — a `playwright` /
`playwright-core` / `puppeteer` / `puppeteer-core` module specifier, or a `.launch(` call site.

Prose only: the pack carries no checks, and declaring it is the project's call.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Resolve binary, never download | high | correctness | prose: <200 words |
| Reinstalling the driver repeats the download danger | high | correctness | prose: <200 words |
| Stub an unvendored CDN library's API | medium | correctness | prose: <200 words |
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
a workflow are all deliberately not here.
