## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firestore + Functions + FCM app with Google sign-in.
  The evidence names the project for the set of rules rather than one per rule.
- **Reason:** a read-check-write cooldown is bypassable by firing calls concurrently, and the bypass
  does not show under sequential testing. Running the read, check and stamp inside `runTransaction`
  is what serializes them.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Rate limits need a transaction.".
- **Landed:** #165 (Closes #180) · pack version 1.

## 2026-09-05 · moved · into the firebase-functions skill (#1667)
- **Reason:** the rule's moment is an edit under `functions/`, which the skill's path guard reaches;
  the reasoning is on the skill's own entry of this date.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the firebase-functions skill, force-loaded for `functions/**`.
- **Landed:** #1667 (Closes #1662) · pack version 60903.2.
