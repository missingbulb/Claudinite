## 2026-09-01 · born · converted from references.md (RULES-65)
- **Reason:** #1042: an anchored regex cannot cross the nested closing bracket, so every element
  after it goes silently unreached — and a fixture built without that nesting spells the same gap
  the pattern has, proving nothing.
- **Mechanism:** prose
