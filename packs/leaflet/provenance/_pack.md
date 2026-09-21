## 2026-07-23 · born · Add leaflet pack (distilled from EdFringeNow) (#403)
- **Source:** missingbulb/EdFringeNow, the "Fringe Discover" static site - its `index.html` CDN
  wiring and the map, marker and cluster code in `js/app.js`; the first fleet member seen using
  Leaflet.
- **Reason:** no canon pack owned Leaflet, and the member's usage yielded gotchas true of any
  Leaflet map read cold rather than anything about that site; the member's own scraping is its
  one-off and stayed there.
- **Actor:** the weekly pack-discovery run, merged by @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** the pack manifest, fingerprinted by an actual Leaflet reference - a CDN asset
  (`leaflet@` / `leaflet.js` / `leaflet.css`) in HTML, or an `L.map` / `L.tileLayer` /
  `L.markerClusterGroup` call in source; the marker only suspects the pack, and declaring it stays
  the project's call.
- **Landed:** #403 (Refs #303) · pack version 1.

## 2026-07-27 · reworded · the rules shed their "Grounded in <project file>" notes (#467)
- **Reason:** the notes restate the rule and point at one project's tree from a project-agnostic
  pack. The same sweep cut every rule to its trigger, its instruction and at most one clause of why.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #467 (Refs #123, #466) · pack version 1.

## 2026-09-01 · reaffirmed · the rationale #467 cut is recovered; the grounded-in notes stay cut (#1575)
- **Reason:** the two rules that argue from a ground - the mid-page scroll trap and the OSM
  attribution licence term - lost that ground to the tightening sweep, and a rule whose reason
  nothing records can be reaffirmed on the wrong basis. The per-project "Grounded in" notes were
  re-examined in the same pass and stayed cut.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1575 (Refs #1571) · pack version 60901.1.

## 2026-09-03 · reworded · `RULES.md` carries rules, not a description of the pack (#1634)
- **Reason:** the file opened with a paragraph saying what the pack covers. It changes nothing a
  session does, every session in every declaring repo paid for it, and the README and the manifest's
  `ruleRoutingGuidance` already carried it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1634 (Closes #1632) · pack version 60902.1.
