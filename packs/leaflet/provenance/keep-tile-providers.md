## 2026-07-23 · born · Add leaflet pack (distilled from EdFringeNow) (#403)
- **Source:** `js/app.js` `initMap()` in EdFringeNow, whose OSM tile layer carries the attribution
  string and `maxZoom: 19`.
- **Reason:** the ground is a licence term, not taste: OpenStreetMap's tile-usage policy requires
  visible attribution, so stripping the `attribution` string while tidying the UI breaks the
  licence. The companion `maxZoom: 19` matches the real ceiling of OSM's tiles, so Leaflet does not
  request levels the provider does not serve. Recovered from the rule's own pre-#467 text.
- **Actor:** the weekly pack-discovery run, merged by @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** a `RULES.md` rule.
- **Retire when:** reaffirm against the current OSM tile-usage policy and its zoom ceiling; retire
  only for a provider whose terms differ.
- **Landed:** #403 (Refs #303) · pack version 1.
