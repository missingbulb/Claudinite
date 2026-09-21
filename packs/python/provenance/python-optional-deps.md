## 2026-07-19 · born · python pack: optional-dep discipline as skill-owned checks and residue prose (#345)
- **Source:** missingbulb/LaughCounter: a stdlib-only importable core (counting, storage, CLI, web
  dashboard) with the YAMNet/TensorFlow laughter model and the Torch/SpeechBrain speaker model
  behind `[project.optional-dependencies]` extras, lazily imported per backend through
  `load_default`, each guarded by a `try/except ImportError` that names the `pip install` extra, and
  a stdlib `ScriptedDetector` that runs the tests and the offline `simulate` mode.
- **Reason:** the two rules with a false-positive-free file-scoped signature moved into
  check-the-work rules the skill owns and their prose was deleted, so the failure message is the
  only copy and nothing can drift from it. Follows the pattern #350 established one pack earlier.
- **Actor:** the growth-discover run, merged by @missingbulb (owner).
- **Model:** claude, per the commit trailer.
- **Mechanism:** the python-optional-deps skill, reached by its description when an optional
  dependency or a heavy backend is being wired. Its `checks.mjs` owns the two rules, discovered by
  the skills registry and run at every Stop and in CI; both are inert until the repo declares
  optional dependencies, because a skill check runs on every repo. The packaging knowledge both need
  sits beside them in `pyproject.mjs` rather than in the engine's lib, which carries engine
  mechanism only.
- **Landed:** #345 (Refs #303) · pack version 1.

## 2026-09-03 · reworded · A skill opens on what to do, not on what the skill is (#1647)
- **Reason:** the opening restated the frontmatter description the reader already has and then
  pointed at the pack's own RULES.md for the architecture judgment. A mounted skill means a declared
  pack, so that pointer sent nobody anywhere.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1647 (Refs #1646) · pack version 60903.1.

## 2026-09-05 · trigger-changed · forced for the packaging files (#1667)
- **Reason:** the rule moved in with it applies exactly when a packaging file is edited, and the
  skill until then was reachable by description alone, which the owner's bar treats as
  unpredictable.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** `force-load-on-file-edits-paths` gains `pyproject.toml`, `setup.cfg` and
  `setup.py`, each also matched one directory down.
- **Landed:** #1667 (Closes #1662) · pack version 60904.2.
