## 2026-09-20 · born · Add numpy-image-processing canon pack (#2159)
- **Source:** VascularColoring's `analysis/measure_vessels.py`, classifying skeleton pixels by
  neighbor count through `ndi.convolve`.
- **Actor:** the `growth-discover-packs` run of 2026-09-20; merged by @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Classifying pixels on a binary skeleton or mask by
  neighbor count"; prose for the reason on `_pack.md`.
- **Landed:** #2159 (Refs #642) · pack version 60920.1.
