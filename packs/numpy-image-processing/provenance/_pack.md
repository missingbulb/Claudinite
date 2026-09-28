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

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.

## 2026-09-27 · born · a pitch paragraph for the dashboard's plain-repo view
- **Reason:** the dashboard shows a repo that does not run Claudinite the packs that fit it, and the
  owner asked for one paragraph per pack naming its main skills and process gains, with rough counts
  so it outlives the pack's growth.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `pitch` field, beside `ruleRoutingGuidance`.

## 2026-09-27 · scope-changed · the fingerprint is a `relevanceDetector` spec, not a function
- **Reason:** the owner asked for fingerprints a reader holding only GitHub's API can judge cheaply
  - a tree listing, a code search, then only the files that search names - which a function over a
  synchronous `read` cannot offer.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `relevanceDetector` (engine/pack_loader/relevance-detector.mjs): `paths`, optional `text`,
  `search` terms; it answers exactly what the retired `detect` answered, proven over 4,000 composed
  repos before the change.

## 2026-09-28 · reworded · the fingerprint's patterns are written as source strings
- **Reason:** a manifest that is data cannot hold a RegExp; each pattern is its source string, or {
  source, flags } where it carries a flag, and loads to the same RegExp.
- **Actor:** @missingbulb (owner), asking for pack.json manifests.
