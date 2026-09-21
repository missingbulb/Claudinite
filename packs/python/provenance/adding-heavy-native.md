## 2026-07-19 · born · python pack: optional-dep discipline as skill-owned checks and residue prose (#345)
- **Source:** missingbulb/LaughCounter: a stdlib-only importable core (counting, storage, CLI, web
  dashboard) with the YAMNet/TensorFlow laughter model and the Torch/SpeechBrain speaker model
  behind `[project.optional-dependencies]` extras, lazily imported per backend through
  `load_default`, each guarded by a `try/except ImportError` that names the `pip install` extra, and
  a stdlib `ScriptedDetector` that runs the tests and the offline `simulate` mode.
- **Reason:** whether a given dependency is heavy enough to belong in an extra is a judgment about
  the package's shape, with no false-positive-free static signature, so it stays prose rather than
  becoming a check.
- **Actor:** the growth-discover run, merged by @missingbulb (owner).
- **Model:** claude, per the commit trailer.
- **Mechanism:** a RULES.md section, "Keep the importable core dependency-free; heavy/native deps go
  in optional extras, not base `dependencies`".
- **Landed:** #345 (Refs #303) · pack version 1.

## 2026-07-27 · reworded · Tighten every RULES.md to when, what and one non-obvious fact (#467)
- **Reason:** every rule in every RULES.md was cut back to trigger, instruction and at most one
  clause of why, kept only where the rule would otherwise land as ceremony a reader skips. What went
  here was the consequence prose arguing for the rule and the hedges explaining why it had stayed
  prose; the instruction, the paths and the commands were preserved verbatim. This pack: 496 words
  to 362, corpus-wide 17,127 to 15,220.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #467 (Closes #466) · pack version 1.

## 2026-09-03 · reworded · Every pack's RULES.md carries rules, not a description of the pack (#1634)
- **Reason:** the three rules were section-shaped, each a heading and two or three paragraphs. They
  become trigger-keyed bullets at the prose ration, 280 words to 150 across the three, so a session
  reads the moment each applies rather than a title that asserts the rule.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1634 (Closes #1632) · pack version 60902.1.

## 2026-09-05 · moved · from RULES.md into the python-optional-deps skill (#1667)
- **Reason:** the owner's bar, set mid-review: a rule leaves RULES.md for a skill only where that
  skill's `force-load-on-file-edits-paths` covers every moment the rule is needed. Declaring an
  extra happens in the packaging files and nowhere else, so the guard covers the whole moment and
  the rule need not ride in every session's prose.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline under the skill's "Declaring the extra" heading; the skill is forced
  for `pyproject.toml`, `setup.cfg` and `setup.py`, at the repo root or one directory down.
- **Landed:** #1667 (Closes #1662) · pack version 60904.2.
