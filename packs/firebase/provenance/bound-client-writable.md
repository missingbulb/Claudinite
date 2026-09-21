## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firestore + Functions + FCM app with Google sign-in.
  The evidence names the project for the set of rules rather than one per rule.
- **Reason:** an unbounded client-writable string or blob is a free storage channel, and the only
  place to close it is the ruleset - nothing downstream can refuse a write the rules allowed.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Bound every client-writable string/blob".
- **Landed:** #165 (Closes #180) · pack version 1.

## 2026-09-05 · moved · into the firestore-security-rules skill (#1667)
- **Reason:** the rule's moment is an edit of a rules file, which the skill's path guard reaches;
  the reasoning is on the skill's own entry of this date.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the firestore-security-rules skill, force-loaded for
  `**/firestore.rules` and `**/storage.rules`.
- **Landed:** #1667 (Closes #1662) · pack version 60903.2.
