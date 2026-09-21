## 2026-07-28 · born · Growth: promote 5 lessons from the fleet's local packs (#497)
- **Source:** missingbulb/HelloWorldFlutterApp's local pack, in the growth-promote run of
  2026-07-27.
- **Reason:** a local `flutter pub get` resolves differently from CI's SDK, and the churn lands in
  the diff looking like a dependency change. Owner review on the pull request corrected the first
  wording, which read as if the lockfile should not be tracked at all - an app commits it, only a
  library ignores it - so the rule was restated around the signature that actually separates the two
  cases, the lock moving while the yaml does not, and given the concrete revert.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "pubspec.lock moving without pubspec.yaml moving is
  version skew, not a dependency change.".
- **Rejected:** a check. The run landed all five of its lessons as prose; this one is in-flight
  judgment about what a diff means, with no repo-state signature a conformance check could carry.
- **Landed:** #497 (Refs #99) · pack version 1.

## 2026-09-05 · moved · into the flutter-pubspec skill (#1667)
- **Reason:** the rule's moment is an edit of `pubspec.yaml` or `pubspec.lock`, which the skill's
  path guard predicts exactly.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the flutter-pubspec skill, force-loaded for `**/pubspec.yaml` and
  `**/pubspec.lock`.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.
