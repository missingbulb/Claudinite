## 2026-09-01 · born · converted from references.md (RULES-49)
- **Reason:** #1275 is the state a native closing keyword overwrites: the item converged to a
  `task:needs-human-approval` park with its work waiting on a person, while `Closes` fires on merge
  regardless of the label state convergence chose.
- **Mechanism:** prose
