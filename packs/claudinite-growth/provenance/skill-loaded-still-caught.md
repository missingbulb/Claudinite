## 2026-09-21 · born · sessions that loaded it were still caught by a check the skill owns (three in ten sessions that loaded it) (#2214)
- **Source:** docs/usage-review/DESIGN.md §3, the owner's design of 2026-09-21, implemented as
  written.
- **Reason:** The one rule whose recommendation is deliberately none: a skill is not a guarantee,
  and a third of sessions being caught anyway is evidence rather than a defect. It is carried
  forward because the case for moving a rule into a skill's first lines is built across windows, not
  from one.
- **Mechanism:** a declaration in `usage-rules.json`, not code - a threshold a reader must be able
  to weigh has to be readable without opening a module. The cause is `unknown` and the list is open,
  so a reader may find a cause outside it.
- **Retire when:** the rule has not fired in two months of the review's history, or its findings
  have produced no merged proposal - either says the threshold is wrong or the rule is not worth
  the reading.
- **Landed:** #2214
