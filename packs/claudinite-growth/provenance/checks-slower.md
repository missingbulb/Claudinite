## 2026-09-21 · born · the Stop hook's checks take a quarter longer than the window before (a quarter slower, above two seconds) (#2214)
- **Source:** docs/usage-review/DESIGN.md §3, the owner's design of 2026-09-21, implemented as
  written.
- **Reason:** A quarter is beyond what a month's tree growth explains on its own. The two-second
  floor is what keeps the rule from firing on a sweep that went from four milliseconds to five - a
  proportion is meaningless at the bottom of the scale, and the Stop hook is only worth watching
  once it is long enough for a person to notice.
- **Mechanism:** a declaration in `usage-rules.json`, not code - a threshold a reader must be able
  to weigh has to be readable without opening a module. The cause is `known` and the list is closed
  by the mechanism.
- **Retire when:** the rule has not fired in two months of the review's history, or its findings
  have produced no merged proposal - either says the threshold is wrong or the rule is not worth
  the reading.
- **Landed:** #2214
