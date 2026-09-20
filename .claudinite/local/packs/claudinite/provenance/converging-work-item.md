## 2026-09-06 · born · converted from references.md (RULES-77)
- **Reason:** Owner ruling, 2026-09-06 (#1835): *"A task that is closed with a label 'needs human'
  is ok. It's closed. A task that has its PR closed and not merged, and the issue remained open -
  should be closed by the janitor to say the task was rejected."* Widens #1489's `done`-only close
  to both terminals and retires the design's earlier "a rejected terminal stands on the open issue";
  janitor rule H (#1526) was already closing such items a day later, so the old decision only
  survived in the corpus.
- **Mechanism:** prose
- **Retire when:** Retire the rule if a terminal ever gains a state a person is expected to answer
  on the issue itself.
