## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firestore + Functions + FCM app with Google sign-in.
  The evidence names the project for the set of rules rather than one per rule.
- **Reason:** a collection nobody thought about must be unreachable rather than accidentally open,
  and the only shape that holds that as the ruleset grows is grant-per-collection over a catch-all
  deny.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "End every ruleset with an explicit catch-all deny".
- **Landed:** #165 (Closes #180) · pack version 1.

## 2026-09-05 · moved · into the firestore-security-rules skill (#1667)
- **Reason:** the rule's moment is an edit of a rules file, which the skill's path guard reaches;
  the reasoning is on the skill's own entry of this date.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the firestore-security-rules skill, force-loaded for
  `**/firestore.rules` and `**/storage.rules`.
- **Landed:** #1667 (Closes #1662) · pack version 60903.2.
