## 2026-09-21 · born · never fires, and a RULES.md line states the same rule (no finding over twenty runs) (#2214)
- **Source:** docs/usage-review/DESIGN.md §3, the owner's design of 2026-09-21, implemented as
  written.
- **Reason:** Twenty runs is enough that the check has been asked the question repeatedly. The pair
  with a prose twin is what makes this actionable where its twinless sibling is not: the prose is
  the thing that can be deleted to find out which of the two was doing the work, and that experiment
  is cheap and reversible.
- **Mechanism:** a declaration in `usage-rules.json`, not code - a threshold a reader must be able
  to weigh has to be readable without opening a module. The cause is `probable` and the list is
  closed by the mechanism.
- **Retire when:** the rule has not fired in two months of the review's history, or its findings
  have produced no merged proposal - either says the threshold is wrong or the rule is not worth
  the reading.
- **Landed:** #2214
