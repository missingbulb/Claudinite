## 2026-09-21 · born · a session could not clear it in two attempts and the Stop hook let it through (a single relent) (#2214)
- **Source:** docs/usage-review/DESIGN.md §3, the owner's design of 2026-09-21, implemented as
  written.
- **Reason:** One is the threshold because a relent is already the hook giving up after two fix
  attempts - the rarity is the signal, and waiting for a second would mean waiting for a second
  session to spend itself on the same unsatisfiable condition.
- **Mechanism:** a declaration in `usage-rules.json`, not code - a threshold a reader must be able
  to weigh has to be readable without opening a module. The cause is `probable` and the list is
  closed by the mechanism.
- **Retire when:** the rule has not fired in two months of the review's history, or its findings
  have produced no merged proposal - either says the threshold is wrong or the rule is not worth
  the reading.
- **Landed:** #2214
