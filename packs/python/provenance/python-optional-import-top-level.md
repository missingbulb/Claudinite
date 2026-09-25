## 2026-07-19 · born · python pack: optional-dep discipline as skill-owned checks and residue prose (#345)
- **Source:** missingbulb/LaughCounter, whose stdlib-only core keeps the YAMNet/TensorFlow and
  Torch/SpeechBrain models behind `[project.optional-dependencies]` extras, imported lazily per
  backend.
- **Reason:** a declared-optional package imported at module top level runs at `import <pkg>` time,
  dragging the heavy or native stack into the dependency-free core and breaking every path for
  anyone who installed the package without that extra.
- **Actor:** the growth-discover run, merged by @missingbulb (owner).
- **Model:** claude, per the commit trailer.
- **Mechanism:** a blocking check of the skill. `[project.optional-dependencies]` is the only place
  a package is *declared* optional, so the repo's own `pyproject.toml` is the ground truth that
  makes the signature false-positive-free and lets the rule convert from prose at all; the gate is
  that declaration, the scope those exact packages, and a guarded import is indented rather than at
  column 0, so it falls to the sibling install-hint rule instead.
- **Rejected:** judging heaviness. Which dependencies belong in the base set stayed prose, having no
  static signature; and a dist whose import name is unrelated to its own (`Pillow` to `PIL`) is
  deliberately unmapped, a false negative taken over a false positive.
- **Landed:** #345 (Refs #303) · pack version 1.

## 2026-09-04 · reworded · the doc: pointer names the path the tree carries (#1676)
- **Reason:** it still named the pre-#385 `skills/<name>/` layout, one of seven such pointers the
  new `doc-pointers-resolve` check found.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #1676 (Closes #1675) · pack version 60904.1.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
