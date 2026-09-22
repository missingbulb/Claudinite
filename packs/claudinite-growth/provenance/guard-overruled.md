## 2026-09-21 · born · an advisory guard fires in most sessions and the call runs anyway (half the sessions) (#2214)
- **Source:** docs/usage-review/DESIGN.md §3, the owner's design of 2026-09-21, implemented as
  written.
- **Reason:** An advisory guard firing in most sessions and the call running anyway means the guard
  is matching calls it was not written for, or naming a bias sessions do not hold. Half is where it
  stops being occasional and starts being noise a session learns to read past.
- **Mechanism:** a declaration in `usage-rules.json`, not code - a threshold a reader must be able
  to weigh has to be readable without opening a module. The cause is `probable` and the list is
  open, so a reader may find a cause outside it.
- **Retire when:** the rule has not fired in two months of the review's history, or its findings
  have produced no merged proposal - either says the threshold is wrong or the rule is not worth
  the reading.
- **Landed:** #2214
