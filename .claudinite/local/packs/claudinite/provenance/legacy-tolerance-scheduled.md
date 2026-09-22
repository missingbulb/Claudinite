## 2026-09-03 · born · Legacy behaves like deprecated: the guideline, the annotation, and the advisories (#1645)
- **Source:** the legacy audit behind #1637 - ~28 declaration sites across `engine/` and `packs/`,
  none of which warned anybody, and one carrying a stated end date that had passed six days earlier
  with nothing arranged to notice.
- **Reason:** `grep -rn '@legacy-tolerance' engine packs` is meant to be the register, which only
  holds if every tolerance carries the annotation and every annotation parses.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a blocking declared check anchored at column 0, which is what tells a tolerance
  point from a `const legacy =` inside a function; its test runs against the real tree rather than
  only a fixture. .claudinite/local/packs/claudinite/declared-checks.json.
- **Landed:** #1645 (Closes #1637).
