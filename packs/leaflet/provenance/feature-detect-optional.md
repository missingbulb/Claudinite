## 2026-07-23 · born · Add leaflet pack (distilled from EdFringeNow) (#403)
- **Source:** `js/app.js` `renderMarkers()` in EdFringeNow, where the cluster group is created only
  behind a `typeof` guard and each marker falls back to `marker.addTo(map)`.
- **Actor:** the weekly pack-discovery run, merged by @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** a `RULES.md` rule.
- **Landed:** #403 (Refs #303) · pack version 1.
