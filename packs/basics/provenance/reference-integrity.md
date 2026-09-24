## 2026-07-06 · born · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Reason:** nothing else catches it. A removed doc or module leaves dangling links, imports and
  index entries behind that no test necessarily fails on, and a README index link to a deleted file
  stays green.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** check reference-integrity, in packs/basics/workRules/reference-integrity.mjs.
- **Retire when:** the test suite starts failing on dangling references.
- **Landed:** #128, closing #127 and #131.

## 2026-07-14 · reworded · Standardize tracking-issue titles; stop toggling their open/closed state (#298)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #298 · pack version 1.

## 2026-09-04 · reworded · Declarative checks: the four-moment design, the rule inventory, and pass two (derive → quantify) (#1676)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #1676 · pack version 60904.1.

## 2026-09-08 · reworded · Delete the chrome-extension release plumbing from the core .github/ (#1889)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1889 · pack version 60908.1.
