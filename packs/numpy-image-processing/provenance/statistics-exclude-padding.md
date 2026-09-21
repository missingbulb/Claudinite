## 2026-09-20 · born · Add numpy-image-processing canon pack (#2159)
- **Source:** NoRFinder's imaged-area-only quantile: `quantile_valid` in `src/nor.py`, and the
  validity mask `src/harness.py` builds by transforming an all-ones array
  (`t.apply(np.ones_like(...), order=0) > 0.5`).
- **Actor:** the `growth-discover-packs` run of 2026-09-20; merged by @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Computing a threshold, quantile, or other global
  statistic over an array that can carry padding"; prose for the reason on `_pack.md`.
- **Landed:** #2159 (Refs #642) · pack version 60920.1.
