## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firestore + Functions + FCM app with Google sign-in.
  The evidence names the project for the set of rules rather than one per rule.
- **Reason:** anything the client sends about who they are is decoration: the body is
  attacker-controlled, so only the verified token carries identity.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Identity comes from the verified token, never the
  request body".
- **Retire when:** Reaffirm as long as rules can read `request.auth`; retire only if identity stops
  being available there.
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
