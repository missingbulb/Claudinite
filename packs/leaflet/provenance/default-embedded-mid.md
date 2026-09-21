## 2026-07-23 · born · Add leaflet pack (distilled from EdFringeNow) (#403)
- **Source:** `js/app.js` `initMap()` in EdFringeNow, which constructs the map with
  `scrollWheelZoom: false`.
- **Reason:** the failure mode is a reader trapped mid-page: a map that is not the whole viewport
  but grabs the wheel captures a scroll that was meant for the document. Recovered from the rule's
  own pre-#467 text.
- **Actor:** the weekly pack-discovery run, merged by @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** a `RULES.md` rule.
- **Retire when:** reaffirm while the map is embedded mid-page; retire for a full-viewport map,
  where wheel-zoom is the expected behaviour.
- **Landed:** #403 (Refs #303) · pack version 1.
