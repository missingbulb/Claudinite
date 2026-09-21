## 2026-09-21 · born · it is only ever loaded because a guard held a call for it, and each block is a tool call spent to read a few lines (nine in ten loads blocked, and 300 tokens) (#2214)
- **Source:** docs/usage-review/DESIGN.md §3, the owner's design of 2026-09-21, implemented as
  written.
- **Reason:** Nine tenths rather than all, because one voluntary load in a month does not make a
  skill voluntarily reached for. The token bound is what makes this a finding at all: a block is a
  tool call spent, and spending one to deliver a few hundred tokens is worse than carrying them in
  the guard's own block text. A large body is worth the block, so the rule says nothing about it.
- **Mechanism:** a declaration in `usage-rules.json`, not code - a threshold a reader must be able
  to weigh has to be readable without opening a module. The cause is `known` and the list is closed
  by the mechanism.
- **Retire when:** the rule has not fired in two months of the review's history, or its findings
  have produced no merged proposal - either says the threshold is wrong or the rule is not worth
  the reading.
- **Landed:** #2214
