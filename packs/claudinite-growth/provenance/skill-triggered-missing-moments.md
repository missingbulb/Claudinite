## 2026-09-21 · born · its declared moments occurred and the skill was not loaded for most of them (half the moments, over five) (#2214)
- **Source:** docs/usage-review/DESIGN.md §3, the owner's design of 2026-09-21, implemented as
  written.
- **Reason:** A triggered skill's loads are mechanical, so any large gap is a fault rather than a
  judgment. Half is the threshold only because the hook loads a skill once per session: later
  moments in the same session count unloaded by construction, which puts a floor under the gap that
  is an artifact rather than a fault. The rule names that artifact as its third cause for exactly
  this reason, and carries `skillSessions` beside the ratio so a reader can tell.
- **Mechanism:** a declaration in `usage-rules.json`, not code - a threshold a reader must be able
  to weigh has to be readable without opening a module. The cause is `known` and the list is closed
  by the mechanism.
- **Retire when:** the rule has not fired in two months of the review's history, or its findings
  have produced no merged proposal - either says the threshold is wrong or the rule is not worth
  the reading.
- **Landed:** #2214
