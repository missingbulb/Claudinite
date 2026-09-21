## 2026-09-21 · born · loads at under half the rate it declares for itself (half the declared rate) (#2214)
- **Source:** docs/usage-review/DESIGN.md §3, the owner's design of 2026-09-21, implemented as
  written.
- **Reason:** Half rather than any shortfall, because a declared rate is an estimate a person made
  and the window's work mix moves it. A skill loading at, say, four fifths of its rate is within
  what a month's mix explains; at under half, either the rate or the description is wrong, and the
  finding says which discriminator tells them apart.
- **Mechanism:** a declaration in `usage-rules.json`, not code - a threshold a reader must be able
  to weigh has to be readable without opening a module. The cause is `unknown` and the list is open,
  so a reader may find a cause outside it.
- **Retire when:** the rule has not fired in two months of the review's history, or its findings
  have produced no merged proposal - either says the threshold is wrong or the rule is not worth
  the reading.
- **Landed:** #2214
