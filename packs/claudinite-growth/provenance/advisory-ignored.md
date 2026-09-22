## 2026-09-21 · born · an advisory nobody acts on, printed at every Stop (four in five pairs persisting, over ten) (#2214)
- **Source:** docs/usage-review/DESIGN.md §3, the owner's design of 2026-09-21, implemented as
  written.
- **Reason:** An advisory nobody acts on is printed at every Stop and read by nobody, which costs
  attention that the next advisory needs. Four fifths rather than all, because a session that fixed
  one instance and left another is still acting on it.
- **Mechanism:** a declaration in `usage-rules.json`, not code - a threshold a reader must be able
  to weigh has to be readable without opening a module. The cause is `known` and the list is closed
  by the mechanism.
- **Retire when:** the rule has not fired in two months of the review's history, or its findings
  have produced no merged proposal - either says the threshold is wrong or the rule is not worth
  the reading.
- **Landed:** #2214
