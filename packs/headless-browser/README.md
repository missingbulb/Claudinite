# headless-browser pack

Active when the repo references a browser-automation driver in JS/TS source — a `playwright` /
`playwright-core` / `puppeteer` / `puppeteer-core` module specifier, or a `.launch(` call site.
Scanning source rather than a dependency manifest is deliberate: a repo can drive a browser its
environment image already installs, with no dependency entry anywhere to find.

Prose only. Every rule is a runtime browser behaviour or a judgment about a harness's shape,
neither of which has a repo-state signature a check could read without asserting that a
particular call still exists — the shape the corpus rejects outright.

## Rules (`RULES.md`)

The always-on rules, for any session that drives a browser:

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Resolve binary, never download | high | correctness | prose: 123 words |
| Reinstalling the driver repeats the download danger | high | correctness | prose: 130 words |
| Stub an unvendored CDN library's API | medium | correctness | prose: 113 words |
| Context knobs vs page knobs | medium | correctness | prose: 67 words |
| Window-size flag isn't a viewport | high | correctness | prose: 132 words |
| Wait on the page's signal | high | correctness | prose: 66 words |
| One browser, many contexts | medium | performance | prose: 51 words |

The rest is three skills: the pixel-stability recipe (pinning, the font jail, rasterisation
flags, the WAAPI freeze) is [`pixel-stable-goldens`](skills/pixel-stable-goldens/SKILL.md), forced
for `**/__screenshots__/**` and `**/goldens/**` by its own `force-load-on-file-edits-paths`; the
hermetic page world (fake `https` origin, asset routing, init-script fakes, clock modes, script
stripping) is [`hermetic-page`](skills/hermetic-page/SKILL.md); the clip mechanics are
[`capture-a-screenshot`](skills/capture-a-screenshot/SKILL.md).

## Skills

| Skill | Trigger |
|---|---|
| [`pixel-stable-goldens`](skills/pixel-stable-goldens/SKILL.md) | adding, re-baselining or gating a pixel golden; any edit under `__screenshots__/` or `goldens/` — held by the guard until loaded |
| [`hermetic-page`](skills/hermetic-page/SKILL.md) | setting up or debugging a page's world for a headless run |
| [`capture-a-screenshot`](skills/capture-a-screenshot/SKILL.md) | writing or debugging code that screenshots a clipped region of a page |

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
