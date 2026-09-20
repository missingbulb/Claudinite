## 2026-09-01 · born · converted from references.md (RULES-2)
- **Reason:** When both parts are ≤ 12 the day-first/month-first order is genuinely undecidable
  from the value alone — the rule is not a preference between conventions but an admission that
  the digits carry no answer, which is why it resolves once per document rather than per field. The
  month-first default is the order `Date` and most JS parsers assume, from the US `MM/DD/YYYY`
  convention. Recovered from the rule's own pre-#467 text (cut by 2f3e4e9a as “consequence prose
  arguing for a rule rather than enabling it”, before this pack had a references.md to hold it).
- **Mechanism:** prose
- **Retire when:** Reaffirm against JS parser behaviour; retire if a positive locale signal becomes
  reliably available per field.
