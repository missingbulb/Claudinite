## 2026-09-21 · born · loads in three of every four sessions - it is context wearing a skill's clothes (three in four sessions) (#2214)
- **Source:** docs/usage-review/DESIGN.md §3, the owner's design of 2026-09-21, implemented as
  written.
- **Reason:** Three quarters is where a skill stops being reached for and starts being present: at
  that rate the tokens are paid on nearly every session anyway, so the honest comparison is against
  carrying the lines in RULES.md, where they cost the same and load reliably. Below it a skill is
  still a skill somebody chose.
- **Mechanism:** a declaration in `usage-rules.json`, not code - a threshold a reader must be able
  to weigh has to be readable without opening a module. The cause is `known` and the list is closed
  by the mechanism.
- **Retire when:** the rule has not fired in two months of the review's history, or its findings
  have produced no merged proposal - either says the threshold is wrong or the rule is not worth
  the reading.
- **Landed:** #2214
