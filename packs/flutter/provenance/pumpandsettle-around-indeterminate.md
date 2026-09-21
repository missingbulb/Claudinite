## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firebase-backed, location-driven Flutter app with an
  executable-requirements UI suite. The evidence names the project for the set of rules rather than
  one per rule.
- **Reason:** an indeterminate progress indicator schedules frames forever, so `pumpAndSettle` never
  returns and the test reads as a hang rather than a failure. Fixed-duration pumps also turn an
  in-flight state into a capturable frame, which is what makes a spinner mid-send golden-able at
  all.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Never pumpAndSettle around indeterminate progress
  indicators".
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
