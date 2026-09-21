## 2026-09-20 · born · Add numpy-image-processing canon pack (#2159)
- **Source:** NoRFinder's `_local_axis`, which uses `np.floor`/`np.ceil` rather than `int()` for a
  window built around a float center.
- **Actor:** the `growth-discover-packs` run of 2026-09-20; merged by @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Building a symmetric window or crop around a
  floating-point center"; prose for the reason on `_pack.md`.
- **Landed:** #2159 (Refs #642) · pack version 60920.1.
