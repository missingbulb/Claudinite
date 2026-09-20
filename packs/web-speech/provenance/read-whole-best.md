## 2026-09-01 · born · converted from references.md (RULES-1)
- **Reason:** The ranked alternatives are exactly where homophone and near-miss recovery lives, so
  taking only alternative `[0]` throws away the recognizer's own best correction material. Recovered
  from the rule's own pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing for a rule
  rather than enabling it”, before this pack had a references.md to hold it).
- **Mechanism:** prose
- **Retire when:** Reaffirm while `maxAlternatives` is supported; retire if engines stop returning a
  useful n-best list.
