## 2026-09-21 · born · carries three or more acceptances or an override to advisory (three acceptances) (#2214)
- **Source:** docs/usage-review/DESIGN.md §3, the owner's design of 2026-09-21, implemented as
  written.
- **Reason:** Three is where a run of exceptions stops being exceptional and starts describing a
  class the rule is mis-scoped for. The acceptances are listed together in the finding because the
  reasons read as a class or as one-offs, and that is the whole discriminator.
- **Mechanism:** a declaration in `usage-rules.json`, not code - a threshold a reader must be able
  to weigh has to be readable without opening a module. The cause is `known` and the list is closed
  by the mechanism.
- **Retire when:** the rule has not fired in two months of the review's history, or its findings
  have produced no merged proposal - either says the threshold is wrong or the rule is not worth
  the reading.
- **Landed:** #2214
