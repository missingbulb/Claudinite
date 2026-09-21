## 2026-08-09 · declined · a check for any of the four data-freshness rules (#727)
- **Source:** static-website: four rules for the data the page fetches (#727).
- **Reason:** they are judgements about a design, not shapes a check can read off a tree. The one
  left open for revisiting is "the manifest must never be cached", which might be checkable given a
  known manifest path.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #2101 · pack version 60913.2.
