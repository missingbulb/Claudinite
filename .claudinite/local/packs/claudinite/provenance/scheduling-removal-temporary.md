## 2026-09-01 · born · converted from references.md (RULES-12)
- **Reason:** #1106: a stamp the tightened parser rejects reads as "no version installed", which
  re-applies every migration record in the corpus — so retiring the tolerance on a date alone does
  more than leave a straggler behind.
- **Mechanism:** prose
- **Retire when:** Retire the rule only if a rejected stamp stops meaning "uninstalled".

## 2026-09-03 · reworded · the gate is a convergence window the change states, never a member census (RULES-12a)
- **Source:** #1637
- **Reason:** Owner reversal. The durable half is "the canon will never know the state of all active
  or inert repos that use it": the converge-confirmable phrasing had already produced four
  tolerances whose gate nothing could ever read, and a plan whose first link was building a fleet
  census. The week given alongside it, "assume that all repos are behaving correctly and clean up
  after themselves in 1 week", sized #1638's cleanup and is not a constant; each change states its
  own window, and major version releases may carry them instead.
- **Actor:** owner
- **Retire when:** Reaffirm while the canon has no census of its members.
