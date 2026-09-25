## 2026-09-05 · born · the bundle keys move into a forced skill (#1667)
- **Reason:** the owner's bar, set mid-review, is that a rule leaves RULES.md for a skill only where
  the skill's forced paths cover every moment the rule is needed; a skill reached by description
  alone is not predictable enough to carry a rule. The two plist keys are needed exactly when those
  files are edited, so they clear it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** the `macos-app-bundle` skill, body guidelines, held by the guard for any edit of
  `**/Info.plist` or `**/Package.swift`.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.

## 2026-09-25 · trigger-changed · description cut to the 30-word cap
- **Reason:** the description summarised the method the body already carries; every session paid for
  it.
- **Mechanism:** the description, as before.
- **Actor:** @missingbulb (owner).
