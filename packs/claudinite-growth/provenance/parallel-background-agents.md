## 2026-08-18 · born · Promote 4 lessons from EdFringeNow and TLDR (#985)
- **Source:** TLDR's local pack.
- **Reason:** a shared scratchpad path races and silently truncates.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a guideline of the unattended-agents skill, triggered on "Parallel background
  agents that each dump external content to disk need a collision-proof filename, not a shared
  generic one.".
- **Landed:** #985 (Refs #983).
