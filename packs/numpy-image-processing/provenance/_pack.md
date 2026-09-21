## 2026-09-20 · born · Add numpy-image-processing canon pack (#2159)
- **Source:** that run's sweep of every covered member reachable from the session, which found two
  independently doing the same work on the identical stack: VascularColoring
  (`analysis/measure_vessels.py`) and NoRFinder (`src/nor.py`, `src/harness.py`, `src/render.py`),
  both extracting a mask or skeleton from a microscopy image array and scoring or annotating it.
- **Reason:** no existing pack homes array-level mechanics - `python` is generic packaging and
  import prose, `research-project` is the process-level iterate-an-algorithm methodology - and a
  project can run any of the three without the others. Every rule traces to one of the two members'
  real files, cited in the README; none is speculative best-practice.
- **Actor:** the `growth-discover-packs` run of 2026-09-20; merged by @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** a pack fingerprinted on `numpy` and `scipy` named together in a near-root Python
  dependency manifest (`requirements*.txt` or `pyproject.toml`): either alone is too common in
  Python code to suspect the pack, while the pair is a reliable signal for exactly this stack, and
  the marker only suspects it - declaring it stays the project's call. Every rule is prose, each
  being a numeric-code mechanic (an off-by-one in a coordinate convention, an operator that silently
  selects nothing) with no repo-state shape a deterministic check could key on without also firing
  on ordinary array code.
- **Landed:** #2159 (Refs #642) · pack version 60920.1.
