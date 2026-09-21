## 2026-08-12 · born · Claudinite growth: discover canon pack web-scraping (#739)
- **Source:** GoogleCalendarEventCreator's `tasks/create-extractor/scraperapi.mjs`, where a `curl` →
  `fetch` rewrite silently dropped the retryable-status set.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Sonnet 5, Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Porting a fetch to a language-level HTTP client".
- **Landed:** #739 (Refs #717) · pack version 1.
