## 2026-09-01 · born · converted from references.md (RULES-39)
- **Reason:** #1052: where the failure is conditional — a scope that 403s only against a private
  repo — a probe run where that condition is not met reports a false-positive pass, so a real
  observed 403 attributed to the permission that would fix it is worth more than the probe.
- **Mechanism:** prose
