## 2026-09-21 · born · the check runner failed to launch in a session - enforcement was silently off (one error) (#2214)
- **Source:** docs/usage-review/DESIGN.md §3, the owner's design of 2026-09-21, implemented as
  written.
- **Reason:** A runner that failed to launch means the session was waved through unchecked, which is
  an anti-win masquerading as a quiet day. One is the threshold because there is no acceptable rate.
- **Mechanism:** a declaration in `usage-rules.json`, not code - a threshold a reader must be able
  to weigh has to be readable without opening a module. The cause is `known` and the list is closed
  by the mechanism.
- **Retire when:** the rule has not fired in two months of the review's history, or its findings
  have produced no merged proposal - either says the threshold is wrong or the rule is not worth
  the reading.
- **Landed:** #2214
