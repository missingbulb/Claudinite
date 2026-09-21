## 2026-08-12 · born · Claudinite growth: discover canon pack web-scraping (#739)
- **Source:** EdFringeAllocator's `edfringe/fetch.py` and `edfringe/extract.py`, which already split
  a git-ignored HTML cache from a committed raw record.
- **Reason:** the split buys three things at once — re-deriving the normalized output becomes an
  offline operation, so a parser change costs no requests; the committed record doubles as the
  fixture for a self-test of the transform that needs no network; and a field you didn't parse this
  month is still there next month, because the whole object was kept rather than the subset needed
  at the time.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Sonnet 5, Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Deciding what a fetch writes to disk".
- **Landed:** #739 (Refs #717) · pack version 1.

## 2026-09-05 · reworded · the cache-vs-raw-record rationale leaves the rule (#1667)
- **Reason:** the rule keeps its directive; the three things the split buys are the reason behind
  it, not something a session needs in always-loaded prose.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #1667 (Refs #1662) · pack version 60903.2.
