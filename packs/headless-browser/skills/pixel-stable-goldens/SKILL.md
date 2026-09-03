---
name: pixel-stable-goldens
description: What makes a browser screenshot bit-stable across machines — pinning the build, the font jail, reproducible rasterisation flags, freezing the Web Animations API. Use when adding, re-baselining or gating a pixel golden; loaded for any edit under __screenshots__/ or goldens/.
metadata:
  force-load-on-file-edits-paths:
    - "**/__screenshots__/**"
    - "**/goldens/**"
---

# Pixel-stable goldens

## Pin the build, or budget for the whole recipe

- **A committed pixel golden is only comparable under the exact build that rendered it.** Two
  browsers a version apart rasterise text and shadows differently, so a comparison across them
  measures the renderer, not the product. Where the output is compared pixel by pixel, read the
  installed driver version at launch and **refuse to run** on any other, naming the pinned one in
  the error; where it is not — a build artifact, a behavioural assertion — let the build float
  and spend nothing on pinning it.

- **Pinning is what buys a zero-diff browser golden — budget for the whole recipe or accept a
  tolerance.** A browser screenshot is not bit-stable across machines by default, which is why
  the general advice is a small tolerance. It *can* be made bit-stable, and the price is the rest
  of this skill in full: the pinned build, a font jail, and the rasterisation flags. Take all of
  it or take the tolerance; a half-applied recipe gives a zero-diff gate that fails on someone
  else's machine for reasons no one can read off the diff.

## Fonts decide the layout, and the machine decides the fonts

- **Vendoring the web fonts is half the job — every glyph they lack is drawn from the machine.**
  An emoji, an arrow, a currency sign, a non-Latin title: each falls back to whatever the host
  has installed, so the rendering quietly becomes a record of that machine's font set. The
  failure is brutal and unobvious — one string measures wider on a runner than on a workstation,
  wraps, and every card below it moves down a line. Launch the browser with its own
  font-configuration world whose only font directory is one you vendored, with the generic
  families aliased into it, so nothing installed on the host can reach the page.

- **Ask the browser for reproducible rasterisation.** Disable hinting and subpixel text, force
  an sRGB colour profile, hide scrollbars, and disable GPU rasterisation. Shadows and blurs need
  two more: partial raster reuses tiles whose seams land inside a blur, and runtime-optimised
  drawing routines differ by CPU — both make the *same* page render differently run to run on
  one machine.

## Motion

- **Freezing CSS animation does not freeze the Web Animations API.** Zeroing
  `animation-duration` and `transition-duration` stops declarative animation and nothing else;
  anything driven through `element.animate` keeps running, and a capture races it. Stub the
  method so every such animation resolves on its end state immediately.
