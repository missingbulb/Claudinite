## 2026-08-12 · born · Claudinite growth: discover canon pack web-scraping (#739)
- **Source:** EdFringeNow's scraper, plus the downstream half folded in from its local
  `edfringe-data` pack - a stage that re-parses or re-offsets a stored value is the same bug from
  the other end. "Cross a time zone exactly once, at the ingest edge" had been removed from the
  baseline prose in #740 as not-a-basics-rule because no pack owned ingest; this rule as first
  written is that rule, from the same evidence, so no canon deletion was outstanding for it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Sonnet 5, Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Converting an instant to the domain's local time".
- **Landed:** #739 (Refs #717) · pack version 1.
