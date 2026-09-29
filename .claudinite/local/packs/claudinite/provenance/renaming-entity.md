## 2026-08-18 · born · Apply the owner's review to the lessons #979 landed (#987)
- **Source:** the owner's review of the lessons #979 landed; four dropped, five rewritten, five kept
  as written.
- **Reason:** the owner rewrote it to sweep references in code and comments, leave historical
  records alone and re-render generated files (#957).
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule, triggered on "Renaming an entity".
- **Landed:** #987 (Refs #986).

## 2026-08-24 · reworded · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** this file carried 63% of the repo's session rule tokens and was growing ~900 tokens a
  day. Two passes: the per-rule incident archaeology comes out, then a rule carrying two situations
  is split before it is cut. 8,435 to 5,359 words, at a mean of 35 words a rule; reasoning
  is out and a measurement survives only where the number is the argument.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1315 (Closes #1312).

## 2026-09-27 · weakened · the sweep and generated-file halves are canon's now (#2353)
- **Source:** the growth-dedup run over the window since 2026-09-20.
- **Reason:** basics' repo-text-sweeps owns the reference sweep, comments included, and the
  generated-file half is enforced by the `generated-file-hand-edit` check. What no canon element
  states is leaving historical records alone, so that clause is what stays.
- **Retire when:** the canon says what to do with a historical record under a rename.
