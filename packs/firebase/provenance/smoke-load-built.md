## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firestore + Functions + FCM app with Google sign-in.
  The evidence names the project for the set of rules rather than one per rule.
- **Reason:** a build that emits an entrypoint which throws on `require` is invisible until
  something invokes it, and the suite is the cheapest place to see it. It arrived as the closing
  clause of the Node-major pin rule, which is the skew that produces the crash.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a clause of the RULES.md rule "Functions engines pin the Node major".
- **Retire when:** Reaffirm while functions are deployed from a built directory; retire if the
  deploy itself smoke-loads.
- **Landed:** #165 (Closes #180) · pack version 1.

## 2026-07-26 · split · the Node-pin rule converts and its smoke-load half stays prose (#451)
- **Reason:** the pin converted to a check and the practice it closed on did not - a smoke-load is
  something the test lane does, not a signature in the artifact - so it became a rule of its own
  rather than a clause of a rule that no longer existed.
- **Actor:** @missingbulb (owner), on the prose-to-checks sweep of 2026-07-26.
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Smoke-load the built entrypoint in the test lane".
- **Landed:** #451 (tracker #450) · pack version 1.

## 2026-07-27 · reworded · Tighten every RULES.md to when + what + one non-obvious fact (#467)
- **Source:** the rule's own pre-#467 text, mined out of the history and recovered into the pack's
  `references.md` by #1575, which found this the only genuine seam among 49 shrink events.
- **Reason:** the sweep cut consequence prose arguing for a rule rather than enabling it, from every
  RULES.md in the corpus. The rule line itself is unchanged; what went was the clause a review would
  weigh - and in July 2026 there was no `references.md` to hold it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #467 (Refs #466) · pack version 1.

## 2026-09-05 · moved · into the firebase-functions skill (#1667)
- **Reason:** the rule's moment is an edit under `functions/`, which the skill's path guard reaches;
  the reasoning is on the skill's own entry of this date.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the firebase-functions skill, force-loaded for `functions/**`.
- **Landed:** #1667 (Closes #1662) · pack version 60903.2.
