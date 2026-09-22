## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firestore + Functions + FCM app with Google sign-in.
  The evidence names the project for the set of rules rather than one per rule.
- **Reason:** a suite that needs an emulator or a mocked Firebase SDK to test audience selection is
  a suite nobody runs on every change. Pulling the decisions out into pure modules is what lets the
  default lane run with neither.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Extract decision logic into pure modules".
- **Landed:** #165 (Closes #180) · pack version 1.
