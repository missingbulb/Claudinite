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
  The `runScripts: "dangerously"` fix itself was preserved verbatim, as a detail a reader acts on.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #467 (Closes #466).

## 2026-09-01 · reaffirmed · the claim verified empirically in both directions (#1575)
- **Source:** the rule's own pre-#467 text, recovered because #467 predated any `references.md` to
  hold the rationale it cut.
- **Reason:** against jsdom 30.0.1 on Node v22.22.2, parsing `<div
  id=x>A<noscript><b>NO</b></noscript>B</div>`: under the default `runScripts` the `<noscript>` was
  parsed into live DOM (one child element) and `textContent` read a clean `"ANOB"`; under
  `runScripts: "dangerously"` it was kept as raw text (zero child elements) and `textContent` read
  `"A<b>NO</b>B"`, the markup splicing a real browser produces. The default is the opposite of a
  browser, and the test-passes/production-fails asymmetry holds both ways.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1575 (Closes #1571) · pack version 60901.1.
