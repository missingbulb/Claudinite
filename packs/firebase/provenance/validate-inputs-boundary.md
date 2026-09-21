## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firestore + Functions + FCM app with Google sign-in.
  The evidence names the project for the set of rules rather than one per rule.
- **Reason:** `NaN` and `Infinity` slip through naive numeric checks, so the rule names the four
  checks rather than saying "validate". The typed `HttpsError` half is there because a client that
  cannot tell an invalid argument from an exhausted quota cannot react to either.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Validate inputs at the boundary like an adversary
  wrote them".
- **Landed:** #165 (Closes #180) · pack version 1.
