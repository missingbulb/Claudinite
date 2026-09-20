## 2026-09-18 · born · converted from references.md (RULES-6)
- **Reason:** "The fetch is allowed to fail — it'll just show as unknown, which we already handle"
  is a claim about every consumer downstream, and it is usually wrong. The rule survives as long as
  the codebase has any boolean, comparison or status lookup that cannot distinguish absent from
  false; a wrong answer with no error is worse than an error.
- **Mechanism:** prose
