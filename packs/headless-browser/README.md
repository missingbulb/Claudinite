# headless-browser pack

Active when the repo references a browser-automation driver in JS/TS source — a `playwright` /
`playwright-core` / `puppeteer` / `puppeteer-core` module specifier, or a `.launch(` call site.
Scanning source rather than a dependency manifest is deliberate: a repo can drive a browser its
environment image already installs, with no dependency entry anywhere to find.

Prose only. Every rule is a runtime browser behaviour or a judgment about a harness's shape,
neither of which has a repo-state signature a check could read without asserting that a
particular call still exists — the shape the corpus rejects outright.

## Prose (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| Resolve binary, never download | prose |
| Pin the build for pixels | prose |
| Zero-diff costs whole recipe | prose |
| Fake origin, abort by default | prose |
| `https` origin for geolocation | prose |
| Route vendored assets host-agnostically | prose |
| Context knobs vs page knobs | prose |
| Window-size flag isn't a viewport | prose |
| Fakes as init scripts | prose |
| CSS freeze misses `element.animate` | prose |
| Two clock modes | prose |
| Font jail, not just webfonts | prose |
| Reproducible rasterisation flags | prose |
| Wait on the page's signal | prose |
| Clip, don't screenshot the element | prose |
| Bounding boxes go stale | prose |
| Whole-pixel clips | prose |
| Strip scripts needing the runtime | prose |
| One browser, many contexts | prose |

## Boundary

The [writing-tests](../basics/skills/writing-tests/SKILL.md) skill owns which engine a UI golden
should use, the tolerance a browser golden may carry, self-skipping where no browser is present,
and the re-baselining approval gate — this pack restates none of it, and its "zero-diff costs the
whole recipe" rule is written to complement that guidance rather than contradict it.
[github-actions](../github-actions/) owns wiring the run into a workflow.

Provenance: distilled from three fleet members that drive a browser from code, independently and
for different reasons. `missingbulb/EdFringeNow` — a pinned-Chromium visual-requirements harness:
fake-origin routing, the font jail, rasterisation flags, clip and bounding-box mechanics.
`missingbulb/CrosswordChat` — browser rasterisation for both goldens and generated build
artifacts: environment binary resolution, stripping runtime-dependent scripts.
`missingbulb/ClaudiniteWebsite` — an interactive responsive check: the window-size-is-not-a-
viewport footgun and the virtual-time budget. The first two solved the cross-machine rendering
problem two different ways, which is what the pinning rules carry.
`missingbulb/EdFringeAllocator` holds a vestigial fourth instance in a retired prototype.
