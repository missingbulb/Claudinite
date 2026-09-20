## 2026-09-01 · born · converted from references.md (RULES-3)
- **Reason:** The rule is a cost argument, not a purity one: a console read costs the user seconds,
  where a deploy-and-check cycle costs a whole release. Recovered from the rule's own pre-#467 text
  (cut by 2f3e4e9a as “consequence prose arguing for a rule rather than enabling it”, before
  this pack had a references.md to hold it).
- **Mechanism:** prose
- **Retire when:** Reaffirm while releases are expensive relative to a console round-trip; retire if
  a preview environment makes the hypothesis cheap to test.
