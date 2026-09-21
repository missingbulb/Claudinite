## 2026-09-05 · born · the lockfile skew rule becomes a path-forced skill (#1667)
- **Reason:** the moment the rule is needed is an edit of `pubspec.yaml` or `pubspec.lock` and
  nothing else, which the path guard predicts exactly. Its mechanism and the bar it had to clear are
  the flutter-golden-tests entry of the same date.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a skill with `body: guidelines`, force-loaded for `**/pubspec.yaml` and
  `**/pubspec.lock`.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.
