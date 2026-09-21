## 2026-09-21 · born · the symptom its result trigger names follows most calls of that tool (the symptom after half the calls, over ten) (#2214)
- **Source:** docs/usage-review/DESIGN.md §3, the owner's design of 2026-09-21, implemented as
  written.
- **Reason:** A symptom that follows most calls of a tool is not a symptom - it is the tool's
  ordinary output, or advice that belongs before the call. Half is the point at which "when this
  goes wrong" stops describing the pattern.
- **Mechanism:** a declaration in `usage-rules.json`, not code - a threshold a reader must be able
  to weigh has to be readable without opening a module. The cause is `probable` and the list is
  closed by the mechanism.
- **Retire when:** the rule has not fired in two months of the review's history, or its findings
  have produced no merged proposal - either says the threshold is wrong or the rule is not worth
  the reading.
- **Landed:** #2214
