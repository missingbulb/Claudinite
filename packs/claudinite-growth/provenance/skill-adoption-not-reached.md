## 2026-09-21 · born · the pack was declared and its adoption-time skill never loaded while the adoption was live (three sessions inside the adoption window) (#2214)
- **Source:** docs/usage-review/DESIGN.md §3, the owner's design of 2026-09-21, implemented as
  written.
- **Reason:** Under three sessions the window says nothing - a pack declared on a quiet repo has
  simply not been worked with yet, and a finding there would be about the repo rather than the
  skill. Four weeks is the window because it is long enough for an adoption to be done and short
  enough that a skill loading after it was not adoption-time after all.
- **Mechanism:** a declaration in `usage-rules.json`, not code - a threshold a reader must be able
  to weigh has to be readable without opening a module. The cause is `unknown` and the list is open,
  so a reader may find a cause outside it.
- **Retire when:** the rule has not fired in two months of the review's history, or its findings
  have produced no merged proposal - either says the threshold is wrong or the rule is not worth
  the reading.
- **Landed:** #2214
