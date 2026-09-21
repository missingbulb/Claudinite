## 2026-08-12 · born · Claudinite growth: discover canon pack web-scraping (#739)
- **Source:** the #717 fleet sweep, which found three members taking data from a site they don't own
  (EdFringeNow's GraphQL scraper, EdFringeAllocator's hydration-blob fetcher and
  GoogleCalendarEventCreator's extractor pipeline), and no canon pack homing the facet.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Sonnet 5, Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Deciding whether to retry a failed request".
- **Landed:** #739 (Refs #717) · pack version 1.
