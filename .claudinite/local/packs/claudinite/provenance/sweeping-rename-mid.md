## 2026-09-01 · born · converted from references.md (RULES-3)
- **Reason:** During the #1119 rename sweep, a file rewritten after the sweep started reinvented the
  retired constant as a comparison key, and the state comparison failed silently — a wrong count,
  no error, no failing test.
- **Mechanism:** prose
- **Retire when:** Retire the rule only if a drift guard pins every comparison key to its constant.
