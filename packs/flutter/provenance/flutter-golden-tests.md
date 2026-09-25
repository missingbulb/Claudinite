## 2026-09-05 · born · the golden mechanics become a path-forced skill (#1667)
- **Reason:** the owner's bar, set mid-review of the audit this applies, is that a rule leaves
  `RULES.md` for a skill only where the skill's `force-load-on-file-edits-paths` covers every moment
  the rule is needed. Golden and widget-test mechanics are needed exactly when a Dart test file is
  edited, which a path glob predicts exactly, so the three of them carry no cost in any session that
  is not writing one.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a skill with `body: guidelines`, force-loaded for `**/*_test.dart` and
  `**/test/**/*.dart`; the guard holds the edit until it is loaded.
- **Rejected:** a skill reached by description alone. Model-invoked routing is probabilistic, so a
  rule that must hold on every such edit cannot ride it - that is what sent the description-only
  extractions in this audit back to the prose.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.

## 2026-09-25 · trigger-changed · description cut to the 30-word cap
- **Reason:** the description summarised the method the body already carries; every session paid for
  it.
- **Mechanism:** the description, as before.
- **Actor:** @missingbulb (owner).
