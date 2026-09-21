## 2026-09-20 · born · Add numpy-image-processing canon pack (#2159)
- **Source:** VascularColoring's `analysis/measure_vessels.py`, which wraps `PIL.ImageFont.truetype`
  in `try`/`except OSError` with an `ImageFont.load_default()` fallback.
- **Actor:** the `growth-discover-packs` run of 2026-09-20; merged by @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Loading a font with PIL.ImageFont.truetype"; prose
  for the reason on `_pack.md`.
- **Landed:** #2159 (Refs #642) · pack version 60920.1.
