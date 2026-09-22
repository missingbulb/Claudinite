## 2026-07-07 · born · Rewrite generate-project-instructions around facet extraction; seed spec-driven-product (#162)
- **Source:** the class's two worked examples in the owner's fleet -
  missingbulb/GoogleCalendarEventCreator's executable-requirements methodology, the origin, and
  missingbulb/TLDR's adaptation of it, which adds the cross-tier server kind.
- **Reason:** one mechanism forced onto everything green-lights claims it can never check - the same
  lesson `packs/basics` records from the other side, where a UI-snapshot coverage gate "covered"
  behavioural leaves it could not observe (#429). That cross-pack corroboration is why kinds are
  routed rather than unified.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "A kind is one way a requirement can be asserted".
- **Landed:** #162 (Closes #161) · pack version 1.

## 2026-07-27 · reworded · Tighten every RULES.md to when + what + one non-obvious fact (#467)
- **Reason:** every rule is cut back to trigger plus instruction plus at most one clause of why;
  what went was consequence prose arguing for the rule rather than enabling it. No rule was merged
  or dropped and the structure maps one to one onto the original.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #467 (Closes #466).

## 2026-09-01 · reaffirmed · Recover the rationale #467 cut from the shared packs into references.md (#1575)
- **Reason:** #467's cut predated any place in the pack that could hold a rule's rationale, so
  recovering it completes that decision rather than undoing it: the rule line stays exactly as #467
  left it and the reason moves to the doc built for it. Only clauses carrying a failure mode, cost,
  frequency or authority were taken back.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Retire when:** reaffirm alongside the corresponding basics entry; retire only if both are
  retired together.
- **Landed:** #1575 (Closes #1571) · pack version 60901.1.
