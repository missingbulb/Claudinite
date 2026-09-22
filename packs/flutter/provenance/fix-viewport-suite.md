## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firebase-backed, location-driven Flutter app with an
  executable-requirements UI suite. The evidence names the project for the set of rules rather than
  one per rule.
- **Reason:** left at the harness default, layout - and therefore every golden - moves whenever the
  default does, and the diff blames the change under test.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Fix the viewport per suite".
- **Landed:** #165 (Closes #180) · pack version 1.

## 2026-09-05 · moved · into the flutter-golden-tests skill (#1667)
- **Reason:** the rule's moment is an edit of a test file, so the skill's path guard reaches it and
  the prose file stops paying for it in every other session. The reasoning is on the skill's own
  entry of this date.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the flutter-golden-tests skill, force-loaded for `**/*_test.dart`
  and `**/test/**/*.dart`.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.
