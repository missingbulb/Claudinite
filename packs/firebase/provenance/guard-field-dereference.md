## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firestore + Functions + FCM app with Google sign-in.
  The evidence names the project for the set of rules rather than one per rule.
- **Reason:** distinct writers legitimately upsert disjoint field subsets of one document, and an
  unguarded dereference of a missing key throws and denies - a denial that reads as a permissions
  bug rather than a missing guard.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Guard every field dereference for absence.".
- **Landed:** #165 (Closes #180) · pack version 1.

## 2026-09-05 · moved · into the firestore-security-rules skill (#1667)
- **Reason:** the rule's moment is an edit of a rules file, which the skill's path guard reaches;
  the reasoning is on the skill's own entry of this date.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the firestore-security-rules skill, force-loaded for
  `**/firestore.rules` and `**/storage.rules`.
- **Landed:** #1667 (Closes #1662) · pack version 60903.2.
