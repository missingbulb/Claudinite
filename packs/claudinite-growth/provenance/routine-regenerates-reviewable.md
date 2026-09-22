## 2026-06-25 · born · Centralize portable lessons from the GoogleCalendarEventCreator working set (8ff4d9d0)
- **Source:** the GoogleCalendarEventCreator working set, reviewed against the whole corpus.
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** a guideline of the unattended-agents skill, triggered on "When a routine
  regenerates a reviewable artifact (a gallery, a snapshot set, a report), surface it in the chat
  the same turn you commit it".
- **Landed:** commit 8ff4d9d0.
