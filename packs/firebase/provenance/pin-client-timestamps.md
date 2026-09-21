## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firestore + Functions + FCM app with Google sign-in.
  The evidence names the project for the set of rules rather than one per rule.
- **Reason:** the point of pinning to `request.time` is that a client must not be able to forge a
  heartbeat time - the value is a claim about the world, so the server must be the one to make it.
  The scoping half is what keeps the pin from rejecting unrelated single-field merges.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Pin client timestamps to request.time".
- **Retire when:** Reaffirm while clients can write the field; retire if the field moves server-side
  entirely.
- **Landed:** #165 (Closes #180) · pack version 1.

## 2026-07-27 · reworded · Tighten every RULES.md to when + what + one non-obvious fact (#467)
- **Source:** the rule's own pre-#467 text, mined out of the history and recovered into the pack's
  `references.md` by #1575, which found this the only genuine seam among 49 shrink events.
- **Reason:** the sweep cut consequence prose arguing for a rule rather than enabling it, from every
  RULES.md in the corpus. The rule line itself is unchanged; what went was the clause a review would
  weigh - and in July 2026 there was no `references.md` to hold it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #467 (Refs #466) · pack version 1.

## 2026-09-05 · moved · into the firestore-security-rules skill (#1667)
- **Reason:** the rule's moment is an edit of a rules file, which the skill's path guard reaches;
  the reasoning is on the skill's own entry of this date.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the firestore-security-rules skill, force-loaded for
  `**/firestore.rules` and `**/storage.rules`.
- **Landed:** #1667 (Closes #1662) · pack version 60903.2.
