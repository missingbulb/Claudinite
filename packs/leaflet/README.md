# leaflet pack

Active when the repo references [Leaflet](https://leafletjs.com/) — a CDN asset (`leaflet@` / `leaflet.js` / `leaflet.css`) in HTML, or an `L.map` / `L.tileLayer` / `L.markerClusterGroup` call in JS/TS source. Prose-only (these are runtime/asset-wiring behaviours with no clean static signature).

## Prose (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| Pin + SRI every Leaflet asset | prose |
| Feature-detect plugin, fall back to core | prose |
| Embedded map: scrollWheelZoom false | prose |
| Keep tile attribution + maxZoom | prose |
| divIcon transform on inner span | prose |

Provenance: distilled from `missingbulb/EdFringeNow` (the "Fringe Discover" static site — `index.html` CDN wiring and `js/app.js` map/marker/cluster code), the first fleet member seen using Leaflet.
