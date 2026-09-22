## 2026-07-18 · born · Lessons from the vendored-mount hardening session (#343)
- **Reason:** a silently-undefined injected input does not crash; it interpolates into every
  downstream prompt, and a fan-out panel reviewed "undefined" in place of its proposal.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a guideline of the unattended-agents skill, triggered on "An orchestration script
  must validate its injected inputs at entry and fail fast - a silently-missing input degrades every
  downstream agent invisibly.".
- **Landed:** #343.
