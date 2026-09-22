## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firestore + Functions + FCM app with Google sign-in.
  The evidence names the project for the set of rules rather than one per rule.
- **Reason:** past the 500-op limit a fan-out becomes several batches, and a mid-sequence crash plus
  a client retry duplicates the early ones - so the fan-out is at-least-once whether or not it was
  designed that way, and the rule makes that explicit rather than leaving it to be discovered.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Chunk batched writes well under the 500-op limit".
- **Landed:** #165 (Closes #180) · pack version 1.

## 2026-09-05 · moved · into the firebase-functions skill (#1667)
- **Reason:** the rule's moment is an edit under `functions/`, which the skill's path guard reaches;
  the reasoning is on the skill's own entry of this date.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the firebase-functions skill, force-loaded for `functions/**`.
- **Landed:** #1667 (Closes #1662) · pack version 60903.2.
