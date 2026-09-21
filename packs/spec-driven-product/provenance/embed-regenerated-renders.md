## 2026-07-07 · born · Rewrite generate-project-instructions around facet extraction; seed spec-driven-product (#162)
- **Source:** the class's two worked examples in the owner's fleet -
  missingbulb/GoogleCalendarEventCreator's executable-requirements methodology, the origin, and
  missingbulb/TLDR's adaptation of it, which adds the cross-tier server kind.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Embed regenerated renders of the real states in the
  spec itself".
- **Landed:** #162 (Closes #161) · pack version 1.

## 2026-07-08 · reworded · Guidance: how to render UI image goldens (engine per surface) (#179)
- **Source:** a spec-driven-product session on missingbulb/CrosswordChat, where the rendering
  technique had to be reverse-engineered from a sibling repo because the pack stated the what and no
  doc carried the how.
- **Reason:** the section gains a bullet pointing at the golden-image method, which is the
  writing-tests skill's: this pack owns the what, that skill owns the how, and neither restates the
  other.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Landed:** #179.

## 2026-07-27 · reworded · Tighten every RULES.md to when + what + one non-obvious fact (#467)
- **Reason:** every rule is cut back to trigger plus instruction plus at most one clause of why;
  what went was consequence prose arguing for the rule rather than enabling it. No rule was merged
  or dropped and the structure maps one to one onto the original.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #467 (Closes #466).

## 2026-09-05 · moved · Rules → skills: the audit's path-forced extractions; description-triggered ones stay prose (#1667)
- **Reason:** the golden-image pointer beside this rule describes rather than instructs, so it
  belongs where an adopter reads about the pack, not in the prose every declaring session loads.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** the pointer leaves RULES.md for the pack README; the rule itself stays a RULES.md
  rule on its own trigger.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.
