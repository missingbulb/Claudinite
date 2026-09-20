## 2026-09-01 · born · converted from references.md (RULES-2)
- **Reason:** The settle-once guard exists because the first terminal signal wins and later ones are
  ignored: interim results arrive before the final one, a cycle can end with no result at all, and
  an error and an end can both arrive — so without the flag the cycle resolves more than once.
  Recovered from the rule's own pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing for a
  rule rather than enabling it”, before this pack had a references.md to hold it).
- **Mechanism:** prose
- **Retire when:** Reaffirm while all three handlers can fire for one cycle; retire if the API
  guarantees a single terminal event.
