## 2026-09-21 · born · never fires and has no prose twin (no finding over twenty runs) (#2214)
- **Source:** docs/usage-review/DESIGN.md §3, the owner's design of 2026-09-21, implemented as
  written.
- **Reason:** Deliberately recommends nothing. A net that has caught nothing is not evidence of a
  hole, and the corpus has more checks than a month's work touches; the finding exists so the set is
  visible and so a check that is genuinely unreachable can be found among them.
- **Mechanism:** a declaration in `usage-rules.json`, not code - a threshold a reader must be able
  to weigh has to be readable without opening a module. The cause is `unknown` and the list is open,
  so a reader may find a cause outside it.
- **Retire when:** the rule has not fired in two months of the review's history, or its findings
  have produced no merged proposal - either says the threshold is wrong or the rule is not worth
  the reading.
- **Landed:** #2214
