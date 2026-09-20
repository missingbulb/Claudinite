## 2026-09-01 · born · converted from references.md (RULES-1)
- **Reason:** The failure mode is a reader trapped mid-page: a map that is not the whole viewport
  but grabs the wheel captures a scroll that was meant for the document. Recovered from the rule's
  own pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing for a rule rather than enabling
  it”, before this pack had a references.md to hold it).
- **Mechanism:** prose
- **Retire when:** Reaffirm while the map is embedded mid-page; retire for a full-viewport map,
  where wheel-zoom is the expected behaviour.
