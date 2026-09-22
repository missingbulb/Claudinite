## 2026-09-05 · born · the bundle keys move into a forced skill (#1667)
- **Reason:** the owner's bar, set mid-review, is that a rule leaves RULES.md for a skill only where
  the skill's forced paths cover every moment the rule is needed; a skill reached by description
  alone is not predictable enough to carry a rule. The two plist keys are needed exactly when those
  files are edited, so they clear it.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the `macos-app-bundle` skill, body guidelines, held by the guard for any edit of
  `**/Info.plist` or `**/Package.swift`.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.
