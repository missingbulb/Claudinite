## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firestore + Functions + FCM app with Google sign-in.
  The evidence names the project for the set of rules rather than one per rule.
- **Reason:** the Admin SDK is not subject to the rules, so "rules allow it" and "the system writes
  it" are two different lists and a rules review that reads only the first is incomplete. The rule
  is always-on rather than a security-rules guideline because the moment it matters is the review,
  not the edit.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Admin-SDK code bypasses rules".
- **Landed:** #165 (Closes #180) · pack version 1.
