## 2026-07-19 · born · python pack: optional-dep discipline as skill-owned checks and residue prose (#345)
- **Source:** missingbulb/LaughCounter: a stdlib-only importable core (counting, storage, CLI, web
  dashboard) with the YAMNet/TensorFlow laughter model and the Torch/SpeechBrain speaker model
  behind `[project.optional-dependencies]` extras, lazily imported per backend through
  `load_default`, each guarded by a `try/except ImportError` that names the `pip install` extra, and
  a stdlib `ScriptedDetector` that runs the tests and the offline `simulate` mode.
- **Reason:** a genuine availability probe cannot be told from an accidental unused import without a
  full unused-name analysis, so this half of the guard rule stays prose while the other half, the
  re-raise that names the extra, became an advisory check.
- **Actor:** the growth-discover run, merged by @missingbulb (owner).
- **Model:** claude, per the commit trailer.
- **Mechanism:** a RULES.md section, "Mark the availability-probe import as a deliberate
  unused-import suppression".
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
- **Reason:** the reason `adding-heavy-native.md` records, applied to this rule in the same sweep.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1634 (Closes #1632) · pack version 60902.1.

## 2026-09-05 · reaffirmed · stays prose under the path-forced bar (#1667)
- **Reason:** the same audit weighed this rule for the skill and left it. A probe import can be
  written in any module of the package, so no file-edit path predicts the moment it is needed and a
  forced skill would cover only part of it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #1667 (Closes #1662) · pack version 60904.2.
