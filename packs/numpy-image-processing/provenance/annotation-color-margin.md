## 2026-09-20 · born · Add numpy-image-processing canon pack (#2159)
- **Source:** NoRFinder's `pick_overlay` in `src/render.py`, which chooses an annotation hue by a
  measured cosine-similarity margin against the image's own pixels.
- **Actor:** the `growth-discover-packs` run of 2026-09-20; merged by @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Choosing a color to draw an annotation over an
  image"; prose for the reason on `_pack.md`.
- **Landed:** #2159 (Refs #642) · pack version 60920.1.
