---
name: capture-a-screenshot
description: Taking a clipped capture of an element under a browser driver — clipping at the box instead of an element screenshot, why a bounding box goes stale, rounding the clip to whole pixels. Use when writing or debugging code that screenshots a region of a page.
---

# Capturing a clipped screenshot

- **Clip at an element's box rather than screenshotting the element.** An element screenshot
  scrolls the element into view first, and a scroll dismisses whatever hover or focus opened the
  state you came to capture. A clip moves nothing. For the same reason, open hover-driven UI at
  capture time rather than in a preceding drive step, and settle the scroll position
  deliberately before measuring anything.

- **A bounding box is viewport-space and goes stale.** Drivers scroll an element into view
  before clicking it, so a rectangle measured before a click means somewhere else after one.
  Convert to document coordinates at the moment of measurement, then take the clip from a
  full-page shot so a region below the fold is still inside the rendered image.

- **Round a clip to whole pixels.** A layout rectangle is fractional; letting a fractional clip
  reach the screenshot leaves the rounding to the renderer, and half a pixel either way is a
  different image. Clamp it to the page's own bounds as well — a clip outside the rendered image
  is an error, not a crop.
