## 2026-09-01 · born · converted from references.md (RULES-4)
- **Reason:** Once the pipeline exists, the module headers and pack `README.md`s must independently
  state the same facts, so a surviving design doc is a third copy to keep in sync with both. #1169
  also set the boundary: a doc still describing work in flight, and a much larger one many module
  headers cite by section, were decided separately rather than discovered mid-run.
- **Mechanism:** prose
- **Retire when:** Retire the rule only if design docs stop being duplicated by the headers and
  READMEs the build produces.
