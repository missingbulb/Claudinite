## 2026-09-01 · born · converted from references.md (RULES-1)
- **Reason:** A recycled id silently rebinds history to a different requirement: ids are what cases,
  commits and review discussion key on, so reuse corrupts the record rather than merely confusing a
  reader — and it does so without any failure. Recovered from the rule's own pre-#467 text (cut by
  2f3e4e9a as “consequence prose arguing for a rule rather than enabling it”, before this pack
  had a references.md to hold it).
- **Mechanism:** prose
- **Retire when:** Reaffirm while ids are the join key across cases, commits and review; retire if
  traceability moves to a content hash.
