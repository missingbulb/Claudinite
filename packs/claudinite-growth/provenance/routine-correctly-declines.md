## 2026-07-31 · born · Claudinite growth: promote 5 lessons to canon (d2026-07-30) (#577)
- **Source:** GoogleCalendarEventCreator's local pack.
- **Reason:** failing on a decline raises a second triage signal and reports the pipeline as broken.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a guideline of the unattended-agents skill, triggered on "A routine that correctly
  declines has not failed - converge failures, not declines.".
- **Landed:** #577 (Refs #574).
