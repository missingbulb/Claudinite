## 2026-08-12 · born · Claudinite growth: discover canon pack web-scraping (#739)
- **Source:** GoogleCalendarEventCreator's extractor pipeline, where rendered output proved
  non-deterministic across re-records.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Sonnet 5, Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, keyed to the debugging symptom — "A rendered-snapshot
  expectation shifting after a re-record" — rather than to the act that caused it, because a
  reader arrives at it mid-diagnosis.
- **Landed:** #739 (Refs #717) · pack version 1.
