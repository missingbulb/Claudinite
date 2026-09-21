## 2026-08-12 · born · Claudinite growth: discover canon pack web-scraping (#739)
- **Source:** the baseline prose, deleted there in the same change, plus
  GoogleCalendarEventCreator's rendering-proxy use. The baseline carried the rendering proxy but
  neither the diagnosis nor the terminal verdict; both land here.
- **Reason:** it is portable, but it can only ever fire for a project fetching a site it does not
  own, which is this pack's entire scope. It had sat in the always-vendored baseline for the same
  reason the time-zone rule briefly did — nothing owned data ingest.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Sonnet 5, Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, keyed to the debugging symptom — "A fetch that works on your
  machine and fails from CI" — rather than to the act that caused it, because a reader arrives at
  it mid-diagnosis.
- **Landed:** #739 (Refs #717) · pack version 1.
