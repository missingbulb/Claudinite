## 2026-07-06 · born · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Source:** the per-rule conversion inventory's node row, one of the two jsdom divergences the
  pack opened with.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule; prose because the divergence is runtime behaviour with no static
  signature to match.
- **Landed:** #128 (Closes #127, #131) · pack version 1.

## 2026-07-27 · reworded · Tighten every RULES.md to when + what + one non-obvious fact (#467)
- **Reason:** the corpus-wide pass left every rule as trigger plus instruction plus at most one
  clause of why; what went here was consequence prose arguing for the rule rather than enabling it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #467 (Closes #466).

## 2026-09-01 · reaffirmed · the claim verified empirically, with a precision note (#1575)
- **Source:** the rule's own pre-#467 text, recovered because #467 predated any `references.md` to
  hold the rationale it cut.
- **Reason:** against jsdom 30.0.1 on Node v22.22.2, `document.body.innerText` came back
  `undefined`, falsy, so `el.innerText || el.textContent` does fall through to `textContent` exactly
  as the rule describes, and a visible-text scrape can pass under test while finding nothing or the
  wrong thing in Chrome. Precision note for a future review: the value is `undefined`, not `null` as
  the rule's wording says; the behaviour the rule turns on is unaffected, and the wording was
  deliberately left alone as a separate call.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1575 (Closes #1571) · pack version 60901.1.
