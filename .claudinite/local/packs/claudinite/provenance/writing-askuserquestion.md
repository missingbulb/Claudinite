## 2026-09-07 · born · converted from references.md (RULES-79)
- **Reason:** Growth-extract over two independent captured sessions, 2026-09-06 (#1863): issue
  #1736's `AskUserQuestion` offered fix-in-this-PR / report-only / fix-plus-clear-#449 and missed
  the axis the owner actually wanted — *"different PR. I don't want to merge the triage summary"*
  — a 168s round-trip that would have shipped the wrong PR shape unanswered; issue #1831's
  question was phrased in internal jargon ("sourcing the expectation from every pack's tasks...
  should the repo's own endpoint tokenSecret names still be part of it?") and the owner had to
  restate the concrete requirement in plain terms before it could be answered.
- **Mechanism:** prose
- **Retire when:** Retire the rule if a future session finds it already phrasing questions this way
  as a matter of course.
