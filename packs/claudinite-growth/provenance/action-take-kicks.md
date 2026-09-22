## 2026-07-12 · born · Growth promote: don't report done before an async triggered process completes (#140)
- **Source:** GoogleCalendarEventCreator's release flow, which warns not to report a release done
  before the triggered packaging workflow finishes.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a guideline of the unattended-agents skill, triggered on "When an action you take
  kicks off an async downstream process whose output matters to what happens next (a merge
  triggering a build/publish/deploy), don't report the task done until that process completes and
  its output exists - poll for it.".
- **Landed:** #140.
