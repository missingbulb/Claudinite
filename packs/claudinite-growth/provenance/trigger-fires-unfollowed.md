## 2026-09-21 · born · its result or prompt trigger fires and the skill is not loaded afterwards (half the fires unfollowed, over five) (#2214)
- **Source:** docs/usage-review/DESIGN.md §3, the owner's design of 2026-09-21, implemented as
  written.
- **Reason:** A trigger nobody follows is either matching the wrong text or naming advice the
  session did not need. Half is where it stops being the session's judgment call and starts being
  the pattern; five fires is the floor below which a run of coincidence explains it.
- **Mechanism:** a declaration in `usage-rules.json`, not code - a threshold a reader must be able
  to weigh has to be readable without opening a module. The cause is `probable` and the list is
  open, so a reader may find a cause outside it.
- **Retire when:** the rule has not fired in two months of the review's history, or its findings
  have produced no merged proposal - either says the threshold is wrong or the rule is not worth
  the reading.
- **Landed:** #2214
