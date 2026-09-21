## 2026-08-12 · born · Claudinite growth: discover canon pack web-scraping (#739)
- **Source:** the #717 fleet sweep, which found three members taking data from a site they don't own
  — EdFringeNow's GraphQL scraper, EdFringeAllocator's hydration-blob fetcher and
  GoogleCalendarEventCreator's extractor pipeline — and no canon pack homing the facet.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Sonnet 5, Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Getting an empty body back" — separated from the
  rest of response-reading because a reader can arrive at it without the bot-wall rule.
- **Landed:** #739 (Refs #717) · pack version 1.
