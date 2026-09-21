## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firestore + Functions + FCM app with Google sign-in.
  The evidence names the project for the set of rules rather than one per rule.
- **Reason:** a notification failure that fails the triggering call turns a delivery problem into a
  user-visible error, and dead-token cleanup keyed on a remembered error code cleans up nothing. The
  rule names the code and says to verify it against the installed firebase-admin.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Push is best-effort by construction".
- **Landed:** #165 (Closes #180) · pack version 1.

## 2026-09-05 · moved · into the firebase-functions skill (#1667)
- **Reason:** the rule's moment is an edit under `functions/`, which the skill's path guard reaches;
  the reasoning is on the skill's own entry of this date.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the firebase-functions skill, force-loaded for `functions/**`.
- **Landed:** #1667 (Closes #1662) · pack version 60903.2.
