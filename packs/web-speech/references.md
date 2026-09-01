# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.
- **(RULES-1)** The ranked alternatives are exactly where homophone and near-miss recovery
  lives, so taking only alternative `[0]` throws away the recognizer's own best correction
  material. Recovered from the rule's own pre-#467 text (cut by 2f3e4e9a as “consequence prose
  arguing for a rule rather than enabling it”, before this pack had a references.md to hold
  it). Reaffirm while `maxAlternatives` is supported; retire if engines stop returning a useful
  n-best list.
- **(RULES-2)** The settle-once guard exists because the first terminal signal wins and later
  ones are ignored: interim results arrive before the final one, a cycle can end with no result
  at all, and an error and an end can both arrive — so without the flag the cycle resolves more
  than once. Recovered from the rule's own pre-#467 text (cut by 2f3e4e9a as “consequence prose
  arguing for a rule rather than enabling it”, before this pack had a references.md to hold
  it). Reaffirm while all three handlers can fire for one cycle; retire if the API guarantees a
  single terminal event.
